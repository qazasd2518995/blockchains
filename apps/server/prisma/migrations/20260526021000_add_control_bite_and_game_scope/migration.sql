ALTER TABLE "BurstControl"
ADD COLUMN "gameIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ManualDetectionControl"
ADD COLUMN "bitePercentage" DECIMAL(5,2),
ADD COLUMN "houseTakePercentage" DECIMAL(5,2) NOT NULL DEFAULT 10,
ADD COLUMN "cycleCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastCycleSettlement" DECIMAL(20,2),
ADD COLUMN "lastCycleAt" TIMESTAMP(3),
ADD COLUMN "lastCapitalAmount" DECIMAL(20,2),
ADD COLUMN "lastPlatformTake" DECIMAL(20,2),
ADD COLUMN "lastRedistributionAmount" DECIMAL(20,2);
