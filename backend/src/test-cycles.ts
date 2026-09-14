/**
 * TESTES AUTOMATIZADOS — CICLOS DE PREMIAÇÃO
 *
 * Cobre:
 * 1. Listagem pública de ciclos (200, mesmo vazia)
 * 2. Participante não pode criar ciclo (403)
 * 3. Criação de ciclo com prêmios funciona (201)
 * 4. Ciclo com período sobreposto a outro é bloqueado (409)
 * 5. Criação de ciclo futuro, sem sobreposição, funciona (201)
 * 6. Edição de nome/datas de ciclo que ainda não começou funciona (200)
 * 7. upsertPrize adiciona/edita um prêmio de posição específica
 * 8. Encerramento automático ao consultar a API (sem ação manual do admin):
 *    - status muda para CLOSED, effectiveStatus também
 *    - pódio (1º/2º/3º) registrado corretamente por totalPoints desc
 *    - prêmios corretos vinculados a cada posição
 *    - TODOS os usuários voltam a totalPoints=0 (nunca por UPDATE direto —
 *      via lançamento CYCLE_RESET no ledger, auditável)
 *    - nível também reflete o reset (volta ao nível mais baixo)
 *    - vencedores e não-vencedores recebem notificação CYCLE_ENDED
 * 9. Conquistas (achievements) NUNCA são resetadas nem re-concedidas —
 *    permanecem vitalícias mesmo após o reset geral de pontos
 * 10. Desempate do pódio em caso de pontuação EXATAMENTE igual: quem chegou
 *     naquele total primeiro vence, NUNCA ordem alfabética do nome
 * 11. Notificação de quem não ficou no pódio cita os nomes dos vencedores
 * 12. Cancelamento de ciclo funciona e não dispara pódio nem reset
 * 13. Exclusão de ciclo já iniciado é bloqueada (422) — só cabe cancelar
 * 14. Exclusão de ciclo que ainda não começou funciona (200)
 */

import http from 'http';
import { app } from './app';

const TEST_PORT = 3978;
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

type LoginBody = { data?: { tokens?: { accessToken?: string }; user?: { id?: string } } };
type Prize = { position: number; title: string; description: string | null };
type Winner = { position: number; pointsAtClose: number; user: { id: string; name: string } };
type CycleBody = {
  data?: {
    id?: string;
    status?: string;
    effectiveStatus?: string;
    name?: string;
    prizes?: Prize[];
    winners?: Winner[];
  };
};
type ListBody = { data?: Array<{ id: string; effectiveStatus: string }> };
type ProfileBody = { data?: { totalPoints?: number; level?: { name?: string } } };
type TransactionsBody = { data?: { transactions?: Array<{ points: number; transactionType: string }> } };
type NotificationsBody = { data?: Array<{ type: string; referenceId: string | null; message: string }> };
type AchievementsBody = { data?: Array<{ achievement: { name: string } }> };

