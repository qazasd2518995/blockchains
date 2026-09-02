ALTER TABLE "ManualDetectionControl"
  ADD COLUMN "controlZoneRootAgentId" TEXT;

ALTER TABLE "MemberDepositControl"
  ADD COLUMN "controlZoneRootAgentId" TEXT,
  ADD COLUMN "winFreezeThreshold" DECIMAL(20, 2) NOT NULL DEFAULT 50000;

CREATE INDEX "ManualDetectionControl_controlZoneRootAgentId_isActive_isCompleted_idx"
  ON "ManualDetectionControl"("controlZoneRootAgentId", "isActive", "isCompleted");

CREATE INDEX "MemberDepositControl_controlZoneRootAgentId_isActive_isCompleted_idx"
  ON "MemberDepositControl"("controlZoneRootAgentId", "isActive", "isCompleted");

-- Delegation now owns the two lifecycle controls below. Retire legacy delegated
-- win/loss rules so an invisible higher-priority rule cannot override them.
UPDATE "WinLossControl"
SET "isActive" = false,
    "isCompleted" = true,
    "completedAt" = CURRENT_TIMESTAMP
WHERE "controlZoneRootAgentId" IS NOT NULL
  AND "isActive" = true;
