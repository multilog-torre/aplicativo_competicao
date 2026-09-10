import { app } from './app';
import { prisma } from './config/database';
import { env } from './config/env';
import { CycleService } from './modules/cycles/cycle.service';

const server = app.listen(env.PORT, () => {
  console.log('\n======================================================');
  console.log(`🚀 SERVIDOR INICIADO COM SUCESSO!`);
  console.log(`📡 URL da API:        ${env.API_URL}/api/v1`);
  console.log(`📄 Documentação API:  ${env.API_URL}/api/docs`);
  console.log(`🩺 Health Check:      ${env.API_URL}/api/v1/health`);
  console.log(`🌍 Ambiente:          ${env.NODE_ENV}`);
  console.log('======================================================\n');
});

// Verificador periódico de Ciclos de Premiação — encerra automaticamente
// qualquer ciclo cuja data fim já passou (pódio + reset geral de pontos).
// Também é checado a cada leitura do módulo (cycle.service.ts), então isso
// aqui é só uma rede de segurança pro caso de ninguém estar consultando a
// API no momento exato em que o ciclo vence. Ressalva: em hosts com
// hibernação por inatividade (ex.: Render free tier), este intervalo só
// roda enquanto o processo está desperto.
const CYCLE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
CycleService.checkAndCloseExpiredCycles().catch((err) => console.error('Erro ao verificar ciclos expirados no startup:', err));
const cycleCheckInterval = setInterval(() => {
  CycleService.checkAndCloseExpiredCycles().catch((err) => console.error('Erro ao verificar ciclos expirados:', err));
}, CYCLE_CHECK_INTERVAL_MS);

// Tratamento de Encerramento Gracioso (Graceful Shutdown)
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Recebido sinal ${signal}. Encerrando servidor graciosamente...`);
  clearInterval(cycleCheckInterval);
  server.close(async () => {
    console.log('🔌 Conexões HTTP fechadas.');
    await prisma.$disconnect();
    console.log('📦 Conexão com banco de dados encerrada.');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
