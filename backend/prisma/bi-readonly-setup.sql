-- ============================================================================
-- ACESSO SOMENTE LEITURA PARA BUSINESS INTELLIGENCE (Power BI, etc.)
-- ============================================================================
-- Cria um usuário PostgreSQL dedicado, sem qualquer permissão de escrita,
-- para ferramentas externas de BI consultarem o banco de produção/gamificação
-- sem risco de alterar dados e sem expor colunas sensíveis (ex.: password_hash).
--
-- QUANDO RODAR: depois que o schema já existe no banco (ou seja, depois de
-- `npm run db:setup` / `npm run db:setup:sqlite` já ter criado as tabelas via
-- Prisma). Rodar antes disso falha, pois as tabelas ainda não existem.
--
-- COMO RODAR (Postgres local via docker-compose deste projeto):
--   docker compose up -d postgres
--   cd backend && npm run db:setup
--   psql "postgresql://postgres:postgres_secure_password@localhost:5432/gamificacao_db" -f prisma/bi-readonly-setup.sql
--
-- ⚠️ TROQUE a senha abaixo antes de rodar em qualquer ambiente real.
-- ============================================================================

-- 1. Papel de login dedicado ao Power BI / ferramentas de BI ------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_readonly') THEN
    CREATE ROLE bi_readonly WITH LOGIN PASSWORD 'TROQUE_ESTA_SENHA_ANTES_DE_USAR';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE gamificacao_db TO bi_readonly;
GRANT USAGE ON SCHEMA public TO bi_readonly;

-- 2. Libera SELECT em todas as tabelas do schema, inclusive as que a Prisma
-- ainda vier a criar em migrações futuras (ALTER DEFAULT PRIVILEGES) --------
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bi_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO bi_readonly;

-- 3. Mascara a única coluna realmente sensível do modelo: password_hash -----
-- Uma view no Postgres é resolvida com os privilégios do seu DONO (postgres),
-- não de quem consulta — então dá pra expor todas as colunas de `users`
-- MENOS o hash de senha, sem o bi_readonly nunca ter acesso direto à coluna.
CREATE OR REPLACE VIEW public.users_bi AS
SELECT
  id, corporate_id, email, name, department_id, position, avatar_type,
  avatar_url, status, total_points, level_id, created_at, updated_at
FROM public.users;

REVOKE SELECT ON public.users FROM bi_readonly;
GRANT SELECT ON public.users_bi TO bi_readonly;

-- Pronto. String de conexão para o Power BI (conector nativo "PostgreSQL"):
--   Servidor: localhost (ou o host do seu Postgres)
--   Porta:    5432
--   Banco:    gamificacao_db
--   Usuário:  bi_readonly
--   Senha:    a que você definiu no passo 1
--
-- Use a view `users_bi` no lugar da tabela `users` em qualquer relatório —
-- o bi_readonly não tem mais acesso de leitura à tabela `users` original.
