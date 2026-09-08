import { app } from './app';
import { prisma } from './config/database';
import { env } from './config/env';

const server = app.listen(env.PORT, () => {
  console.log('\n======================================================');
  console.log(`🚀 SERVIDOR INICIADO COM SUCESSO!`);
  console.log(`📡 URL da API:        ${env.API_URL}/api/v1`);
  console.log(`📄 Documentação API:  ${env.API_URL}/api/docs`);
  console.log(`🩺 Health Check:      ${env.API_URL}/api/v1/health`);
  console.log(`🌍 Ambiente:          ${env.NODE_ENV}`);
  console.log('======================================================\n');
});

// Tratamento de Encerramento Gracioso (Graceful Shutdown)
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Recebido sinal ${signal}. Encerrando servidor graciosamente...`);
  server.close(async () => {
    console.log('🔌 Conexões HTTP fechadas.');
    await prisma.$disconnect();
    console.log('📦 Conexão com banco de dados encerrada.');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
