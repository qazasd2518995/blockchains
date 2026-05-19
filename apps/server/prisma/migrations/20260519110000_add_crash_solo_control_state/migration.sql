ALTER TABLE "CrashBet"
  ADD COLUMN "controlOriginal" JSONB,
  ADD COLUMN "controlOutcome" JSONB,
  ADD COLUMN "controlFinalizedAt" TIMESTAMP(3);
