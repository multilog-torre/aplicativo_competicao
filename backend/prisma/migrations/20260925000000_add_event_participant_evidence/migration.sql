-- CreateTable
CREATE TABLE "event_participant_evidence" (
    "id" TEXT NOT NULL,
    "event_participant_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "storage_provider" TEXT NOT NULL DEFAULT 'local',
    "storage_path" TEXT NOT NULL,
    "storage_url" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_participant_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_participant_evidence_event_participant_id_idx" ON "event_participant_evidence"("event_participant_id");

-- AddForeignKey
ALTER TABLE "event_participant_evidence" ADD CONSTRAINT "event_participant_evidence_event_participant_id_fkey" FOREIGN KEY ("event_participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
