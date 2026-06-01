CREATE TYPE "AutoBalancePhase" AS ENUM ('BITE_TO_30', 'REVIVE_TO_70', 'DRAIN_TO_ZERO');

CREATE TABLE "MemberAutoBalanceControl" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "memberUsername" TEXT NOT NULL,
  "agentId" TEXT,
  "baselineBalance" DECIMAL(20, 2) NOT NULL,
  "biteTargetBalance" DECIMAL(20, 2) NOT NULL,
  "reviveTargetBalance" DECIMAL(20, 2) NOT NULL,
  "phase" "AutoBalancePhase" NOT NULL DEFAULT 'BITE_TO_30',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "resetReason" TEXT,
  "operatorUsername" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemberAutoBalanceControl_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberAutoBalanceControl_memberId_key"
  ON "MemberAutoBalanceControl"("memberId");
CREATE INDEX "MemberAutoBalanceControl_memberUsername_isActive_idx"
  ON "MemberAutoBalanceControl"("memberUsername", "isActive");
CREATE INDEX "MemberAutoBalanceControl_isActive_phase_idx"
  ON "MemberAutoBalanceControl"("isActive", "phase");
