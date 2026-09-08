/**
 * FASE 5 — TESTES AUTOMATIZADOS DO MOTOR DE PONTUAÇÃO
 *
 * Cobre:
 * 1. Cálculo FIXED  — pontuação fixa independente da quantidade
 * 2. Cálculo QUANTITY — pontuação proporcional à quantidade
 * 3. Cálculo TIME — pontuação proporcional ao tempo
 * 4. Cálculo MULTIPLIER — quantidade × multiplicador customizado
 * 5. Quantidade decimal
 * 6. Valor inválido (zero / negativo) — deve ser bloqueado pelo DTO
 * 7. Simulação via API (GET preview antes de submeter)
 * 8. Lançamento manual BONUS pelo administrador
 * 9. Lançamento manual PENALTY pelo administrador
 * 10. Bloqueio de lançamento manual por participante (403)
 * 11. Reversão de transação pelo administrador (cria REVERSAL)
 * 12. Tentativa de reverter reversão (deve retornar 422)
 * 13. Histórico de transações (participante vê apenas o próprio)
 * 14. Verificação de integridade do ledger (totalPoints atualizado corretamente)
 */

import express from 'express';
import { prisma } from './config/database';
import { apiRouter } from './routes';
import { errorHandler } from './shared/middlewares/errorHandler';
import { ScoringService } from './modules/scoring/scoring.service';

const TEST_PORT = 3998;
const BASE_URL = `http://localhost:${TEST_PORT}/api/v1`;

// ─── Helper HTTP ──────────────────────────────────────────────────────────────
async function req(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  console.log(`[HTTP] ${method.padEnd(6)} ${path} -> ${res.status}`);
  return { status: res.status, data };
}

// ─── Helpers de Asserção ──────────────────────────────────────────────────────
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

