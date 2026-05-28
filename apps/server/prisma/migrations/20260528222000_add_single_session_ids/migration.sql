ALTER TABLE "User"
  ADD COLUMN "activeSessionId" TEXT,
  ADD COLUMN "activeSessionAt" TIMESTAMP(3);

ALTER TABLE "RefreshToken"
  ADD COLUMN "sessionId" TEXT;

ALTER TABLE "Agent"
  ADD COLUMN "activeSessionId" TEXT,
  ADD COLUMN "activeSessionAt" TIMESTAMP(3);

ALTER TABLE "AgentRefreshToken"
  ADD COLUMN "sessionId" TEXT;
