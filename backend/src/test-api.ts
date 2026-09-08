import http from 'http';
import { app } from './app';
import { prisma } from './config/database';

async function runApiTests() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 2 — BACKEND BASE & API');
  console.log('====================================================\n');

  const testPort = 3999;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(testPort, () => {
      console.log(`🌐 Servidor de testes rodando na porta ${testPort}...\n`);
      resolve();
    });
  });

  const baseUrl = `http://localhost:${testPort}`;

  try {
    // 1. Teste do Healthcheck
    console.log('1️⃣ Testando endpoint GET /api/v1/health...');
    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    const healthBody = (await healthRes.json()) as {
      success: boolean;
      data: { status: string; message: string; database: { status: string } };
    };

    console.log(`   - Status HTTP: ${healthRes.status}`);
    console.log(`   - Payload retornado:`, JSON.stringify(healthBody, null, 2));

    if (!healthBody.success || healthBody.data.status !== 'HEALTHY' || healthBody.data.database.status !== 'ONLINE') {
      throw new Error('Falha no Healthcheck da API ou no banco de dados!');
    }
    console.log('   ✅ Endpoint /api/v1/health validado com sucesso.\n');

    // 2. Teste do Info
    console.log('2️⃣ Testando endpoint GET /api/v1/info...');
    const infoRes = await fetch(`${baseUrl}/api/v1/info`);
    const infoBody = (await infoRes.json()) as { success: boolean; data: { name: string; version: string } };

    console.log(`   - Status HTTP: ${infoRes.status}`);
    console.log(`   - Nome do Sistema: ${infoBody.data.name}`);
    console.log(`   - Versão: ${infoBody.data.version}`);

    if (!infoBody.success || !infoBody.data.name) {
      throw new Error('Falha no endpoint de informações da API!');
    }
    console.log('   ✅ Endpoint /api/v1/info validado com sucesso.\n');

    // 3. Teste de Rota Inexistente (404 padronizado)
    console.log('3️⃣ Testando tratamento padronizado de erro 404 (Rota Inexistente)...');
    const notFoundRes = await fetch(`${baseUrl}/api/v1/rota-aleatoria-inexistente`);
    const notFoundBody = (await notFoundRes.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };

    console.log(`   - Status HTTP: ${notFoundRes.status}`);
    console.log(`   - Payload de Erro:`, JSON.stringify(notFoundBody, null, 2));

    if (notFoundRes.status !== 404 || notFoundBody.success !== false || notFoundBody.error.code !== 'NOT_FOUND') {
      throw new Error('Tratamento de 404 não está seguindo o padrão de erro da API!');
    }
    console.log('   ✅ Formato padronizado de erro 404 validado com sucesso.\n');

    // 4. Teste da Documentação Swagger
    console.log('4️⃣ Testando disponibilidade do Swagger UI em /api/docs...');
    const swaggerRes = await fetch(`${baseUrl}/api/docs/`);
    console.log(`   - Status HTTP Swagger: ${swaggerRes.status}`);

    if (swaggerRes.status !== 200 && swaggerRes.status !== 301 && swaggerRes.status !== 302) {
      throw new Error('Documentação Swagger não está acessível!');
    }
    console.log('   ✅ Documentação Swagger acessível com sucesso.\n');

    console.log('====================================================');
    console.log('🎉 TODOS OS TESTES DA FASE 2 PASSARAM COM SUCESSO!');
    console.log('====================================================');
  } catch (error) {
    console.error('❌ Falha nos testes da API:', error);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runApiTests();
