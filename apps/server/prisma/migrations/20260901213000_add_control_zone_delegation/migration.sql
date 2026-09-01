ALTER TABLE "Agent"
  ADD COLUMN "canManageControlZone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "controlZoneGrantedBy" TEXT,
  ADD COLUMN "controlZoneGrantedAt" TIMESTAMP(3);

ALTER TABLE "WinLossControl"
  ADD COLUMN "controlZoneRootAgentId" TEXT;

ALTER TABLE "WinLossControlLogs"
  ADD COLUMN "controlZoneRootAgentId" TEXT;

CREATE INDEX "Agent_canManageControlZone_idx"
  ON "Agent"("canManageControlZone");

CREATE INDEX "WinLossControl_controlZoneRootAgentId_isActive_isCompleted_idx"
  ON "WinLossControl"("controlZoneRootAgentId", "isActive", "isCompleted");

CREATE INDEX "WinLossControlLogs_controlZoneRootAgentId_createdAt_idx"
  ON "WinLossControlLogs"("controlZoneRootAgentId", "createdAt");
