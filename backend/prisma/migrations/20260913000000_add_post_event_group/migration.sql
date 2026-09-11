-- AlterTable
ALTER TABLE "posts" ADD COLUMN "event_id" TEXT;

-- CreateIndex
CREATE INDEX "posts_event_id_idx" ON "posts"("event_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
