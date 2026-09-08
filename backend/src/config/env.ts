import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Carrega o arquivo .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3001'),
  API_URL: z.string().default('http://localhost:3001'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  // PostgreSQL é a fonte de verdade do modelo de dados (ver prisma/schema.prisma).
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres_secure_password@localhost:5432/gamificacao_db?schema=public'),
  JWT_SECRET: z.string().min(16).default('super_secret_jwt_key_torre_gamificacao_2026_dev_min32chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  REFRESH_TOKEN_SECRET: z.string().default('super_secret_refresh_token_torre_gamificacao_2026_dev'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
  STORAGE_PROVIDER: z.enum(['local', 'azure', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('../storage/uploads'),
  MAX_UPLOAD_SIZE_MB: z.string().transform(Number).default('10'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Configuração inválida no .env:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
