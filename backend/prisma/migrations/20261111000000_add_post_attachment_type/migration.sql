-- AlterTable
ALTER TABLE "posts" ADD COLUMN "attachment_type" TEXT;

-- Backfill: todo post com imagem já existente foi sempre uma foto (único tipo
-- aceito antes desta mudança) — nunca um PDF.
UPDATE "posts" SET "attachment_type" = 'IMAGE' WHERE "image_url" IS NOT NULL;
