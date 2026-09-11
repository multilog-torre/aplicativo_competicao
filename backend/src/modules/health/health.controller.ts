import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { sendSuccess } from '../../shared/utils/apiResponse';

export class HealthController {
  public static async getHealth(_req: Request, res: Response): Promise<Response> {
    const startTime = Date.now();
    let dbStatus = 'ONLINE';
    let dbLatencyMs = 0;

    try {
      const dbCheckStart = Date.now();
      // Executa consulta leve no banco para testar conectividade
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbCheckStart;
    } catch (error) {
      dbStatus = 'OFFLINE';
      console.error('❌ Falha na conexão com o banco de dados no healthcheck:', error);
    }

    const healthData = {
      status: dbStatus === 'ONLINE' ? 'HEALTHY' : 'DEGRADED',
      message: 'API funcionando',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: env.NODE_ENV,
      version: '1.0.0',
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      system: {
        nodeVersion: process.version,
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      responseTimeMs: Date.now() - startTime,
    };

    return sendSuccess(res, healthData, dbStatus === 'ONLINE' ? 200 : 503);
  }

  public static async getInfo(_req: Request, res: Response): Promise<Response> {
    const infoData = {
      name: 'Plataforma Corporativa de Gamificação e Competição',
      description: 'API REST oficial do sistema de gamificação, pontuação e ranking corporativo.',
      version: '1.0.0',
      author: 'Dados Competição Team',
      docsUrl: `${env.API_URL}/api/docs`,
      features: [
        'Autenticação e RBAC Corporativo',
        'Modalidades e regras de pontuação configuráveis',
        'Ledger imutável de transações de pontos',
        'Validação atômica de evidências e atividades',
        'Rankings dinâmicos e conquistas',
        'Trilha completa de auditoria administrativa',
      ],
    };

    return sendSuccess(res, infoData);
  }
}
