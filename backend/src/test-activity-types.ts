import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

async function runActivityTypeTests() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 4 — MODALIDADES');
  console.log('====================================================\n');

  const testPort = 3997;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(testPort, () => {
      console.log(`🌐 Servidor de testes Modalidades rodando na porta ${testPort}...\n`);
      resolve();
    });
  });

  const baseUrl = `http://localhost:${testPort}/api/v1`;

  try {
    // 0. Autenticação dos usuários de teste (Admin e Participante)
    console.log('0️⃣ Obtendo tokens de autenticação...');
    
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@empresa.com', password: 'admin123' }),
    });
    const adminLogin = (await adminLoginRes.json()) as { data: { tokens: { accessToken: string } } };
    const adminToken = adminLogin.data.tokens.accessToken;

    const userLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'renan@empresa.com', password: 'user123' }),
    });
    const userLogin = (await userLoginRes.json()) as { data: { tokens: { accessToken: string } } };
    const userToken = userLogin.data.tokens.accessToken;

    console.log('   ✅ Tokens de Admin e Participante obtidos com sucesso.\n');

    // 1. Teste de Listagem de Modalidades
    console.log('1️⃣ Testando listagem de modalidades GET /activity-types...');
    const listRes = await fetch(`${baseUrl}/activity-types`);
    const listBody = (await listRes.json()) as {
      success: boolean;
      data: Array<{ id: string; name: string; category: string; basePoints: number }>;
    };

    console.log(`   - Status HTTP: ${listRes.status}`);
    console.log(`   - Total de modalidades retornadas: ${listBody.data.length}`);
    for (const mod of listBody.data) {
      console.log(`     * ${mod.name} (${mod.category}) - ${mod.basePoints} pts base`);
    }

    if (!listBody.success || listBody.data.length < 6) {
      throw new Error('Falha ao listar modalidades padrão do seed!');
    }
    const firstModality = listBody.data[0];
    console.log('   ✅ Listagem de modalidades validada com sucesso.\n');

    // 2. Teste de Consulta por ID
    console.log(`2️⃣ Testando busca por ID GET /activity-types/${firstModality.id}...`);
    const getByIdRes = await fetch(`${baseUrl}/activity-types/${firstModality.id}`);
    const getByIdBody = (await getByIdRes.json()) as {
      success: boolean;
      data: { id: string; name: string; rulesDescription: string };
    };

    console.log(`   - Status HTTP: ${getByIdRes.status}`);
    console.log(`   - Modalidade encontrada: ${getByIdBody.data.name}`);
    console.log(`   - Regras configuradas: ${getByIdBody.data.rulesDescription}`);

    if (!getByIdBody.success || getByIdBody.data.id !== firstModality.id) {
      throw new Error('Falha na busca por ID da modalidade!');
    }
    console.log('   ✅ Busca por ID validada com sucesso.\n');

    // 3. Teste de Criação de Modalidade como Administrador (Natação)
    console.log('3️⃣ Testando criação de nova modalidade (Natação) como Administrador...');
    const newModalityData = {
      name: `Natação_${Date.now()}`,
      description: 'Treino de natação em piscina ou mar aberto',
      category: 'SPORTS',
      icon: 'waves',
      rulesDescription: '20 pontos para cada 500 metros nadados (comprovado via smartwatch)',
      scoringType: 'QUANTITY',
      basePoints: 20,
      unit: 'metros',
      multiplier: 0.04, // 500m * 0.04 = 20 pts
      dailyLimit: 3000,
      requiresEvidence: true,
      allowedFileTypes: 'jpg,jpeg,png',
    };

    const createRes = await fetch(`${baseUrl}/activity-types`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(newModalityData),
    });

    const createBody = (await createRes.json()) as {
      success: boolean;
      data: { id: string; name: string; basePoints: number };
    };

    console.log(`   - Status HTTP: ${createRes.status}`);
    console.log(`   - Modalidade criada: ${createBody.data.name} (ID: ${createBody.data.id})`);

    if (createRes.status !== 201 || !createBody.success) {
      throw new Error('Falha na criação de modalidade como administrador!');
    }
    const createdModId = createBody.data.id;
    console.log('   ✅ Criação de modalidade como Administrador validada com sucesso.\n');

    // 4. Teste de Bloqueio de Participante criando modalidade (403 FORBIDDEN)
    console.log('4️⃣ Testando tentativa de criação por usuário Participante (deve retornar 403)...');
    const forbiddenCreateRes = await fetch(`${baseUrl}/activity-types`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: 'Modalidade Não Autorizada',
        basePoints: 100,
      }),
    });

    const forbiddenCreateBody = (await forbiddenCreateRes.json()) as { success: boolean; error: { code: string } };
    console.log(`   - Status HTTP: ${forbiddenCreateRes.status}`);
    console.log(`   - Código de erro: ${forbiddenCreateBody.error.code}`);

    if (forbiddenCreateRes.status !== 403 || forbiddenCreateBody.error.code !== 'FORBIDDEN') {
      throw new Error('Participante conseguiu criar modalidade sem permissão!');
    }
    console.log('   ✅ Bloqueio de participante validado com sucesso.\n');

    // 5. Teste de Conflito de Nome Duplicado (409 CONFLICT)
    console.log('5️⃣ Testando tentativa de criar modalidade com nome duplicado (deve retornar 409)...');
    const duplicateRes = await fetch(`${baseUrl}/activity-types`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(newModalityData),
    });

    const duplicateBody = (await duplicateRes.json()) as { success: boolean; error: { code: string; message: string } };
    console.log(`   - Status HTTP: ${duplicateRes.status}`);
    console.log(`   - Mensagem de erro: ${duplicateBody.error.message}`);

    if (duplicateRes.status !== 409 || duplicateBody.error.code !== 'CONFLICT') {
      throw new Error('Não houve bloqueio de duplicidade de nome de modalidade!');
    }
    console.log('   ✅ Bloqueio de nome duplicado validado com sucesso.\n');

    // 6. Teste de Atualização da Modalidade como Administrador
    console.log(`6️⃣ Testando atualização da modalidade PATCH /activity-types/${createdModId}...`);
    const updateRes = await fetch(`${baseUrl}/activity-types/${createdModId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        basePoints: 25,
        rulesDescription: 'Regras atualizadas: 25 pontos para cada 500 metros nadados',
      }),
    });

    const updateBody = (await updateRes.json()) as {
      success: boolean;
      data: { id: string; basePoints: number; rulesDescription: string };
    };

    console.log(`   - Status HTTP: ${updateRes.status}`);
    console.log(`   - Nova pontuação base: ${updateBody.data.basePoints} pts`);
    console.log(`   - Novas regras: ${updateBody.data.rulesDescription}`);

    if (updateRes.status !== 200 || updateBody.data.basePoints !== 25) {
      throw new Error('Falha ao atualizar dados da modalidade!');
    }
    console.log('   ✅ Atualização de modalidade validada com sucesso.\n');

    // 7. Teste de Exclusão/Desativação da Modalidade
    console.log(`7️⃣ Testando exclusão da modalidade DELETE /activity-types/${createdModId}...`);
    const deleteRes = await fetch(`${baseUrl}/activity-types/${createdModId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const deleteBody = (await deleteRes.json()) as { success: boolean; data: { message: string; status: string } };
    console.log(`   - Status HTTP: ${deleteRes.status}`);
    console.log(`   - Resposta: ${deleteBody.data.message} (Status: ${deleteBody.data.status})`);

    if (deleteRes.status !== 200 || !deleteBody.success) {
      throw new Error('Falha na exclusão da modalidade!');
    }
    console.log('   ✅ Exclusão/Desativação validada com sucesso.\n');

    // 8. Teste de Auditoria das Operações
    console.log('8️⃣ Validando registros de auditoria em audit_logs...');
    const auditLogs = await prisma.auditLog.findMany({
      where: { entity: 'ActivityType', entityId: createdModId },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`   - Total de registros de auditoria para a modalidade: ${auditLogs.length}`);
    for (const log of auditLogs) {
      console.log(`     * [${log.action}] em ${log.createdAt.toISOString()}`);
    }

    if (auditLogs.length < 2) {
      throw new Error('Auditoria não registrou todas as operações na modalidade!');
    }
    console.log('   ✅ Trilha de auditoria das modalidades confirmada com sucesso.\n');

    console.log('====================================================');
    console.log('🎉 TODOS OS TESTES DA FASE 4 PASSARAM COM SUCESSO!');
    console.log('====================================================');
  } catch (error) {
    console.error('❌ Falha nos testes de modalidades:', error);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runActivityTypeTests();
