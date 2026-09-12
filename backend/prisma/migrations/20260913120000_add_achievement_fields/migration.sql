-- AlterTable
ALTER TABLE "achievements" ADD COLUMN "icon_type" TEXT NOT NULL DEFAULT 'EMOJI';
ALTER TABLE "achievements" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GERAL';
ALTER TABLE "achievements" ADD COLUMN "level" TEXT NOT NULL DEFAULT 'BRONZE';
ALTER TABLE "achievements" ADD COLUMN "activity_type_id" TEXT;

-- CreateIndex
CREATE INDEX "achievements_activity_type_id_idx" ON "achievements"("activity_type_id");

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
