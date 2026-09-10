-- CreateTable
CREATE TABLE "award_cycles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "award_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_prizes" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "cycle_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_winners" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "points_at_close" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cycle_winners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "award_cycles_status_idx" ON "award_cycles"("status");

-- CreateIndex
CREATE INDEX "award_cycles_start_date_idx" ON "award_cycles"("start_date");

-- CreateIndex
CREATE INDEX "award_cycles_end_date_idx" ON "award_cycles"("end_date");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_prizes_cycle_id_position_key" ON "cycle_prizes"("cycle_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_winners_cycle_id_position_key" ON "cycle_winners"("cycle_id", "position");

-- AddForeignKey
ALTER TABLE "cycle_prizes" ADD CONSTRAINT "cycle_prizes_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "award_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_winners" ADD CONSTRAINT "cycle_winners_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "award_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_winners" ADD CONSTRAINT "cycle_winners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
