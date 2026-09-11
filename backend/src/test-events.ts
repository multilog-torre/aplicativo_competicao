import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

async function runEventTests() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DE EVENTOS COMUNITÁRIOS');
  console.log('====================================================\n');

  const testPort = 3995;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(testPort, () => {
      console.log(`🌐 Servidor de testes Eventos rodando na porta ${testPort}...\n`);
      resolve();
    });
  });

  const baseUrl = `http://localhost:${testPort}/api/v1`;

  try {
    // 0. Autenticação
    console.log('0️⃣ Obtendo tokens de autenticação...');
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@empresa.com', password: 'admin123' }),
    });
    const adminLogin = (await adminLoginRes.json()) as { data: { tokens: { accessToken: string } } };
    const adminToken = adminLogin.data.tokens.accessToken;

    const renanLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'renan@empresa.com', password: 'user123' }),
    });
    const renanLogin = (await renanLoginRes.json()) as { data: { user: { id: string }; tokens: { accessToken: string } } };
    const renanToken = renanLogin.data.tokens.accessToken;
    const renanId = renanLogin.data.user.id;

    const carlosLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'carlos@empresa.com', password: 'user123' }),
    });
    const carlosLogin = (await carlosLoginRes.json()) as { data: { user: { id: string }; tokens: { accessToken: string } } };
    const carlosToken = carlosLogin.data.tokens.accessToken;
    const carlosId = carlosLogin.data.user.id;
    console.log('   ✅ Tokens de Admin, Renan (criador) e Carlos (participante) obtidos.\n');

    const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Validação — data no passado deve ser rejeitada
    console.log('1️⃣ Testando validação de data no passado (deve retornar 422)...');
    const pastDateRes = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${renanToken}` },
      body: JSON.stringify({
        title: 'Corrida no passado',
        description: 'Não deveria ser aceita',
        category: 'CORRIDA',
        eventDate: new Date(Date.now() - 86400000).toISOString(),
      }),
    });
    if (pastDateRes.status !== 422) throw new Error('Data no passado não foi rejeitada na criação do evento!');
    console.log('   ✅ Data no passado rejeitada corretamente.\n');

    // 2. Criação do evento como Renan (participante) — nasce PENDING, sem bônus
    console.log('2️⃣ Testando criação de evento por um participante (Renan)...');
    const createRes = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${renanToken}` },
      body: JSON.stringify({
        title: `Corrida do Parque ${Date.now()}`,
        description: 'Corrida de 5km no parque da empresa, aberta a todos.',
        category: 'CORRIDA',
        eventDate: inTwoDays,
        location: 'Parque Ibirapuera, portão 3',
      }),
    });
    const createBody = (await createRes.json()) as { success: boolean; data: { id: string; status: string; bonusPoints: number | null } };
    console.log(`   - Status HTTP: ${createRes.status}`);
    console.log(`   - Evento criado: status=${createBody.data.status}, bonusPoints=${createBody.data.bonusPoints}`);
    if (createRes.status !== 201 || createBody.data.status !== 'PENDING' || createBody.data.bonusPoints !== null) {
      throw new Error('Evento não nasceu PENDING e sem pontuação de bônus!');
    }
    const eventId = createBody.data.id;
    console.log('   ✅ Criação de evento (com aprovação pendente) validada com sucesso.\n');

    // 3. Evento PENDING não aparece na listagem pública de outro usuário
    console.log('3️⃣ Testando que evento PENDING não aparece pra outro usuário (Carlos)...');
    const carlosListRes = await fetch(`${baseUrl}/events`, { headers: { Authorization: `Bearer ${carlosToken}` } });
    const carlosListBody = (await carlosListRes.json()) as { data: Array<{ id: string }> };
    if (carlosListBody.data.some((e) => e.id === eventId)) {
      throw new Error('Evento PENDING apareceu na listagem de um usuário que não é o criador!');
    }
    console.log('   ✅ Evento PENDING oculto de outros usuários, confirmado.\n');

    // 3.1 Mas aparece pro próprio criador via ?mine=true
    const renanMineRes = await fetch(`${baseUrl}/events?mine=true`, { headers: { Authorization: `Bearer ${renanToken}` } });
    const renanMineBody = (await renanMineRes.json()) as { data: Array<{ id: string }> };
    if (!renanMineBody.data.some((e) => e.id === eventId)) {
      throw new Error('Evento PENDING não apareceu pro próprio criador em ?mine=true!');
    }
    console.log('   ✅ Evento PENDING visível pro próprio criador (?mine=true), confirmado.\n');

    // 4. Bloqueio de participação em evento ainda não aprovado
    console.log('4️⃣ Testando bloqueio de inscrição em evento PENDING (deve retornar 422)...');
    const joinPendingRes = await fetch(`${baseUrl}/events/${eventId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${carlosToken}` },
    });
    if (joinPendingRes.status !== 422) throw new Error('Inscrição em evento PENDING não foi bloqueada!');
    console.log('   ✅ Bloqueio de inscrição em evento pendente validado com sucesso.\n');

    // 5. Não-criador não pode excluir o evento de outro
    console.log('5️⃣ Testando bloqueio de exclusão por quem não é o criador (deve retornar 403)...');
    const forbiddenDeleteRes = await fetch(`${baseUrl}/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${carlosToken}` },
    });
    if (forbiddenDeleteRes.status !== 403) throw new Error('Não-criador conseguiu excluir o evento de outra pessoa!');
    console.log('   ✅ Bloqueio de exclusão por terceiros validado com sucesso.\n');

    // 6. Aprovação do evento pelo admin — define o bônus (Regra de Ouro)
    console.log('6️⃣ Testando aprovação do evento pelo admin, definindo 50 pontos de bônus...');
    const approveRes = await fetch(`${baseUrl}/events/${eventId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ bonusPoints: 50 }),
    });
    const approveBody = (await approveRes.json()) as { success: boolean; data: { status: string; bonusPoints: number } };
    console.log(`   - Status HTTP: ${approveRes.status}`);
    console.log(`   - Evento aprovado: status=${approveBody.data.status}, bonusPoints=${approveBody.data.bonusPoints}`);
    if (approveRes.status !== 200 || approveBody.data.status !== 'APPROVED' || approveBody.data.bonusPoints !== 50) {
      throw new Error('Aprovação do evento não definiu status/bônus corretamente!');
    }
    console.log('   ✅ Aprovação com definição de bônus pelo admin validada com sucesso.\n');

    // 6.1 Notificação de aprovação foi enviada ao criador
    const approvalNotif = await prisma.notification.findFirst({ where: { userId: renanId, type: 'EVENT_APPROVED', referenceId: eventId } });
    if (!approvalNotif) throw new Error('Notificação de aprovação não foi criada para o criador do evento!');
    console.log('   ✅ Notificação de aprovação ao criador confirmada.\n');

    // 7. Agora o evento aparece na listagem pública, mesmo sem login
    console.log('7️⃣ Testando que o evento aprovado aparece na listagem pública (sem autenticação)...');
    const publicListRes = await fetch(`${baseUrl}/events`);
    const publicListBody = (await publicListRes.json()) as { data: Array<{ id: string; canJoin: boolean }> };
    const publicEvent = publicListBody.data.find((e) => e.id === eventId);
    if (!publicEvent || !publicEvent.canJoin) {
      throw new Error('Evento aprovado não apareceu (ou não ficou "canJoin") na listagem pública!');
    }
    console.log('   ✅ Evento aprovado visível publicamente e aberto para inscrição, confirmado.\n');

    // 8. Carlos se inscreve
    console.log('8️⃣ Testando inscrição de Carlos no evento aprovado...');
    const joinRes = await fetch(`${baseUrl}/events/${eventId}/join`, { method: 'POST', headers: { Authorization: `Bearer ${carlosToken}` } });
    if (joinRes.status !== 201) throw new Error('Inscrição no evento aprovado falhou!');
    console.log('   ✅ Inscrição validada com sucesso.\n');

    // 8.1 Inscrição duplicada é bloqueada
    const duplicateJoinRes = await fetch(`${baseUrl}/events/${eventId}/join`, { method: 'POST', headers: { Authorization: `Bearer ${carlosToken}` } });
    if (duplicateJoinRes.status !== 409) throw new Error('Inscrição duplicada não foi bloqueada!');
    console.log('   ✅ Bloqueio de inscrição duplicada validado com sucesso.\n');

    // 9. Participante comum não pode ver a lista de participantes (admin-only)
    console.log('9️⃣ Testando bloqueio de acesso à lista de participantes por não-admin (deve retornar 403)...');
    const forbiddenParticipantsRes = await fetch(`${baseUrl}/events/${eventId}/participants`, { headers: { Authorization: `Bearer ${carlosToken}` } });
    if (forbiddenParticipantsRes.status !== 403) throw new Error('Participante comum conseguiu ver a lista de inscritos!');
    console.log('   ✅ Bloqueio de acesso à lista de participantes validado com sucesso.\n');

    // 10. Confirmar presença antes da data do evento é bloqueado
    console.log('🔟 Testando bloqueio de confirmação de presença antes do evento acontecer (deve retornar 422)...');
    const tooEarlyRes = await fetch(`${baseUrl}/events/${eventId}/confirm-attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ attendedUserIds: [carlosId] }),
    });
    if (tooEarlyRes.status !== 422) throw new Error('Confirmação de presença antes do evento acontecer não foi bloqueada!');
    console.log('   ✅ Bloqueio de confirmação antecipada validado com sucesso.\n');

    // 11. Simula o evento já ter acontecido (ajuste direto no banco, só para o teste)
    await prisma.event.update({ where: { id: eventId }, data: { eventDate: new Date(Date.now() - 60_000) } });

    // 12. Confirma presença — só Carlos compareceu — e credita o bônus
    console.log('1️⃣1️⃣ Testando confirmação de presença e crédito do bônus (só Carlos compareceu)...');
    const carlosBefore = await prisma.user.findUniqueOrThrow({ where: { id: carlosId } });
    const confirmRes = await fetch(`${baseUrl}/events/${eventId}/confirm-attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ attendedUserIds: [carlosId] }),
    });
    const confirmBody = (await confirmRes.json()) as { success: boolean; data: { status: string } };
    console.log(`   - Status HTTP: ${confirmRes.status}`);
    console.log(`   - Status do evento após confirmação: ${confirmBody.data.status}`);
    if (confirmRes.status !== 200 || confirmBody.data.status !== 'COMPLETED') {
      throw new Error('Confirmação de presença não travou o evento em COMPLETED!');
    }

    const carlosAfter = await prisma.user.findUniqueOrThrow({ where: { id: carlosId } });
    console.log(`   - Pontos de Carlos: ${carlosBefore.totalPoints} → ${carlosAfter.totalPoints}`);
    // Não assume um delta EXATO de 50: ao cruzar o total de pontos, uma
    // conquista TOTAL_POINTS pode desbloquear automaticamente (Fase 12) e
    // somar pontos próprios — comportamento legítimo e já testado, não um
    // bug desta feature. O que realmente precisa ser garantido é o
    // lançamento EVENT_BONUS específico no ledger, verificado abaixo.
    if (carlosAfter.totalPoints < carlosBefore.totalPoints + 50) {
      throw new Error('Bônus de 50 pontos não foi creditado corretamente para Carlos!');
    }

    const ledgerEntry = await prisma.pointsTransaction.findFirst({
      where: { userId: carlosId, transactionType: 'EVENT_BONUS', referenceId: eventId },
    });
    if (!ledgerEntry || ledgerEntry.points !== 50) {
      throw new Error('Lançamento EVENT_BONUS não foi registrado corretamente no ledger!');
    }

    const participantRow = await prisma.eventParticipant.findUniqueOrThrow({ where: { eventId_userId: { eventId, userId: carlosId } } });
    if (participantRow.status !== 'ATTENDED') {
      throw new Error('Participante que compareceu não ficou com status ATTENDED!');
    }
    console.log('   ✅ Crédito de bônus via ledger e status ATTENDED validados com sucesso.\n');

    // 13. Confirmar presença de novo (evento já COMPLETED) é bloqueado — evita crédito duplicado
    console.log('1️⃣2️⃣ Testando bloqueio de reconfirmação de um evento já concluído (deve retornar 422)...');
    const doubleConfirmRes = await fetch(`${baseUrl}/events/${eventId}/confirm-attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ attendedUserIds: [carlosId] }),
    });
    if (doubleConfirmRes.status !== 422) throw new Error('Reconfirmação de evento já concluído não foi bloqueada — risco de crédito duplicado!');
    console.log('   ✅ Bloqueio de reconfirmação validado com sucesso (sem crédito duplicado).\n');

    // 14. Fluxo de rejeição — outro evento, criado e rejeitado
    console.log('1️⃣3️⃣ Testando rejeição de um segundo evento pelo admin...');
    const createRejectRes = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${renanToken}` },
      body: JSON.stringify({
        title: `Evento a ser rejeitado ${Date.now()}`,
        description: 'Este evento será rejeitado no teste.',
        category: 'OUTRO',
        eventDate: inTwoDays,
      }),
    });
    const createRejectBody = (await createRejectRes.json()) as { data: { id: string } };
    const rejectEventId = createRejectBody.data.id;

    const rejectRes = await fetch(`${baseUrl}/events/${rejectEventId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ reason: 'Data conflita com outro evento já aprovado.' }),
    });
    const rejectBody = (await rejectRes.json()) as { data: { status: string; rejectionReason: string } };
    if (rejectRes.status !== 200 || rejectBody.data.status !== 'REJECTED') {
      throw new Error('Rejeição de evento não funcionou corretamente!');
    }
    const rejectionNotif = await prisma.notification.findFirst({ where: { userId: renanId, type: 'EVENT_REJECTED', referenceId: rejectEventId } });
    if (!rejectionNotif) throw new Error('Notificação de rejeição não foi criada para o criador do evento!');
    console.log('   ✅ Rejeição de evento e notificação ao criador validadas com sucesso.\n');

    // 15. Fluxo de cancelamento — evento aprovado, com participante, cancelado pelo admin
    console.log('1️⃣4️⃣ Testando cancelamento de um evento aprovado com participante inscrito...');
    const createCancelRes = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${renanToken}` },
      body: JSON.stringify({
        title: `Evento a ser cancelado ${Date.now()}`,
        description: 'Este evento será cancelado no teste.',
        category: 'ACADEMIA',
        eventDate: inTwoDays,
      }),
    });
    const createCancelBody = (await createCancelRes.json()) as { data: { id: string } };
    const cancelEventId = createCancelBody.data.id;

    await fetch(`${baseUrl}/events/${cancelEventId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ bonusPoints: 20 }),
    });
    await fetch(`${baseUrl}/events/${cancelEventId}/join`, { method: 'POST', headers: { Authorization: `Bearer ${carlosToken}` } });

    const cancelRes = await fetch(`${baseUrl}/events/${cancelEventId}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } });
    const cancelBody = (await cancelRes.json()) as { data: { status: string } };
    if (cancelRes.status !== 200 || cancelBody.data.status !== 'CANCELLED') {
      throw new Error('Cancelamento de evento não funcionou corretamente!');
    }
    console.log('   ✅ Cancelamento de evento aprovado validado com sucesso.\n');

    // 16. Cancelar a própria inscrição antes do evento acontecer
    console.log('1️⃣5️⃣ Testando cancelamento de inscrição pelo próprio participante (evento ainda não aconteceu)...');
    const createLeaveRes = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${renanToken}` },
      body: JSON.stringify({
        title: `Evento pra testar desistência ${Date.now()}`,
        description: 'Este evento testa o cancelamento de inscrição.',
        category: 'CAMINHADA',
        eventDate: inTwoDays,
      }),
    });
    const createLeaveBody = (await createLeaveRes.json()) as { data: { id: string } };
    const leaveEventId = createLeaveBody.data.id;
    await fetch(`${baseUrl}/events/${leaveEventId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ bonusPoints: 10 }),
    });
    await fetch(`${baseUrl}/events/${leaveEventId}/join`, { method: 'POST', headers: { Authorization: `Bearer ${carlosToken}` } });
    const leaveRes = await fetch(`${baseUrl}/events/${leaveEventId}/leave`, { method: 'POST', headers: { Authorization: `Bearer ${carlosToken}` } });
    if (leaveRes.status !== 200) throw new Error('Cancelamento da própria inscrição falhou!');
    const leftParticipant = await prisma.eventParticipant.findUnique({ where: { eventId_userId: { eventId: leaveEventId, userId: carlosId } } });
    if (leftParticipant) throw new Error('Inscrição não foi removida após "leave"!');
    console.log('   ✅ Cancelamento de inscrição validado com sucesso.\n');

    // 17. Exclusão de evento PENDING pelo próprio criador
    console.log('1️⃣6️⃣ Testando exclusão de evento PENDING pelo próprio criador...');
    const createDeleteRes = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${renanToken}` },
      body: JSON.stringify({
        title: `Evento pra excluir ${Date.now()}`,
        description: 'Este evento será excluído pelo criador no teste.',
        category: 'OUTRO',
        eventDate: inTwoDays,
      }),
    });
    const createDeleteBody = (await createDeleteRes.json()) as { data: { id: string } };
    const deleteEventId = createDeleteBody.data.id;
    const deleteRes = await fetch(`${baseUrl}/events/${deleteEventId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${renanToken}` } });
    if (deleteRes.status !== 200) throw new Error('Exclusão do próprio evento PENDING pelo criador falhou!');
    console.log('   ✅ Exclusão de evento pendente pelo criador validada com sucesso.\n');

    // 17.1 Exclusão de evento já APROVADO (não mais PENDING) deve ser bloqueada
    const deleteApprovedRes = await fetch(`${baseUrl}/events/${leaveEventId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${renanToken}` } });
    if (deleteApprovedRes.status !== 422) throw new Error('Exclusão de evento já aprovado não foi bloqueada!');
    console.log('   ✅ Bloqueio de exclusão de evento não-pendente validado com sucesso.\n');

    console.log('====================================================');
    console.log('🎉 TODOS OS TESTES DE EVENTOS PASSARAM COM SUCESSO!');
    console.log('====================================================');
  } catch (error) {
    console.error('❌ Falha nos testes de eventos:', error);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runEventTests();
