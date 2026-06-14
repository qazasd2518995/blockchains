ALTER TABLE "ManualDetectionControl"
  ADD COLUMN "controlMode" TEXT NOT NULL DEFAULT 'settlement',
  ADD COLUMN "lifecycleTemplateKeys" JSONB,
  ADD COLUMN "lineFreezeThreshold" DECIMAL(20, 2);

ALTER TABLE "MemberAutoBalanceControl"
  ADD COLUMN "controlPercentage" INTEGER;
