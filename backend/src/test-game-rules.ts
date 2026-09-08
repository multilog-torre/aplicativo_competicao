/**
 * FASE 21 — TESTES AUTOMATIZADOS DE REGRAS DO JOGO
 *
 * Cobre:
 * 1. "Como funciona?" é público (sem autenticação) e retorna os 8 passos do seed
 * 2. Passos vêm ordenados por stepNumber
 * 3. Participante não pode criar passo (403)
 * 4. Admin cria um novo passo configurável (201)
 * 5. stepNumber duplicado é bloqueado (409)
 * 6. Admin atualiza um passo existente (200) e a mudança reflete na listagem pública
 * 7. Desativar um passo (status=INACTIVE) o esconde da listagem pública padrão
 * 8. Admin autenticado VÊ os passos INACTIVE ao consultar a listagem
 * 9. Admin exclui um passo definitivamente (sem soft-delete — sem histórico de ledger)
 * 10. Passo inexistente retorna 404
 */

import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

const TEST_PORT = 3981;
const BASE_URL = `http://localhost:${TEST_PORT}/api/v1`;

async function reqJson(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  console.log(`[HTTP] ${method.padEnd(6)} ${path} -> ${res.status}`);
  return { status: res.status, data };
}

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, info?: unknown) {
  if (condition) {
    console.log(`   ✅ ${label}`);
    passed++;
  } else {
    console.error(`   ❌ FALHOU: ${label}`, info ?? '');
    failed++;
  }
}

type StepItem = { id: string; stepNumber: number; title: string; description: string; status: string };
type ListBody = { data?: StepItem[] };

async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 21 — REGRAS DO JOGO');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Regras do Jogo rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const masterLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });

  type LoginBody = { data?: { tokens?: { accessToken?: string } } };
  const masterToken = (masterLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  assert('Tokens obtidos com sucesso', !!masterToken && !!participantToken);

  // ── PASSO 1-2: Listagem pública com os 8 passos do seed, ordenados ────────────
  console.log('\n1️⃣ Testando listagem pública de "Como funciona?"...');
  const listRes = await reqJson('GET', '/game-rules');
  assert('Listagem é pública (200 sem token)', listRes.status === 200);
  const steps = (listRes.data as ListBody)?.data ?? [];
  assert('8 passos do seed presentes', steps.length === 8);
  const isSorted = steps.every((s, i) => i === 0 || steps[i - 1].stepNumber < s.stepNumber);
  assert('Passos vêm ordenados por stepNumber', isSorted);
  assert('Primeiro passo é "Escolha a modalidade"', steps[0]?.title === 'Escolha a modalidade');

  // ── PASSO 3: Bloqueio de criação por participante ─────────────────────────────
  console.log('\n2️⃣ Testando bloqueio de criação por participante...');
  const blockedRes = await reqJson(
    'POST',
    '/game-rules',
    { stepNumber: 99, title: 'Fake', description: 'teste de bloqueio' },
    participantToken,
  );
  assert('Participante não pode criar passo (403)', blockedRes.status === 403);

  // ── PASSO 4-5: Criação e conflito ─────────────────────────────────────────────
  console.log('\n3️⃣ Testando criação de passo configurável pelo admin...');
  const createRes = await reqJson(
    'POST',
    '/game-rules',
    { stepNumber: 9, title: 'Convide colegas', description: 'Convide seus colegas para participar da competição.', icon: 'users' },
    masterToken,
  );
  assert('Passo criado com sucesso (201)', createRes.status === 201);
  type CreateBody = { data?: { id?: string } };
  const newStepId = (createRes.data as CreateBody)?.data?.id ?? '';

  const conflictRes = await reqJson(
    'POST',
    '/game-rules',
    { stepNumber: 9, title: 'Outro título', description: 'descrição de conflito de teste' },
    masterToken,
  );
  assert('stepNumber duplicado é bloqueado (409)', conflictRes.status === 409);

  // ── PASSO 6: Atualização reflete na listagem pública ──────────────────────────
  console.log('\n4️⃣ Testando atualização de passo...');
  const updateRes = await reqJson(
    'PATCH',
    `/game-rules/${newStepId}`,
    { title: 'Convide seus colegas de equipe' },
    masterToken,
  );
  assert('Atualização executada com sucesso (200)', updateRes.status === 200);
  const listAfterUpdateRes = await reqJson('GET', '/game-rules');
  const stepsAfterUpdate = (listAfterUpdateRes.data as ListBody)?.data ?? [];
  assert(
    'Título atualizado reflete na listagem pública',
    stepsAfterUpdate.some((s) => s.id === newStepId && s.title === 'Convide seus colegas de equipe'),
  );

  // ── PASSO 7-8: Desativação e visibilidade admin vs. público ───────────────────
  console.log('\n5️⃣ Testando visibilidade de passo desativado...');
  await reqJson('PATCH', `/game-rules/${newStepId}`, { status: 'INACTIVE' }, masterToken);

  const publicListRes = await reqJson('GET', '/game-rules');
  const publicSteps = (publicListRes.data as ListBody)?.data ?? [];
  assert('Passo INACTIVE some da listagem pública padrão', !publicSteps.some((s) => s.id === newStepId));

  const adminListRes = await reqJson('GET', '/game-rules', undefined, masterToken);
  const adminSteps = (adminListRes.data as ListBody)?.data ?? [];
  assert('Admin autenticado VÊ o passo INACTIVE', adminSteps.some((s) => s.id === newStepId));

  // ── PASSO 9: Exclusão definitiva ──────────────────────────────────────────────
  console.log('\n6️⃣ Testando exclusão definitiva (sem soft-delete)...');
  const deleteRes = await reqJson('DELETE', `/game-rules/${newStepId}`, undefined, masterToken);
  assert('Exclusão retorna 200', deleteRes.status === 200);
  const stillExists = await prisma.gameRuleStep.findUnique({ where: { id: newStepId } });
  assert('Registro foi de fato removido do banco (sem histórico de ledger a preservar)', stillExists === null);

  // ── PASSO 10: Passo inexistente ────────────────────────────────────────────────
  console.log('\n7️⃣ Testando passo inexistente...');
  const notFoundRes = await reqJson('GET', '/game-rules/00000000-0000-0000-0000-000000000000');
  assert('Passo inexistente retorna 404', notFoundRes.status === 404);

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 21 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 21:', err);
  process.exit(1);
});
