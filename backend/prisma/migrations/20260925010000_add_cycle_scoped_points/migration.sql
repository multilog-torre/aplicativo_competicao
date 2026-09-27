-- AlterTable: novo contador vitalício em User, nunca afetado por ciclo/reset
ALTER TABLE "users" ADD COLUMN "lifetime_points" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: cada transação passa a registrar qual ciclo estava ACTIVE
-- no momento em que foi criada (nulo = nenhum ciclo rolando)
ALTER TABLE "points_transactions" ADD COLUMN "cycle_id" TEXT;

-- CreateIndex
CREATE INDEX "points_transactions_cycle_id_idx" ON "points_transactions"("cycle_id");

-- AddForeignKey
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "award_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill de dados: lifetime_points de cada usuário existente = soma
-- histórica de tudo que já passou pelo ledger, EXCETO lançamentos
-- CYCLE_RESET (que são só zeragem administrativa de placar de competição,
-- não uma perda real de conquista de vida) — preserva o sentido vitalício
-- mesmo pra quem já passou por um ou mais fechamentos de ciclo antes desta
-- migration existir.
UPDATE "users" u
SET "lifetime_points" = COALESCE((
  SELECT SUM(pt."points")
  FROM "points_transactions" pt
  WHERE pt."user_id" = u."id" AND pt."transaction_type" != 'CYCLE_RESET'
), 0);
