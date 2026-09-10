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
  // Autocadastro (POST /auth/register) — só aceita e-mails deste domínio
  // corporativo, e toda conta nova nasce com esta senha padrão (o próprio
  // usuário troca depois via PATCH /profile/password).
  SIGNUP_ALLOWED_EMAIL_DOMAIN: z.string().default('multilog.com.br'),
  DEFAULT_USER_PASSWORD: z.string().min(6).default('Torre@2026'),
  STORAGE_PROVIDER: z.enum(['local', 'azure', 's3', 'cloudinary']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('../storage/uploads'),
  MAX_UPLOAD_SIZE_MB: z.string().transform(Number).default('10'),
  // Necessárias apenas quando STORAGE_PROVIDER=cloudinary (ver storage.factory.ts) —
  // usado em hospedagens sem disco persistente (ex.: Render free tier).
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Configuração inválida no .env:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
