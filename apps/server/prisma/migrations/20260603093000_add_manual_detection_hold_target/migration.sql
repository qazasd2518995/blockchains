ALTER TABLE "ManualDetectionControl"
  ADD COLUMN "completionBehavior" TEXT NOT NULL DEFAULT 'stop_on_target',
  ADD COLUMN "targetBand" DECIMAL(20, 2) NOT NULL DEFAULT 0;

UPDATE "ManualDetectionControl"
SET "completionBehavior" = 'hold_target'
WHERE "scope" = 'AGENT_LINE'
  AND "bitePercentage" IS NULL;

UPDATE "ManualDetectionControl"
SET "targetBand" = GREATEST(1000, LEAST(ABS("targetSettlement") * 0.05, 10000))
WHERE "completionBehavior" = 'hold_target'
  AND ABS("targetSettlement") > 0;

CREATE INDEX "ManualDetectionControl_isActive_isCompleted_completionBehavior_idx"
  ON "ManualDetectionControl"("isActive", "isCompleted", "completionBehavior");
