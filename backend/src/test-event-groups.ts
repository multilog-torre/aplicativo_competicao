import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

/**
 * Testes do "grupo" do Mural por evento — a pedido do usuário: só quem
 * participa de um evento vê e posta no grupo dele, e a pessoa pode sair
 * quando quiser (perdendo o acesso, sem afetar pontos já creditados).
 */
async function runEventGroupTests() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DO GRUPO DE EVENTO NO MURAL');
  console.log('====================================================\n');

  const testPort = 3994;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(testPort, () => {
      console.log(`🌐 Servidor de testes Grupo de Evento rodando na porta ${testPort}...\n`);
      resolve();
    });
  });

  const baseUrl = `http://localhost:${testPort}/api/v1`;

  try {
    console.log('0️⃣ Obtendo tokens de autenticação...');
    async function login(email: string, password: string) {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as { data: { user: { id: string }; tokens: { accessToken: string } } };
      return { token: body.data.tokens.accessToken, userId: body.data.user.id };
    }

    const admin = await login('admin@empresa.com', 'admin123');
    const renan = await login('renan@empresa.com', 'user123'); // criador do evento
    const carlos = await login('carlos@empresa.com', 'user123'); // vai participar
    const beatriz = await login('beatriz@empresa.com', 'user123'); // NÃO vai participar
    console.log('   ✅ Tokens obtidos (admin, renan, carlos, beatriz).\n');

    // 1. Cria e aprova um evento
    console.log('1️⃣ Criando e aprovando um evento...');
    const createRes = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${renan.token}` },
      body: JSON.stringify({
        title: `Corrida do Grupo ${Date.now()}`,
        description: 'Evento pra testar o grupo do Mural.',
        category: 'CORRIDA',
        eventDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
    const { data: event } = (await createRes.json()) as { data: { id: string } };
    const eventId = event.id;

    await fetch(`${baseUrl}/events/${eventId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ bonusPoints: 25 }),
    });
    console.log('   ✅ Evento criado e aprovado.\n');

    // 2. Carlos participa, Beatriz não
    await fetch(`${baseUrl}/events/${eventId}/join`, { method: 'POST', headers: { Authorization: `Bearer ${carlos.token}` } });
    console.log('2️⃣ Carlos entrou no evento; Beatriz não entrou.\n');

    // 3. GET /events?participating=true mostra o evento pro Carlos
    console.log('3️⃣ Testando GET /events?participating=true...');
    const participatingRes = await fetch(`${baseUrl}/events?participating=true`, { headers: { Authorization: `Bearer ${carlos.token}` } });
    const participatingBody = (await participatingRes.json()) as { data: Array<{ id: string }> };
    if (!participatingBody.data.some((e) => e.id === eventId)) {
      throw new Error('Evento não apareceu em ?participating=true pro Carlos!');
    }
    console.log('   ✅ Evento aparece na lista de "meus grupos" do Carlos.\n');

    // 4. Não-participante (Beatriz) não pode listar posts do grupo (403)
    console.log('4️⃣ Testando bloqueio de leitura do grupo por não-participante (deve retornar 403)...');
    const beatrizListRes = await fetch(`${baseUrl}/posts?eventId=${eventId}`, { headers: { Authorization: `Bearer ${beatriz.token}` } });
    if (beatrizListRes.status !== 403) throw new Error('Não-participante conseguiu listar posts do grupo do evento!');
    console.log('   ✅ Bloqueio de leitura validado com sucesso.\n');

    // 5. Não-participante não pode postar no grupo (403)
    console.log('5️⃣ Testando bloqueio de publicação no grupo por não-participante (deve retornar 403)...');
    const beatrizPostForm = new FormData();
    beatrizPostForm.append('content', 'Mensagem indevida de quem não participa.');
    beatrizPostForm.append('eventId', eventId);
    const beatrizPostRes = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${beatriz.token}` },
      body: beatrizPostForm,
    });
    if (beatrizPostRes.status !== 403) throw new Error('Não-participante conseguiu publicar no grupo do evento!');
    console.log('   ✅ Bloqueio de publicação validado com sucesso.\n');

    // 6. Carlos (participante) publica no grupo
    console.log('6️⃣ Testando publicação de Carlos no grupo do evento...');
    const carlosPostForm = new FormData();
    carlosPostForm.append('content', 'Alguém mais animado pra corrida? 🏃‍♂️');
    carlosPostForm.append('eventId', eventId);
    const carlosPostRes = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${carlos.token}` },
      body: carlosPostForm,
    });
    const carlosPostBody = (await carlosPostRes.json()) as { success: boolean; data: { id: string; eventId: string | null } };
    if (carlosPostRes.status !== 201 || carlosPostBody.data.eventId !== eventId) {
      throw new Error('Publicação de participante no grupo do evento falhou!');
    }
    const groupPostId = carlosPostBody.data.id;
    console.log('   ✅ Publicação no grupo validada com sucesso.\n');

    // 7. Carlos lista o grupo e vê a própria publicação
    const carlosListRes = await fetch(`${baseUrl}/posts?eventId=${eventId}`, { headers: { Authorization: `Bearer ${carlos.token}` } });
    const carlosListBody = (await carlosListRes.json()) as { data: Array<{ id: string }> };
    if (!carlosListBody.data.some((p) => p.id === groupPostId)) throw new Error('Carlos não vê a própria publicação no grupo!');
    console.log('7️⃣ ✅ Carlos vê a publicação na listagem do grupo.\n');

    // 8. Admin (não participante) também consegue ver o grupo — moderação
    const adminListRes = await fetch(`${baseUrl}/posts?eventId=${eventId}`, { headers: { Authorization: `Bearer ${admin.token}` } });
    if (adminListRes.status !== 200) throw new Error('Admin não conseguiu ver o grupo do evento (moderação)!');
    console.log('8️⃣ ✅ Admin consegue ver o grupo mesmo sem participar (moderação).\n');

    // 9. A publicação do grupo NÃO aparece no Mural geral (isolamento)
    const generalMuralRes = await fetch(`${baseUrl}/posts`, { headers: { Authorization: `Bearer ${carlos.token}` } });
    const generalMuralBody = (await generalMuralRes.json()) as { data: Array<{ id: string }> };
    if (generalMuralBody.data.some((p) => p.id === groupPostId)) {
      throw new Error('Publicação do grupo do evento vazou pro Mural geral!');
    }
    console.log('9️⃣ ✅ Publicação do grupo não aparece no Mural geral (isolamento correto).\n');

    // 10. Beatriz não pode comentar na publicação do grupo (403), mesmo sabendo o ID
    console.log('🔟 Testando bloqueio de comentário de não-participante (deve retornar 403)...');
    const beatrizCommentRes = await fetch(`${baseUrl}/posts/${groupPostId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${beatriz.token}` },
      body: JSON.stringify({ content: 'Comentário indevido.' }),
    });
    if (beatrizCommentRes.status !== 403) throw new Error('Não-participante conseguiu comentar na publicação do grupo!');
    console.log('   ✅ Bloqueio de comentário validado com sucesso.\n');

    // 11. Carlos comenta e curte normalmente
    const carlosCommentRes = await fetch(`${baseUrl}/posts/${groupPostId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${carlos.token}` },
      body: JSON.stringify({ content: 'Eu topo!' }),
    });
    if (carlosCommentRes.status !== 201) throw new Error('Participante não conseguiu comentar na publicação do próprio grupo!');
    console.log('1️⃣1️⃣ ✅ Participante comenta normalmente no grupo.\n');

    // 12. Carlos sai do evento — perde acesso ao grupo, mas o bônus (se já
    // creditado) nunca seria revertido (ledger imutável) — aqui o evento
    // ainda não aconteceu, então não há bônus a preservar; o foco é o acesso.
    console.log('1️⃣2️⃣ Testando saída do evento e perda de acesso ao grupo...');
    const leaveRes = await fetch(`${baseUrl}/events/${eventId}/leave`, { method: 'POST', headers: { Authorization: `Bearer ${carlos.token}` } });
    if (leaveRes.status !== 200) throw new Error('Saída do evento falhou!');

    const afterLeaveListRes = await fetch(`${baseUrl}/posts?eventId=${eventId}`, { headers: { Authorization: `Bearer ${carlos.token}` } });
    if (afterLeaveListRes.status !== 403) throw new Error('Ex-participante ainda consegue ver o grupo depois de sair!');
    console.log('   ✅ Acesso ao grupo revogado corretamente após sair do evento.\n');

    // 13. E também não aparece mais em ?participating=true
    const afterLeaveParticipatingRes = await fetch(`${baseUrl}/events?participating=true`, { headers: { Authorization: `Bearer ${carlos.token}` } });
    const afterLeaveParticipatingBody = (await afterLeaveParticipatingRes.json()) as { data: Array<{ id: string }> };
    if (afterLeaveParticipatingBody.data.some((e) => e.id === eventId)) {
      throw new Error('Evento ainda aparece em ?participating=true depois do Carlos ter saído!');
    }
    console.log('1️⃣3️⃣ ✅ Evento não aparece mais como "meu grupo" depois de sair.\n');

    console.log('====================================================');
    console.log('🎉 TODOS OS TESTES DO GRUPO DE EVENTO PASSARAM COM SUCESSO!');
    console.log('====================================================');
  } catch (error) {
    console.error('❌ Falha nos testes do grupo de evento:', error);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runEventGroupTests();
