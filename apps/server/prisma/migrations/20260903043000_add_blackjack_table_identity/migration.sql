ALTER TABLE "BlackjackRound"
  ADD COLUMN "tableId" TEXT NOT NULL DEFAULT 'royal';

DROP INDEX IF EXISTS "BlackjackRound_one_active_per_user_key";

CREATE UNIQUE INDEX "BlackjackRound_one_active_per_user_table_key"
  ON "BlackjackRound"("userId", "tableId")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "BlackjackRound_userId_tableId_status_idx"
  ON "BlackjackRound"("userId", "tableId", "status");
