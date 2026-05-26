ALTER TABLE "WinLossControl"
  ADD COLUMN "targetBitePercentage" DECIMAL(5,2),
  ADD COLUMN "startBalanceAmount" DECIMAL(20,2),
  ADD COLUMN "targetLossAmount" DECIMAL(20,2),
  ADD COLUMN "currentLossAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "ManualDetectionControl"
  ADD COLUMN "totalDistributedAmount" DECIMAL(20,2) NOT NULL DEFAULT 0;

CREATE INDEX "WinLossControl_isActive_isCompleted_idx"
  ON "WinLossControl"("isActive", "isCompleted");
