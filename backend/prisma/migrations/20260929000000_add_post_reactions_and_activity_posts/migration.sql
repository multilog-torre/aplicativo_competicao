-- AlterTable: post automático (opcional) vinculado à atividade aprovada que o originou
ALTER TABLE "posts" ADD COLUMN "activity_id" TEXT;

-- CreateIndex
CREATE INDEX "posts_activity_id_idx" ON "posts"("activity_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "user_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameTable: curtida binária vira reação com emoji — curtidas existentes são preservadas
-- como registros de post_reactions (backfill abaixo como THUMBS_UP, o "curtir" de sempre)
ALTER TABLE "post_likes" RENAME TO "post_reactions";
ALTER TABLE "post_reactions" RENAME CONSTRAINT "post_likes_pkey" TO "post_reactions_pkey";
-- O @@unique([postId, userId]) do Prisma vira um ÍNDICE no Postgres (CREATE UNIQUE
-- INDEX na migration de origem), não uma constraint de tabela — só PK/FK são
-- constraints reais em pg_constraint. Por isso é ALTER INDEX aqui, não RENAME
-- CONSTRAINT (que só funciona pras duas linhas abaixo, PK e FKs de verdade).
ALTER INDEX "post_likes_post_id_user_id_key" RENAME TO "post_reactions_post_id_user_id_key";
ALTER TABLE "post_reactions" RENAME CONSTRAINT "post_likes_post_id_fkey" TO "post_reactions_post_id_fkey";
ALTER TABLE "post_reactions" RENAME CONSTRAINT "post_likes_user_id_fkey" TO "post_reactions_user_id_fkey";

-- AlterTable: nova coluna do tipo de reação — backfill das curtidas existentes como THUMBS_UP,
-- depois remove o default (não faz parte do schema Prisma, era só pro backfill)
ALTER TABLE "post_reactions" ADD COLUMN "emoji" TEXT NOT NULL DEFAULT 'THUMBS_UP';
ALTER TABLE "post_reactions" ALTER COLUMN "emoji" DROP DEFAULT;