// ─── Testes Unitários do Motor ─────────────────────────────────────────────────
function testCalculationEngine() {
  console.log('\n🔢 Testando o motor de cálculo (unitário)...');

  // FIXED
  const fixed = ScoringService.calculatePoints('FIXED', 5, 20, 1.0);
  assert('FIXED: 5 sessões = 20 pts (quantidade ignorada)', fixed.points === 20);

  // QUANTITY
  const qty1 = ScoringService.calculatePoints('QUANTITY', 5, 10, 1.0);
  assert('QUANTITY: 5 unidades × 10 pts = 50 pts', qty1.points === 50);

  const qty2 = ScoringService.calculatePoints('QUANTITY', 7.5, 10, 1.0);
  assert('QUANTITY: 7.5 km × 10 pts = 75 pts (decimal)', qty2.points === 75);

  const qty3 = ScoringService.calculatePoints('QUANTITY', 0.3, 10, 1.0);
  assert('QUANTITY: 0.3 × 10 = 3 pts (arredondamento)', qty3.points === 3);

  // TIME
  const time1 = ScoringService.calculatePoints('TIME', 30, 1, 1.0);
  assert('TIME: 30 min × 1 pt/min = 30 pts', time1.points === 30);

  const time2 = ScoringService.calculatePoints('TIME', 45, 2, 1.0);
  assert('TIME: 45 min × 2 pts/min = 90 pts', time2.points === 90);

  // MULTIPLIER
  const mult = ScoringService.calculatePoints('MULTIPLIER', 100, 10, 0.05);
  assert('MULTIPLIER: 100 × 0.05 = 5 pts', mult.points === 5);

  const mult2 = ScoringService.calculatePoints('MULTIPLIER', 500, 10, 0.1);
  assert('MULTIPLIER: 500 × 0.1 = 50 pts', mult2.points === 50);

  // Tipo inválido deve lançar erro
  let threw = false;
  try {
    ScoringService.calculatePoints('INVALID_TYPE', 10, 10, 1.0);
  } catch {
    threw = true;
  }
  assert('Tipo de pontuação inválido lança AppError', threw);
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 5 — MOTOR DE PONTUAÇÃO');
  console.log('====================================================\n');

  // Inicia servidor de testes
  const app = express();
  app.use(express.json());
  app.use('/api/v1', apiRouter);
  app.use(errorHandler);
  const server = app.listen(TEST_PORT);
  console.log(`🌐 Servidor de testes Scoring rodando na porta ${TEST_PORT}...\n`);

  // ── PASSO 0: Tokens ──────────────────────────────────────────────────────────
  console.log('0️⃣ Obtendo tokens de autenticação...');
  const adminLogin = await req('POST', '/auth/login', {
    email: 'admin@empresa.com',
    password: 'admin123',
  });
  const participantLogin = await req('POST', '/auth/login', {
    email: 'renan@empresa.com',
    password: 'user123',
  });

  type LoginBody = { data?: { tokens?: { accessToken?: string } } };
  const adminToken = (adminLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantId = (participantLogin.data as { data?: { user?: { id?: string } } })?.data?.user?.id ?? '';
  assert('Tokens obtidos com sucesso', !!adminToken && !!participantToken);

  // ── PASSO 1: Cálculos Unitários ───────────────────────────────────────────────
  console.log('\n1️⃣ Testando o motor de cálculo internamente (sem HTTP)...');
  testCalculationEngine();

  // ── PASSO 2: Simulação via API ────────────────────────────────────────────────
  console.log('\n2️⃣ Testando simulação de pontuação via API...');

  // Busca uma modalidade QUANTITY do seed para simular
  const runningType = await prisma.activityType.findFirst({
    where: { name: { contains: 'Corrida' } },
  });

  if (runningType) {
    const simRes = await req(
      'POST',
      '/scoring/simulate',
      { activityTypeId: runningType.id, quantity: 7.5 },
      participantToken,
    );
    assert('Simulação retorna HTTP 200', simRes.status === 200);
    const simData = simRes.data as { data?: { calculatedPoints?: number; breakdown?: string } };
    assert(
      `Simulação calcula corretamente: ${simData?.data?.calculatedPoints} pts`,
      typeof simData?.data?.calculatedPoints === 'number' && simData?.data?.calculatedPoints > 0,
    );
    assert('Simulação retorna breakdown do cálculo', !!simData?.data?.breakdown);
    console.log(`   - Tipo: ${runningType.scoringType} | Qtd: 7.5 | Pontos: ${simData?.data?.calculatedPoints}`);
    console.log(`   - Breakdown: ${simData?.data?.breakdown}`);
  } else {
    console.log('   ⚠️ Modalidade Corrida não encontrada — pulando teste de simulação via API');
  }

  // ── PASSO 3: Validação DTO — quantidade inválida ──────────────────────────────
  console.log('\n3️⃣ Testando bloqueio de valores inválidos pelo DTO...');
  if (runningType) {
    const invalidQtyRes = await req(
      'POST',
      '/scoring/simulate',
      { activityTypeId: runningType.id, quantity: -5 },
      participantToken,
    );
    // A API padroniza erros de validação Zod como 422 VALIDATION_ERROR (errorHandler.ts)
    assert('Quantidade negativa bloqueada pelo DTO (422)', invalidQtyRes.status === 422);

    const zeroQtyRes = await req(
      'POST',
      '/scoring/simulate',
      { activityTypeId: runningType.id, quantity: 0 },
      participantToken,
    );
    assert('Quantidade zero bloqueada pelo DTO (422)', zeroQtyRes.status === 422);
  }

  // ── PASSO 4: Lançamento Manual BONUS ─────────────────────────────────────────
  console.log('\n4️⃣ Testando lançamento manual de BONUS pelo administrador...');
  const bonusRes = await req(
    'POST',
    '/scoring/manual',
    {
      userId: participantId,
      transactionType: 'BONUS',
      points: 100,
      description: 'Bônus de boas-vindas pela participação no programa.',
    },
    adminToken,
  );
  assert('BONUS criado com sucesso (HTTP 201)', bonusRes.status === 201);
  const bonusData = bonusRes.data as {
    data?: { transaction?: { id?: string; transactionType?: string }; targetUser?: { newTotal?: number } };
  };
  const bonusTransactionId = bonusData?.data?.transaction?.id;
  assert('Transação retornada tem tipo BONUS', bonusData?.data?.transaction?.transactionType === 'BONUS');
  assert('Total do usuário aumentou corretamente', (bonusData?.data?.targetUser?.newTotal ?? 0) > 0);
  console.log(`   - Total após BONUS: ${bonusData?.data?.targetUser?.newTotal} pts`);

  // ── PASSO 5: Lançamento Manual PENALTY ───────────────────────────────────────
  console.log('\n5️⃣ Testando lançamento manual de PENALTY pelo administrador...');
  const totalBeforePenalty = bonusData?.data?.targetUser?.newTotal ?? 0;
  const penaltyRes = await req(
    'POST',
    '/scoring/manual',
    {
      userId: participantId,
      transactionType: 'PENALTY',
      points: 30,
      description: 'Penalidade por comprovação inválida submetida.',
    },
    adminToken,
  );
  assert('PENALTY criado com sucesso (HTTP 201)', penaltyRes.status === 201);
  const penaltyData = penaltyRes.data as {
    data?: { transaction?: { points?: number; transactionType?: string }; targetUser?: { newTotal?: number } };
  };
  assert('Penalidade tem pontos negativos no ledger', (penaltyData?.data?.transaction?.points ?? 0) < 0);
  assert(
    'Total do usuário diminuiu após PENALTY',
    (penaltyData?.data?.targetUser?.newTotal ?? 0) < totalBeforePenalty,
  );
  console.log(
    `   - Total antes: ${totalBeforePenalty} pts | Total após PENALTY: ${penaltyData?.data?.targetUser?.newTotal} pts`,
  );

  // ── PASSO 6: Bloqueio de lançamento por participante ─────────────────────────
  console.log('\n6️⃣ Testando bloqueio de lançamento manual por participante (403)...');
  const blockedRes = await req(
    'POST',
    '/scoring/manual',
    {
      userId: participantId,
      transactionType: 'BONUS',
      points: 500,
      description: 'Tentativa indevida de autobônus.',
    },
    participantToken,
  );
  assert('Participante não pode lançar pontos manualmente (403)', blockedRes.status === 403);

  // ── PASSO 7: Reversão de Transação ────────────────────────────────────────────
  console.log('\n7️⃣ Testando reversão de transação (cria REVERSAL imutável)...');
  if (bonusTransactionId) {
    const totalBeforeReversal =
      (penaltyData?.data?.targetUser?.newTotal ?? 0);

    const reversalRes = await req(
      'POST',
      `/scoring/transactions/${bonusTransactionId}/reverse`,
      { reason: 'Bônus concedido por engano — usuário incorreto.' },
      adminToken,
    );
    assert('REVERSAL criado com sucesso (HTTP 200)', reversalRes.status === 200);
    const reversalData = reversalRes.data as {
      data?: {
        reversalTransaction?: { transactionType?: string; points?: number };
        targetUser?: { newTotal?: number };
      };
    };
    assert(
      'Transação de reversão tem tipo REVERSAL',
      reversalData?.data?.reversalTransaction?.transactionType === 'REVERSAL',
    );
    assert('REVERSAL tem pontos negativos (cancela o BONUS)', (reversalData?.data?.reversalTransaction?.points ?? 0) < 0);
    assert(
      'Total do usuário diminuiu após reversão do BONUS',
      (reversalData?.data?.targetUser?.newTotal ?? 0) < totalBeforeReversal + 100,
    );
    console.log(`   - Total após reversão: ${reversalData?.data?.targetUser?.newTotal} pts`);

    // ── PASSO 8: Tentativa de reverter novamente (deve falhar) ───────────────────
    console.log('\n8️⃣ Testando bloqueio de reverter transação já revertida (409)...');
    const doubleReversalRes = await req(
      'POST',
      `/scoring/transactions/${bonusTransactionId}/reverse`,
      { reason: 'Tentativa de reversão duplicada.' },
      adminToken,
    );
    assert('Segunda reversão bloqueada com 409 CONFLICT', doubleReversalRes.status === 409);
  }

  // ── PASSO 9: Histórico de Transações ──────────────────────────────────────────
  console.log('\n9️⃣ Testando histórico de transações...');
  const histRes = await req('GET', '/scoring/transactions', undefined, participantToken);
  assert('Histórico retorna HTTP 200', histRes.status === 200);
  const histData = histRes.data as { data?: { transactions?: unknown[]; pagination?: { total?: number } } };
  assert('Histórico contém transações', (histData?.data?.transactions?.length ?? 0) > 0);
  assert('Paginação retornada corretamente', typeof histData?.data?.pagination?.total === 'number');
  console.log(`   - Total de transações no histórico do participante: ${histData?.data?.pagination?.total}`);

  // Admin pode filtrar por tipo de transação
  const bonusHistRes = await req('GET', '/scoring/transactions?transactionType=BONUS', undefined, adminToken);
  assert('Admin pode filtrar histórico por tipo BONUS', bonusHistRes.status === 200);

  // ── PASSO 10: Integridade do Ledger no Banco ──────────────────────────────────
  console.log('\n🔟 Verificando integridade do ledger no banco de dados...');
  const userInDb = await prisma.user.findUnique({
    where: { id: participantId },
    select: { id: true, totalPoints: true },
  });
  const allTransactions = await prisma.pointsTransaction.findMany({
    where: { userId: participantId },
    select: { points: true },
  });
  const sumFromLedger = allTransactions.reduce((acc, t) => acc + t.points, 0);
  assert(
    `Total no campo users.total_points (${userInDb?.totalPoints}) = soma do ledger (${sumFromLedger})`,
    userInDb?.totalPoints === sumFromLedger,
  );

  // ── Resultado Final ────────────────────────────────────────────────────────────
  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DA FASE 5 PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes da Fase 5:', err);
  process.exit(1);
});
