import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

async function runDepartmentTests() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DE GERENCIAMENTO DE DEPARTAMENTOS');
  console.log('====================================================\n');

  const testPort = 3996;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(testPort, () => {
      console.log(`🌐 Servidor de testes Departamentos rodando na porta ${testPort}...\n`);
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

    const userLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'renan@empresa.com', password: 'user123' }),
    });
    const userLogin = (await userLoginRes.json()) as { data: { tokens: { accessToken: string } } };
    const userToken = userLogin.data.tokens.accessToken;
    console.log('   ✅ Tokens de Admin e Participante obtidos com sucesso.\n');

    // 1. Listagem pública
    console.log('1️⃣ Testando listagem pública GET /departments...');
    const listRes = await fetch(`${baseUrl}/departments`);
    const listBody = (await listRes.json()) as { success: boolean; data: Array<{ id: string; name: string; usersCount: number }> };
    console.log(`   - Status HTTP: ${listRes.status}`);
    console.log(`   - Total de departamentos retornados: ${listBody.data.length}`);
    if (!listBody.success || listBody.data.length === 0) {
      throw new Error('Falha ao listar departamentos padrão do seed!');
    }
    console.log('   ✅ Listagem pública validada com sucesso.\n');

    // 2. Bloqueio de criação por participante (403)
    console.log('2️⃣ Testando bloqueio de criação por Participante (deve retornar 403)...');
    const forbiddenRes = await fetch(`${baseUrl}/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ name: 'Departamento Não Autorizado' }),
    });
    const forbiddenBody = (await forbiddenRes.json()) as { success: boolean; error: { code: string } };
    console.log(`   - Status HTTP: ${forbiddenRes.status}`);
    if (forbiddenRes.status !== 403 || forbiddenBody.error.code !== 'FORBIDDEN') {
      throw new Error('Participante conseguiu criar departamento sem permissão!');
    }
    console.log('   ✅ Bloqueio de participante validado com sucesso.\n');

    // 3. Criação como Admin
    console.log('3️⃣ Testando criação de novo departamento como Administrador...');
    const deptName = `Logística_${Date.now()}`;
    const createRes = await fetch(`${baseUrl}/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: deptName, description: 'Equipe de logística e armazém' }),
    });
    const createBody = (await createRes.json()) as { success: boolean; data: { id: string; name: string; status: string } };
    console.log(`   - Status HTTP: ${createRes.status}`);
    console.log(`   - Departamento criado: ${createBody.data.name} (ID: ${createBody.data.id})`);
    if (createRes.status !== 201 || !createBody.success || createBody.data.status !== 'ACTIVE') {
      throw new Error('Falha na criação de departamento como administrador!');
    }
    const createdId = createBody.data.id;
    console.log('   ✅ Criação de departamento validada com sucesso.\n');

    // 4. Nome duplicado (409)
    console.log('4️⃣ Testando criação com nome duplicado (deve retornar 409)...');
    const duplicateRes = await fetch(`${baseUrl}/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: deptName }),
    });
    const duplicateBody = (await duplicateRes.json()) as { success: boolean; error: { code: string } };
    console.log(`   - Status HTTP: ${duplicateRes.status}`);
    if (duplicateRes.status !== 409 || duplicateBody.error.code !== 'CONFLICT') {
      throw new Error('Não houve bloqueio de nome duplicado para departamento!');
    }
    console.log('   ✅ Bloqueio de nome duplicado validado com sucesso.\n');

    // 5. Atualização
    console.log(`5️⃣ Testando atualização PATCH /departments/${createdId}...`);
    const updateRes = await fetch(`${baseUrl}/departments/${createdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ description: 'Equipe de logística, armazém e transporte' }),
    });
    const updateBody = (await updateRes.json()) as { success: boolean; data: { description: string } };
    console.log(`   - Status HTTP: ${updateRes.status}`);
    if (updateRes.status !== 200 || updateBody.data.description !== 'Equipe de logística, armazém e transporte') {
      throw new Error('Falha ao atualizar dados do departamento!');
    }
    console.log('   ✅ Atualização de departamento validada com sucesso.\n');

    // 6. Exclusão definitiva (ninguém vinculado ainda)
    console.log(`6️⃣ Testando exclusão DELETE /departments/${createdId} (sem colaboradores vinculados)...`);
    const deleteRes = await fetch(`${baseUrl}/departments/${createdId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const deleteBody = (await deleteRes.json()) as { success: boolean; data: { message: string; status: string } };
    console.log(`   - Status HTTP: ${deleteRes.status}`);
    console.log(`   - Resposta: ${deleteBody.data.message} (Status: ${deleteBody.data.status})`);
    if (deleteRes.status !== 200 || deleteBody.data.status !== 'DELETED') {
      throw new Error('Departamento sem vínculos não foi excluído definitivamente!');
    }
    console.log('   ✅ Exclusão definitiva validada com sucesso.\n');

    // 7. Soft delete quando há colaboradores vinculados
    console.log('7️⃣ Testando desativação (soft delete) de departamento com colaboradores vinculados...');
    const renanUser = await prisma.user.findUnique({ where: { email: 'renan@empresa.com' } });
    if (!renanUser) throw new Error('Usuário de teste renan@empresa.com não encontrado.');

    const deptWithUsersRes = await fetch(`${baseUrl}/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `Comercial_${Date.now()}` }),
    });
    const deptWithUsersBody = (await deptWithUsersRes.json()) as { data: { id: string } };
    const deptWithUsersId = deptWithUsersBody.data.id;

    await prisma.user.update({ where: { id: renanUser.id }, data: { departmentId: deptWithUsersId } });

    const softDeleteRes = await fetch(`${baseUrl}/departments/${deptWithUsersId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const softDeleteBody = (await softDeleteRes.json()) as { data: { message: string; status: string } };
    console.log(`   - Status HTTP: ${softDeleteRes.status}`);
    console.log(`   - Resposta: ${softDeleteBody.data.message} (Status: ${softDeleteBody.data.status})`);
    if (softDeleteRes.status !== 200 || softDeleteBody.data.status !== 'DEACTIVATED') {
      throw new Error('Departamento com colaborador vinculado não foi apenas desativado!');
    }

    const stillLinkedUser = await prisma.user.findUnique({ where: { id: renanUser.id } });
    if (stillLinkedUser?.departmentId !== deptWithUsersId) {
      throw new Error('Vínculo do colaborador com o departamento desativado foi perdido — histórico quebrado!');
    }
    console.log('   ✅ Desativação (soft delete) preservando histórico validada com sucesso.\n');

    // Restaura o estado original do usuário de teste para não afetar outras suítes
    await prisma.user.update({ where: { id: renanUser.id }, data: { departmentId: null } });

    // 8. Auditoria
    console.log('8️⃣ Validando registros de auditoria em audit_logs...');
    const auditLogs = await prisma.auditLog.findMany({
      where: { entity: 'Department', entityId: createdId },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`   - Total de registros de auditoria para o departamento: ${auditLogs.length}`);
    if (auditLogs.length < 3) {
      throw new Error('Auditoria não registrou todas as operações no departamento!');
    }
    console.log('   ✅ Trilha de auditoria dos departamentos confirmada com sucesso.\n');

    console.log('====================================================');
    console.log('🎉 TODOS OS TESTES DE DEPARTAMENTOS PASSARAM COM SUCESSO!');
    console.log('====================================================');
  } catch (error) {
    console.error('❌ Falha nos testes de departamentos:', error);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runDepartmentTests();
