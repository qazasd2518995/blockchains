-- CreateTable
CREATE TABLE "BurstControl" (
    "id" TEXT NOT NULL,
    "scope" "ManualDetectionScope" NOT NULL,
    "targetAgentId" TEXT,
    "targetAgentUsername" TEXT,
    "targetMemberId" TEXT,
    "targetMemberUsername" TEXT,
    "dailyBudget" DECIMAL(20,2) NOT NULL,
    "todayBurstAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "todayBurstCount" INTEGER NOT NULL DEFAULT 0,
    "memberDailyCap" DECIMAL(20,2) NOT NULL,
    "singlePayoutCap" DECIMAL(20,2) NOT NULL,
    "singleMultiplierCap" DECIMAL(20,4) NOT NULL DEFAULT 100,
    "minBurstMultiplier" DECIMAL(20,4) NOT NULL DEFAULT 8,
    "smallWinMultiplier" DECIMAL(20,4) NOT NULL DEFAULT 1.5,
    "burstRate" DECIMAL(5,4) NOT NULL DEFAULT 0.03,
    "smallWinRate" DECIMAL(5,4) NOT NULL DEFAULT 0.35,
    "lossRate" DECIMAL(5,4) NOT NULL DEFAULT 0.45,
    "compensationLoss" DECIMAL(20,2) NOT NULL DEFAULT 500,
    "riskWinLimit" DECIMAL(20,2) NOT NULL DEFAULT 1000,
    "cooldownRounds" INTEGER NOT NULL DEFAULT 8,
    "currentGameDay" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "operatorId" TEXT,
    "operatorUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BurstControl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BurstControl_isActive_scope_idx" ON "BurstControl"("isActive", "scope");

-- CreateIndex
CREATE INDEX "BurstControl_targetAgentId_isActive_idx" ON "BurstControl"("targetAgentId", "isActive");

-- CreateIndex
CREATE INDEX "BurstControl_targetMemberUsername_isActive_idx" ON "BurstControl"("targetMemberUsername", "isActive");

-- CreateIndex
CREATE INDEX "BurstControl_currentGameDay_idx" ON "BurstControl"("currentGameDay");
