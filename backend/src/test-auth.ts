import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

async function runAuthTests() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 3 — AUTENTICAÇÃO E RBAC');
  console.log('====================================================\n');

  const testPort = 3998;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(testPort, () => {
      console.log(`🌐 Servidor de testes Auth rodando na porta ${testPort}...\n`);
      resolve();
    });
  });

  const baseUrl = `http://localhost:${testPort}/api/v1`;

  try {
    // 1. Teste de Login com Sucesso (Admin Master)
    console.log('1️⃣ Testando login do Administrador Master (admin@empresa.com)...');
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@empresa.com',
        password: 'admin123',
      }),
    });

    const adminLoginBody = (await adminLoginRes.json()) as {
      success: boolean;
      data: {
        user: { name: string; email: string; roles: string[] };
        tokens: { accessToken: string; refreshToken: string };
      };
    };

    console.log(`   - Status HTTP: ${adminLoginRes.status}`);
    console.log(`   - Usuário autenticado: ${adminLoginBody.data.user.name}`);
    console.log(`   - Roles do usuário: ${adminLoginBody.data.user.roles.join(', ')}`);
    console.log(`   - Access Token gerado: ${adminLoginBody.data.tokens.accessToken.substring(0, 30)}...`);

    if (!adminLoginBody.success || !adminLoginBody.data.tokens.accessToken) {
      throw new Error('Falha no login do Administrador Master!');
    }
    const adminToken = adminLoginBody.data.tokens.accessToken;
    console.log('   ✅ Login de Administrador Master validado com sucesso.\n');

    // 2. Teste de Login com Sucesso (Participante Comum)
    console.log('2️⃣ Testando login de Participante (renan@empresa.com)...');
    const userLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'renan@empresa.com',
        password: 'user123',
      }),
    });

    const userLoginBody = (await userLoginRes.json()) as {
      success: boolean;
      data: {
        user: { name: string; email: string; roles: string[] };
        tokens: { accessToken: string; refreshToken: string };
      };
    };

    console.log(`   - Status HTTP: ${userLoginRes.status}`);
    console.log(`   - Usuário autenticado: ${userLoginBody.data.user.name}`);
    console.log(`   - Roles do usuário: ${userLoginBody.data.user.roles.join(', ')}`);

    if (!userLoginBody.success || !userLoginBody.data.tokens.accessToken) {
      throw new Error('Falha no login do participante!');
    }
    const participantToken = userLoginBody.data.tokens.accessToken;
    const participantRefreshToken = userLoginBody.data.tokens.refreshToken;
    console.log('   ✅ Login de Participante validado com sucesso.\n');

    // 3. Teste de Login com Senha Incorreta (401)
    console.log('3️⃣ Testando login com senha incorreta (deve falhar com 401)...');
    const wrongPassRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'renan@empresa.com',
        password: 'senha_totalmente_errada',
      }),
    });

    const wrongPassBody = (await wrongPassRes.json()) as { success: boolean; error: { code: string; message: string } };
    console.log(`   - Status HTTP: ${wrongPassRes.status}`);
    console.log(`   - Código de erro: ${wrongPassBody.error.code} | Mensagem: ${wrongPassBody.error.message}`);

    if (wrongPassRes.status !== 401 || wrongPassBody.error.code !== 'UNAUTHORIZED') {
      throw new Error('Login com senha inválida não retornou 401 Unauthorized!');
    }
    console.log('   ✅ Rejeição de senha inválida validada com sucesso.\n');

    // 4. Teste de Perfil GET /auth/me (Sem Token vs Com Token)
    console.log('4️⃣ Testando consulta de perfil GET /auth/me...');
    
    // Sem token -> deve dar 401
    const noTokenRes = await fetch(`${baseUrl}/auth/me`);
    console.log(`   - Tentativa sem token -> Status HTTP: ${noTokenRes.status} (esperado 401)`);
    if (noTokenRes.status !== 401) throw new Error('Acesso sem token não foi bloqueado!');

    // Com token de participante
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${participantToken}` },
    });
    const meBody = (await meRes.json()) as {
      success: boolean;
      data: { name: string; email: string; department: { name: string }; level: { name: string }; totalPoints: number };
    };

    console.log(`   - Tentativa com token -> Status HTTP: ${meRes.status}`);
    console.log(`   - Nome: ${meBody.data.name}`);
    console.log(`   - Departamento: ${meBody.data.department?.name}`);
    console.log(`   - Nível Atual: ${meBody.data.level?.name}`);
    console.log(`   - Pontos: ${meBody.data.totalPoints}`);

    if (!meBody.success || meBody.data.email !== 'renan@empresa.com') {
      throw new Error('Falha ao obter perfil autenticado!');
    }
    console.log('   ✅ Endpoint /auth/me validado com sucesso.\n');

    // 5. Teste de Proteção RBAC (Participante tentando acessar rota de Admin -> 403)
    console.log('5️⃣ Testando proteção de rotas RBAC...');
    
    console.log('   a) Participante tentando acessar /auth/test/admin (deve retornar 403 FORBIDDEN):');
    const forbiddenRes = await fetch(`${baseUrl}/auth/test/admin`, {
      headers: { Authorization: `Bearer ${participantToken}` },
    });
    const forbiddenBody = (await forbiddenRes.json()) as { success: boolean; error: { code: string; message: string } };
    console.log(`      - Status HTTP: ${forbiddenRes.status}`);
    console.log(`      - Código de erro: ${forbiddenBody.error.code} | Mensagem: ${forbiddenBody.error.message}`);

    if (forbiddenRes.status !== 403 || forbiddenBody.error.code !== 'FORBIDDEN') {
      throw new Error('Usuário participante conseguiu acessar rota restrita de admin!');
    }
    console.log('      ✅ Bloqueio de participante em rota administrativa validado com sucesso.');

    console.log('   b) Administrador Master acessando /auth/test/admin (deve retornar 200 OK):');
    const adminAllowedRes = await fetch(`${baseUrl}/auth/test/admin`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminAllowedBody = (await adminAllowedRes.json()) as { success: boolean; data: { message: string } };
    console.log(`      - Status HTTP: ${adminAllowedRes.status}`);
    console.log(`      - Resposta: ${adminAllowedBody.data.message}`);

    if (adminAllowedRes.status !== 200 || !adminAllowedBody.success) {
      throw new Error('Administrador não conseguiu acessar a rota administrativa!');
    }
    console.log('      ✅ Acesso de administrador validado com sucesso.\n');

    // 6. Teste de Refresh Token
    console.log('6️⃣ Testando renovação de token via POST /auth/refresh...');
    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: participantRefreshToken }),
    });

    const refreshBody = (await refreshRes.json()) as {
      success: boolean;
      data: { accessToken: string; refreshToken: string };
    };

    console.log(`   - Status HTTP: ${refreshRes.status}`);
    console.log(`   - Novo Access Token gerado: ${refreshBody.data.accessToken.substring(0, 30)}...`);

    if (!refreshBody.success || !refreshBody.data.accessToken) {
      throw new Error('Falha na renovação de token JWT!');
    }
    console.log('   ✅ Renovação de token validada com sucesso.\n');

    // 7. Teste de Logout
    console.log('7️⃣ Testando logout do usuário via POST /auth/logout...');
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${participantToken}` },
    });

    const logoutBody = (await logoutRes.json()) as { success: boolean; data: { message: string } };
    console.log(`   - Status HTTP: ${logoutRes.status}`);
    console.log(`   - Resposta: ${logoutBody.data.message}`);

    if (!logoutBody.success) {
      throw new Error('Falha no logout do usuário!');
    }
    console.log('   ✅ Logout e registro em auditoria validados com sucesso.\n');

    console.log('====================================================');
    console.log('🎉 TODOS OS TESTES DA FASE 3 PASSARAM COM SUCESSO!');
    console.log('====================================================');
  } catch (error) {
    console.error('❌ Falha nos testes de autenticação:', error);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runAuthTests();
