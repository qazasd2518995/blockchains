ALTER TABLE "Agent"
  ADD COLUMN "baccaratRebateMode" "RebateMode" NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN "baccaratRebatePercentage" DECIMAL(5,4) NOT NULL DEFAULT 0.010,
  ADD COLUMN "maxBaccaratRebatePercentage" DECIMAL(5,4) NOT NULL DEFAULT 0.010;

UPDATE "Agent"
SET
  "baccaratRebateMode" = "rebateMode",
  "baccaratRebatePercentage" = LEAST("rebatePercentage", 0.010),
  "maxBaccaratRebatePercentage" = LEAST("maxRebatePercentage", 0.010);
