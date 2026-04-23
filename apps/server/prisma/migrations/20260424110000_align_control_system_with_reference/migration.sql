-- CreateEnum
CREATE TYPE "ManualDetectionScope" AS ENUM ('ALL', 'AGENT_LINE', 'MEMBER');

-- AlterTable
ALTER TABLE "AgentLineWinCap"
ADD COLUMN     "controlWinRate" DECIMAL(5,4) NOT NULL DEFAULT 0.70,
ADD COLUMN     "triggerThreshold" DECIMAL(5,4) NOT NULL DEFAULT 0.80,
ADD COLUMN     "isCapped" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ManualDetectionControl" (
    "id" TEXT NOT NULL,
    "scope" "ManualDetectionScope" NOT NULL,
    "targetAgentId" TEXT,
    "targetAgentUsername" TEXT,
    "targetMemberId" TEXT,
    "targetMemberUsername" TEXT,
    "targetSettlement" DECIMAL(20,2) NOT NULL,
    "controlPercentage" INTEGER NOT NULL DEFAULT 50,
    "startSettlement" DECIMAL(20,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completionSettlement" DECIMAL(20,2),
    "operatorId" TEXT,
    "operatorUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualDetectionControl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualDetectionControl_isActive_scope_idx" ON "ManualDetectionControl"("isActive", "scope");

-- CreateIndex
CREATE INDEX "ManualDetectionControl_targetAgentId_isActive_idx" ON "ManualDetectionControl"("targetAgentId", "isActive");

-- CreateIndex
CREATE INDEX "ManualDetectionControl_targetMemberUsername_isActive_idx" ON "ManualDetectionControl"("targetMemberUsername", "isActive");

-- CreateIndex
CREATE INDEX "ManualDetectionControl_createdAt_idx" ON "ManualDetectionControl"("createdAt");
