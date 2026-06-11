ALTER TABLE "MemberDepositControl"
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'MEMBER',
  ADD COLUMN "targetAgentId" TEXT,
  ADD COLUMN "targetAgentUsername" TEXT,
  ADD COLUMN "lifecycleSteps" JSONB;

ALTER TABLE "MemberDepositControl"
  ALTER COLUMN "memberId" DROP NOT NULL,
  ALTER COLUMN "memberUsername" DROP NOT NULL;

CREATE INDEX "MemberDepositControl_scope_isActive_isCompleted_idx"
  ON "MemberDepositControl"("scope", "isActive", "isCompleted");

CREATE INDEX "MemberDepositControl_targetAgentId_isActive_idx"
  ON "MemberDepositControl"("targetAgentId", "isActive");

CREATE TABLE "MemberDepositLifecycleState" (
  "id" TEXT NOT NULL,
  "controlId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "memberUsername" TEXT NOT NULL,
  "startBalance" DECIMAL(20, 2) NOT NULL,
  "currentStageIndex" INTEGER NOT NULL DEFAULT 0,
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "lastBalance" DECIMAL(20, 2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemberDepositLifecycleState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberDepositLifecycleState_controlId_memberId_key"
  ON "MemberDepositLifecycleState"("controlId", "memberId");

CREATE INDEX "MemberDepositLifecycleState_memberId_isCompleted_idx"
  ON "MemberDepositLifecycleState"("memberId", "isCompleted");

CREATE INDEX "MemberDepositLifecycleState_controlId_isCompleted_idx"
  ON "MemberDepositLifecycleState"("controlId", "isCompleted");

ALTER TABLE "MemberDepositLifecycleState"
  ADD CONSTRAINT "MemberDepositLifecycleState_controlId_fkey"
  FOREIGN KEY ("controlId") REFERENCES "MemberDepositControl"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