async function main() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES — CICLOS DE PREMIAÇÃO');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`🌐 Servidor de testes Ciclos rodando na porta ${TEST_PORT}...\n`);

  console.log('0️⃣ Obtendo tokens de autenticação...');
  const masterLogin = await reqJson('POST', '/auth/login', { email: 'admin@empresa.com', password: 'admin123' });
  const participantLogin = await reqJson('POST', '/auth/login', { email: 'renan@empresa.com', password: 'user123' });
  const gestorLogin = await reqJson('POST', '/auth/login', { email: 'gestor@empresa.com', password: 'admin123' });
  const beatrizLogin = await reqJson('POST', '/auth/login', { email: 'beatriz@empresa.com', password: 'user123' });
  const carlosLogin = await reqJson('POST', '/auth/login', { email: 'carlos@empresa.com', password: 'user123' });

  const masterToken = (masterLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const participantToken = (participantLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const gestorId = (gestorLogin.data as LoginBody)?.data?.user?.id ?? '';
  const gestorToken = (gestorLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const beatrizId = (beatrizLogin.data as LoginBody)?.data?.user?.id ?? '';
  const beatrizToken = (beatrizLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const carlosId = (carlosLogin.data as LoginBody)?.data?.user?.id ?? '';
  const carlosToken = (carlosLogin.data as LoginBody)?.data?.tokens?.accessToken ?? '';
  const renanId = (participantLogin.data as LoginBody)?.data?.user?.id ?? '';
  assert('Tokens obtidos com sucesso', !!masterToken && !!participantToken && !!gestorId && !!beatrizId && !!carlosId);

  // ── PASSO 1 ────────────────────────────────────────────────────────────────────
  console.log('\n1️⃣ Testando listagem pública de ciclos...');
  const emptyListRes = await reqJson('GET', '/cycles');
  assert('Listagem pública funciona (200 sem token)', emptyListRes.status === 200);

  // ── PASSO 2 ────────────────────────────────────────────────────────────────────
  console.log('\n2️⃣ Testando bloqueio de criação por participante...');
  const forbiddenRes = await reqJson(
    'POST',
    '/cycles',
    { name: 'Ciclo Teste', startDate: '2020-01-01', endDate: '2020-02-01' },
    participantToken,
  );
  assert('Participante não pode criar ciclo (403)', forbiddenRes.status === 403);

  // ── PASSO 3: ciclo A — já no passado, pra testar o encerramento automático ─────
  console.log('\n3️⃣ Testando criação de ciclo com prêmios...');
  const now = new Date();
  const cycleAStart = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const cycleAEnd = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const createARes = await reqJson(
    'POST',
    '/cycles',
    {
      name: 'Ciclo de Testes A',
      startDate: cycleAStart,
      endDate: cycleAEnd,
      prizes: [
        { position: 1, title: 'Vale-compras R$300' },
        { position: 2, title: 'Fone de ouvido Bluetooth' },
        { position: 3, title: 'Camiseta Dry-Fit' },
      ],
    },
    masterToken,
  );
  assert('Criação de ciclo com prêmios funciona (201)', createARes.status === 201);
  const cycleA = (createARes.data as CycleBody)?.data;
  const cycleAId = cycleA?.id ?? '';
  assert('Ciclo tem 3 prêmios cadastrados', cycleA?.prizes?.length === 3);
  assert('effectiveStatus é COMPLETED (data fim já passou, ainda não fechado)', cycleA?.effectiveStatus === 'COMPLETED');

  // ── PASSO 4: sobreposição ────────────────────────────────────────────────────────
  console.log('\n4️⃣ Testando bloqueio de sobreposição de datas...');
  const overlapRes = await reqJson(
    'POST',
    '/cycles',
    { name: 'Ciclo Sobreposto', startDate: cycleAStart, endDate: cycleAEnd },
    masterToken,
  );
  assert('Ciclo com período sobreposto é bloqueado (409)', overlapRes.status === 409);

  // ── PASSO 5: ciclo B — futuro, sem prêmio de 3º lugar ainda ─────────────────────
  console.log('\n5️⃣ Testando criação de ciclo futuro sem sobreposição...');
  const cycleBStart = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const cycleBEnd = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString();
  const createBRes = await reqJson(
    'POST',
    '/cycles',
    {
      name: 'Ciclo de Testes B',
      startDate: cycleBStart,
      endDate: cycleBEnd,
      prizes: [
        { position: 1, title: 'Notebook' },
        { position: 2, title: 'Smartwatch' },
      ],
    },
    masterToken,
  );
  assert('Criação de ciclo futuro funciona (201)', createBRes.status === 201);
  const cycleBId = (createBRes.data as CycleBody)?.data?.id ?? '';

  // Snapshot dos pontos ANTES de qualquer leitura do módulo de ciclos —
  // GET /cycles/:id (usado já no passo 7) dispara o encerramento automático
  // GLOBAL (de qualquer ciclo vencido, não só do que está sendo consultado),
  // então a captura precisa acontecer antes disso, não só no passo 8.
  const beforeCarlos = (await reqJson('GET', '/profile', undefined, carlosToken)).data as ProfileBody;
  const beforeBeatriz = (await reqJson('GET', '/profile', undefined, beatrizToken)).data as ProfileBody;
  const beforeGestor = (await reqJson('GET', '/profile', undefined, gestorToken)).data as ProfileBody;
  const beforeRenan = (await reqJson('GET', '/profile', undefined, participantToken)).data as ProfileBody;
  console.log(
    `   Pontos antes do encerramento — Carlos: ${beforeCarlos.data?.totalPoints}, Beatriz: ${beforeBeatriz.data?.totalPoints}, Gestor: ${beforeGestor.data?.totalPoints}, Renan: ${beforeRenan.data?.totalPoints}`,
  );

  // ── PASSO 6: edição de ciclo ainda não iniciado ──────────────────────────────────
  console.log('\n6️⃣ Testando edição de ciclo que ainda não começou...');
  const updateBRes = await reqJson('PATCH', `/cycles/${cycleBId}`, { name: 'Ciclo de Testes B — Editado' }, masterToken);
  assert('Edição de nome funciona (200)', updateBRes.status === 200);
  assert('Nome refletido na resposta', (updateBRes.data as CycleBody)?.data?.name === 'Ciclo de Testes B — Editado');

  // ── PASSO 7: upsertPrize adiciona a posição 3 ────────────────────────────────────
  console.log('\n7️⃣ Testando upsertPrize (adiciona prêmio do 3º lugar)...');
  const upsertPrizeRes = await reqJson('PUT', `/cycles/${cycleBId}/prizes`, { position: 3, title: 'Fone com fio' }, masterToken);
  assert('upsertPrize funciona (200)', upsertPrizeRes.status === 200);
  const cycleBDetailRes = await reqJson('GET', `/cycles/${cycleBId}`);
  assert('Ciclo B agora tem 3 prêmios', (cycleBDetailRes.data as CycleBody)?.data?.prizes?.length === 3);

  // ── PASSO 8: encerramento automático do ciclo A ──────────────────────────────────
  console.log('\n8️⃣ Testando encerramento automático (sem ação manual do admin)...');

  // Qualquer leitura da API de ciclos já dispara a verificação/encerramento automático
  // (o passo 7 inclusive já deve ter fechado o ciclo A antes de chegarmos aqui).
  const closedDetailRes = await reqJson('GET', `/cycles/${cycleAId}`);
  const closedCycle = (closedDetailRes.data as CycleBody)?.data;
  assert('Ciclo A foi encerrado automaticamente (status CLOSED)', closedCycle?.status === 'CLOSED');
  assert('effectiveStatus também é CLOSED', closedCycle?.effectiveStatus === 'CLOSED');

  const winners = closedCycle?.winners ?? [];
  assert('Pódio tem exatamente 3 vencedores', winners.length === 3);
  const winnerByPosition = new Map(winners.map((w) => [w.position, w]));
  assert(
    '1º lugar é Carlos Eduardo (maior pontuação)',
    winnerByPosition.get(1)?.user.name === 'Carlos Eduardo' && winnerByPosition.get(1)?.pointsAtClose === beforeCarlos.data?.totalPoints,
  );
  assert(
    '2º lugar é Beatriz Santos',
    winnerByPosition.get(2)?.user.name === 'Beatriz Santos' && winnerByPosition.get(2)?.pointsAtClose === beforeBeatriz.data?.totalPoints,
  );
  assert(
    '3º lugar é Gestor de Validação',
    winnerByPosition.get(3)?.user.name === 'Gestor de Validação' && winnerByPosition.get(3)?.pointsAtClose === beforeGestor.data?.totalPoints,
  );

  // Reset geral — TODOS os usuários envolvidos voltam a 0
  const afterCarlos = (await reqJson('GET', '/profile', undefined, carlosToken)).data as ProfileBody;
  const afterBeatriz = (await reqJson('GET', '/profile', undefined, beatrizToken)).data as ProfileBody;
  const afterGestor = (await reqJson('GET', '/profile', undefined, gestorToken)).data as ProfileBody;
  const afterRenan = (await reqJson('GET', '/profile', undefined, participantToken)).data as ProfileBody;
  assert('Pontuação de Carlos foi zerada', afterCarlos.data?.totalPoints === 0);
  assert('Pontuação de Beatriz foi zerada', afterBeatriz.data?.totalPoints === 0);
  assert('Pontuação de Gestor foi zerada', afterGestor.data?.totalPoints === 0);
  assert('Pontuação de Renan (fora do pódio) também foi zerada', afterRenan.data?.totalPoints === 0);
  assert('Nível de Carlos voltou ao mais baixo (Iniciante)', afterCarlos.data?.level?.name === 'Iniciante');

  // Ledger — o reset gerou uma transação CYCLE_RESET, nunca um UPDATE direto
  const carlosTxRes = await reqJson('GET', `/scoring/transactions?userId=${carlosId}&transactionType=CYCLE_RESET`, undefined, masterToken);
  const carlosResetTx = (carlosTxRes.data as TransactionsBody)?.data?.transactions ?? [];
  assert(
    'Reset de Carlos ficou registrado no ledger como CYCLE_RESET',
    carlosResetTx.length === 1 && carlosResetTx[0].points === -(beforeCarlos.data?.totalPoints ?? 0),
  );

  // Notificações — vencedores e não-vencedores
  const carlosNotifRes = await reqJson('GET', '/notifications?limit=50', undefined, carlosToken);
  const carlosNotifs = (carlosNotifRes.data as NotificationsBody)?.data ?? [];
  assert(
    'Carlos (1º lugar) recebeu notificação com o prêmio ganho',
    carlosNotifs.some((n) => n.type === 'CYCLE_ENDED' && n.referenceId === cycleAId && n.message.includes('Vale-compras')),
  );

  const renanNotifRes = await reqJson('GET', '/notifications?limit=50', undefined, participantToken);
  const renanNotifs = (renanNotifRes.data as NotificationsBody)?.data ?? [];
  assert(
    'Renan (fora do pódio) recebeu notificação de reset, sem menção a prêmio',
    renanNotifs.some((n) => n.type === 'CYCLE_ENDED' && n.referenceId === cycleAId && n.message.includes('reiniciadas')),
  );

  // ── PASSO 9: conquistas nunca resetam ────────────────────────────────────────────
  console.log('\n9️⃣ Testando que conquistas permanecem vitalícias após o reset...');
  const bonusRes = await reqJson('POST', '/scoring/manual', { userId: renanId, transactionType: 'BONUS', points: 1100, description: 'Bônus de teste para desbloquear conquista de 1000 pontos.' }, masterToken);
  assert('Bônus de teste aplicado (201)', bonusRes.status === 201);
  const achievementsAfterFirstBonusRes = await reqJson('GET', `/achievements/users/${renanId}`, undefined, participantToken);
  const achievementsAfterFirstBonus = (achievementsAfterFirstBonusRes.data as AchievementsBody)?.data ?? [];
  assert(
    '"Clube dos 1.000" foi desbloqueada pela primeira vez',
    achievementsAfterFirstBonus.filter((a) => a.achievement.name === 'Clube dos 1.000').length === 1,
  );

  // Cria e força o encerramento de um segundo ciclo, resetando Renan de novo.
  const cycleCStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const cycleCEnd = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
  await reqJson('POST', '/cycles', { name: 'Ciclo de Testes C', startDate: cycleCStart, endDate: cycleCEnd }, masterToken);
  await reqJson('GET', '/cycles'); // dispara o encerramento automático do ciclo C

  const renanAfterSecondResetRes = await reqJson('GET', '/profile', undefined, participantToken);
  assert('Renan foi resetado novamente pelo ciclo C', (renanAfterSecondResetRes.data as ProfileBody).data?.totalPoints === 0);

  // Ganha 1000+ pontos de novo — a conquista NÃO deve ser concedida uma segunda vez.
  await reqJson('POST', '/scoring/manual', { userId: renanId, transactionType: 'BONUS', points: 1100, description: 'Segundo bônus, após reset de ciclo.' }, masterToken);
  const achievementsAfterSecondBonusRes = await reqJson('GET', `/achievements/users/${renanId}`, undefined, participantToken);
  const achievementsAfterSecondBonus = (achievementsAfterSecondBonusRes.data as AchievementsBody)?.data ?? [];
  assert(
    '"Clube dos 1.000" continua concedida só 1 vez, mesmo após novo reset e nova pontuação ≥ 1000',
    achievementsAfterSecondBonus.filter((a) => a.achievement.name === 'Clube dos 1.000').length === 1,
  );

  // ── PASSO 10: desempate por quem chegou primeiro, nunca por nome ─────────────────
  console.log('\n🔟 Testando desempate do pódio por quem chegou primeiro (não por nome)...');
  // Carlos e Beatriz estão ambos a 0 (resetados no passo 8). Dá a mesma
  // pontuação pros dois, em momentos diferentes — Carlos primeiro. Se o
  // desempate fosse por nome, Beatriz ("B") venceria Carlos ("C"); pelo
  // critério correto (quem chegou primeiro), Carlos deve vencer. O valor
  // (2500) precisa superar o que Renan já acumulou no passo 9 (1100), pra
  // garantir que só Carlos/Beatriz disputem o 1º/2º lugar deste ciclo —
  // Renan (1100) fica em 3º, e Gestor (ganha só 5, abaixo de todo mundo)
  // fica de fora do pódio, sobrando como alguém não-vencedor mas com pontos
  // != 0 pra testar a notificação de reset com a menção ao pódio.
  await reqJson('POST', '/scoring/manual', { userId: carlosId, transactionType: 'BONUS', points: 2500, description: 'Empate de teste — Carlos primeiro.' }, masterToken);
  await new Promise((resolve) => setTimeout(resolve, 50));
  await reqJson('POST', '/scoring/manual', { userId: beatrizId, transactionType: 'BONUS', points: 2500, description: 'Empate de teste — Beatriz depois.' }, masterToken);
  await reqJson('POST', '/scoring/manual', { userId: gestorId, transactionType: 'BONUS', points: 5, description: 'Pontos mínimos de teste, fora do pódio.' }, masterToken);

  const cycleEStart = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const cycleEEnd = new Date(now.getTime() - 1000).toISOString();
  const createERes = await reqJson(
    'POST',
    '/cycles',
    { name: 'Ciclo de Testes E (desempate)', startDate: cycleEStart, endDate: cycleEEnd, prizes: [{ position: 1, title: 'Prêmio do 1º' }] },
    masterToken,
  );
  const cycleEId = (createERes.data as CycleBody)?.data?.id ?? '';

  const cycleEDetailRes = await reqJson('GET', `/cycles/${cycleEId}`);
  const cycleEWinners = (cycleEDetailRes.data as CycleBody)?.data?.winners ?? [];
  const cycleEWinnerByPosition = new Map(cycleEWinners.map((w) => [w.position, w]));
  assert(
    'Carlos (chegou primeiro) fica em 1º, apesar de "Beatriz" vir antes em ordem alfabética',
    cycleEWinnerByPosition.get(1)?.user.name === 'Carlos Eduardo',
  );
  assert('Beatriz (chegou depois, mesma pontuação) fica em 2º', cycleEWinnerByPosition.get(2)?.user.name === 'Beatriz Santos');

  // ── PASSO 11: notificação de quem não ganhou cita os vencedores ─────────────────
  // Gestor ganhou só 5 pontos de teste (abaixo de todo mundo) — fica de fora
  // do pódio (que agora é Carlos/Beatriz/Renan), mas como tinha pontos != 0
  // é resetado e recebe a notificação genérica, que deve citar o pódio.
  console.log('\n1️⃣1️⃣ Testando que a notificação de reset cita os vencedores pelo nome...');
  const gestorNotifAfterERes = await reqJson('GET', '/notifications?limit=50', undefined, gestorToken);
  const gestorNotifsAfterE = (gestorNotifAfterERes.data as NotificationsBody)?.data ?? [];
  assert(
    'Gestor (fora do pódio do ciclo E) recebeu notificação citando "1º Carlos Eduardo, 2º Beatriz Santos, 3º Renan Lima"',
    gestorNotifsAfterE.some(
      (n) =>
        n.type === 'CYCLE_ENDED' &&
        n.referenceId === cycleEId &&
        n.message.includes('1º Carlos Eduardo, 2º Beatriz Santos, 3º Renan Lima'),
    ),
  );

  // ── PASSO 12: cancelamento não dispara pódio nem reset ───────────────────────────
  console.log('\n1️⃣2️⃣ Testando cancelamento de ciclo...');
  const cancelRes = await reqJson('POST', `/cycles/${cycleBId}/cancel`, undefined, masterToken);
  assert('Cancelamento funciona (200)', cancelRes.status === 200);
  assert('effectiveStatus é CANCELLED', (cancelRes.data as CycleBody)?.data?.effectiveStatus === 'CANCELLED');

  // ── PASSO 13-14: exclusão ────────────────────────────────────────────────────────
  console.log('\n1️⃣3️⃣ Testando regras de exclusão de ciclo...');
  const deleteStartedRes = await reqJson('DELETE', `/cycles/${cycleAId}`, undefined, masterToken);
  assert('Exclusão de ciclo já iniciado/encerrado é bloqueada (422)', deleteStartedRes.status === 422);

  const cycleDStart = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const cycleDEnd = new Date(now.getTime() + 40 * 24 * 60 * 60 * 1000).toISOString();
  const createDRes = await reqJson('POST', '/cycles', { name: 'Ciclo de Testes D', startDate: cycleDStart, endDate: cycleDEnd }, masterToken);
  const cycleDId = (createDRes.data as CycleBody)?.data?.id ?? '';
  const deleteNotStartedRes = await reqJson('DELETE', `/cycles/${cycleDId}`, undefined, masterToken);
  assert('Exclusão de ciclo que ainda não começou funciona (200)', deleteNotStartedRes.status === 200);

  server.close();

  console.log('\n====================================================');
  if (failed === 0) {
    console.log(`🎉 TODOS OS ${passed} TESTES DE CICLOS DE PREMIAÇÃO PASSARAM COM SUCESSO!`);
  } else {
    console.error(`❌ ${failed} TESTE(S) FALHARAM de ${passed + failed} total.`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Erro fatal durante os testes de ciclos:', err);
  process.exit(1);
});
