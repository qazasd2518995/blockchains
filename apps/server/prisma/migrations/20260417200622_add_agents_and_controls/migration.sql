-- CreateEnum
CREATE TYPE "MarketType" AS ENUM ('D', 'A');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'FROZEN', 'DELETED');

-- CreateEnum
CREATE TYPE "RebateMode" AS ENUM ('PERCENTAGE', 'ALL', 'NONE');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'AGENT', 'SUB_ACCOUNT');

-- CreateEnum
CREATE TYPE "PointTransferType" AS ENUM ('AGENT_TO_AGENT', 'AGENT_TO_MEMBER', 'MEMBER_TO_AGENT', 'CS_AGENT_TRANSFER', 'CS_MEMBER_TRANSFER', 'REBATE_PAYOUT');

-- CreateEnum
CREATE TYPE "ControlMode" AS ENUM ('NORMAL', 'AGENT_LINE', 'SINGLE_MEMBER', 'AUTO_DETECT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TxType" ADD VALUE 'REBATE';
ALTER TYPE "TxType" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "TxType" ADD VALUE 'TRANSFER_OUT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "frozenAt" TIMESTAMP(3),
ADD COLUMN     "marketType" "MarketType" NOT NULL DEFAULT 'D',
ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "parentId" TEXT,
    "level" INTEGER NOT NULL,
    "marketType" "MarketType" NOT NULL DEFAULT 'D',
    "balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "commissionBalance" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "commissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0.2,
    "rebateMode" "RebateMode" NOT NULL DEFAULT 'PERCENTAGE',
    "rebatePercentage" DECIMAL(5,4) NOT NULL DEFAULT 0.041,
    "maxRebatePercentage" DECIMAL(5,4) NOT NULL DEFAULT 0.041,
    "bettingLimitLevel" TEXT NOT NULL DEFAULT 'level3',
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "role" "AdminRole" NOT NULL DEFAULT 'AGENT',
    "notes" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRefreshToken" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointTransfer" (
    "id" TEXT NOT NULL,
    "type" "PointTransferType" NOT NULL,
    "fromType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "fromBeforeBalance" DECIMAL(20,2) NOT NULL,
    "fromAfterBalance" DECIMAL(20,2) NOT NULL,
    "toBeforeBalance" DECIMAL(20,2) NOT NULL,
    "toAfterBalance" DECIMAL(20,2) NOT NULL,
    "description" TEXT,
    "operatorId" TEXT,
    "operatorType" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinLossControl" (
    "id" TEXT NOT NULL,
    "controlMode" "ControlMode" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetUsername" TEXT,
    "controlPercentage" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "winControl" BOOLEAN NOT NULL DEFAULT false,
    "lossControl" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startPeriod" TEXT,
    "operatorId" TEXT,
    "operatorUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinLossControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberWinCapControl" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberUsername" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "winCapAmount" DECIMAL(20,2) NOT NULL,
    "controlWinRate" DECIMAL(5,4) NOT NULL DEFAULT 0.70,
    "triggerThreshold" DECIMAL(5,4) NOT NULL DEFAULT 0.80,
    "currentGameDay" TEXT NOT NULL,
    "todayWinAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "todayBetCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCapped" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "operatorUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberWinCapControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberDepositControl" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberUsername" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "depositAmount" DECIMAL(20,2) NOT NULL,
    "targetProfit" DECIMAL(20,2) NOT NULL,
    "startBalance" DECIMAL(20,2) NOT NULL,
    "controlWinRate" DECIMAL(5,4) NOT NULL DEFAULT 0.70,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "startPeriod" TEXT,
    "notes" TEXT,
    "operatorUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberDepositControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLineWinCap" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentUsername" TEXT NOT NULL,
    "dailyCap" DECIMAL(20,2) NOT NULL,
    "todayWinAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currentGameDay" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "operatorUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentLineWinCap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinLossControlLogs" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "betId" TEXT,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "originalResult" JSONB NOT NULL,
    "finalResult" JSONB NOT NULL,
    "flipReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinLossControlLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_username_key" ON "Agent"("username");

-- CreateIndex
CREATE INDEX "Agent_parentId_idx" ON "Agent"("parentId");

-- CreateIndex
CREATE INDEX "Agent_username_idx" ON "Agent"("username");

-- CreateIndex
CREATE INDEX "Agent_level_idx" ON "Agent"("level");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRefreshToken_tokenHash_key" ON "AgentRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentRefreshToken_agentId_idx" ON "AgentRefreshToken"("agentId");

-- CreateIndex
CREATE INDEX "AgentRefreshToken_tokenHash_idx" ON "AgentRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PointTransfer_fromType_fromId_createdAt_idx" ON "PointTransfer"("fromType", "fromId", "createdAt");

-- CreateIndex
CREATE INDEX "PointTransfer_toType_toId_createdAt_idx" ON "PointTransfer"("toType", "toId", "createdAt");

-- CreateIndex
CREATE INDEX "PointTransfer_operatorId_createdAt_idx" ON "PointTransfer"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "WinLossControl_isActive_controlMode_idx" ON "WinLossControl"("isActive", "controlMode");

-- CreateIndex
CREATE INDEX "WinLossControl_targetType_targetId_idx" ON "WinLossControl"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberWinCapControl_memberUsername_key" ON "MemberWinCapControl"("memberUsername");

-- CreateIndex
CREATE INDEX "MemberWinCapControl_isActive_isCapped_idx" ON "MemberWinCapControl"("isActive", "isCapped");

-- CreateIndex
CREATE INDEX "MemberDepositControl_memberUsername_isActive_idx" ON "MemberDepositControl"("memberUsername", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AgentLineWinCap_agentId_key" ON "AgentLineWinCap"("agentId");

-- CreateIndex
CREATE INDEX "WinLossControlLogs_userId_createdAt_idx" ON "WinLossControlLogs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WinLossControlLogs_controlId_createdAt_idx" ON "WinLossControlLogs"("controlId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx" ON "AuditLog"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "User_agentId_idx" ON "User"("agentId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRefreshToken" ADD CONSTRAINT "AgentRefreshToken_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WinLossControl" ADD CONSTRAINT "WinLossControl_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberWinCapControl" ADD CONSTRAINT "MemberWinCapControl_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberDepositControl" ADD CONSTRAINT "MemberDepositControl_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
