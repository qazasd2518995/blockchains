-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLAYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('SIGNUP_BONUS', 'BET_PLACE', 'BET_WIN', 'CASHOUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('PENDING', 'SETTLED', 'VOID');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('ACTIVE', 'BUSTED', 'CASHED_OUT');

-- CreateEnum
CREATE TYPE "CrashStatus" AS ENUM ('BETTING', 'RUNNING', 'CRASHED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "balance" DECIMAL(20,2) NOT NULL DEFAULT 1000,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "balanceAfter" DECIMAL(20,2) NOT NULL,
    "betId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerSeed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameCategory" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "seedHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nonce" INTEGER NOT NULL DEFAULT 0,
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerSeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientSeed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientSeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "multiplier" DECIMAL(20,4) NOT NULL,
    "payout" DECIMAL(20,2) NOT NULL,
    "profit" DECIMAL(20,2) NOT NULL,
    "nonce" INTEGER NOT NULL,
    "clientSeedUsed" TEXT NOT NULL,
    "serverSeedId" TEXT NOT NULL,
    "resultData" JSONB NOT NULL,
    "status" "BetStatus" NOT NULL DEFAULT 'SETTLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minesRoundId" TEXT,
    "hiloRoundId" TEXT,
    "towerRoundId" TEXT,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinesRound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "betAmount" DECIMAL(20,2) NOT NULL,
    "mineCount" INTEGER NOT NULL,
    "minePositions" INTEGER[],
    "revealed" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "currentMultiplier" DECIMAL(20,4) NOT NULL DEFAULT 1,
    "status" "RoundStatus" NOT NULL DEFAULT 'ACTIVE',
    "nonce" INTEGER NOT NULL,
    "serverSeedId" TEXT NOT NULL,
    "clientSeedUsed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MinesRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiLoRound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "betAmount" DECIMAL(20,2) NOT NULL,
    "cardIndex" INTEGER NOT NULL DEFAULT 0,
    "history" JSONB NOT NULL,
    "currentMultiplier" DECIMAL(20,4) NOT NULL DEFAULT 1,
    "skipsUsed" INTEGER NOT NULL DEFAULT 0,
    "status" "RoundStatus" NOT NULL DEFAULT 'ACTIVE',
    "nonce" INTEGER NOT NULL,
    "serverSeedId" TEXT NOT NULL,
    "clientSeedUsed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "HiLoRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TowerRound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "betAmount" DECIMAL(20,2) NOT NULL,
    "difficulty" TEXT NOT NULL,
    "safeLayout" JSONB NOT NULL,
    "picks" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "currentLevel" INTEGER NOT NULL DEFAULT 0,
    "currentMultiplier" DECIMAL(20,4) NOT NULL DEFAULT 1,
    "status" "RoundStatus" NOT NULL DEFAULT 'ACTIVE',
    "nonce" INTEGER NOT NULL,
    "serverSeedId" TEXT NOT NULL,
    "clientSeedUsed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TowerRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrashRound" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "serverSeed" TEXT,
    "crashPoint" DECIMAL(10,4) NOT NULL,
    "status" "CrashStatus" NOT NULL DEFAULT 'BETTING',
    "bettingEndsAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "crashedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrashRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrashBet" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "autoCashOut" DECIMAL(10,4),
    "cashedOutAt" DECIMAL(10,4),
    "payout" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrashBet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_betId_idx" ON "Transaction"("betId");

-- CreateIndex
CREATE INDEX "ServerSeed_userId_gameCategory_isActive_idx" ON "ServerSeed"("userId", "gameCategory", "isActive");

-- CreateIndex
CREATE INDEX "ClientSeed_userId_isActive_idx" ON "ClientSeed"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Bet_minesRoundId_key" ON "Bet"("minesRoundId");

-- CreateIndex
CREATE UNIQUE INDEX "Bet_hiloRoundId_key" ON "Bet"("hiloRoundId");

-- CreateIndex
CREATE UNIQUE INDEX "Bet_towerRoundId_key" ON "Bet"("towerRoundId");

-- CreateIndex
CREATE INDEX "Bet_userId_createdAt_idx" ON "Bet"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Bet_gameId_createdAt_idx" ON "Bet"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "MinesRound_userId_status_idx" ON "MinesRound"("userId", "status");

-- CreateIndex
CREATE INDEX "HiLoRound_userId_status_idx" ON "HiLoRound"("userId", "status");

-- CreateIndex
CREATE INDEX "TowerRound_userId_status_idx" ON "TowerRound"("userId", "status");

-- CreateIndex
CREATE INDEX "CrashRound_gameId_createdAt_idx" ON "CrashRound"("gameId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrashRound_gameId_roundNumber_key" ON "CrashRound"("gameId", "roundNumber");

-- CreateIndex
CREATE INDEX "CrashBet_userId_createdAt_idx" ON "CrashBet"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CrashBet_roundId_idx" ON "CrashBet"("roundId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_betId_fkey" FOREIGN KEY ("betId") REFERENCES "Bet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerSeed" ADD CONSTRAINT "ServerSeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSeed" ADD CONSTRAINT "ClientSeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_serverSeedId_fkey" FOREIGN KEY ("serverSeedId") REFERENCES "ServerSeed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_minesRoundId_fkey" FOREIGN KEY ("minesRoundId") REFERENCES "MinesRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_hiloRoundId_fkey" FOREIGN KEY ("hiloRoundId") REFERENCES "HiLoRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_towerRoundId_fkey" FOREIGN KEY ("towerRoundId") REFERENCES "TowerRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinesRound" ADD CONSTRAINT "MinesRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiLoRound" ADD CONSTRAINT "HiLoRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TowerRound" ADD CONSTRAINT "TowerRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrashBet" ADD CONSTRAINT "CrashBet_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CrashRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
