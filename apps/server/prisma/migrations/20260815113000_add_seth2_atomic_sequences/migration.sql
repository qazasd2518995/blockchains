ALTER TABLE "Bet"
  ADD COLUMN "operationId" TEXT;

CREATE UNIQUE INDEX "Bet_userId_gameId_operationId_key"
  ON "Bet"("userId", "gameId", "operationId");

CREATE TYPE "Seth2FeatureSequenceStatus" AS ENUM ('READY', 'CONSUMED');

CREATE TABLE "Seth2PlayerState" (
  "userId" TEXT NOT NULL,
  "selectedMachineId" INTEGER NOT NULL DEFAULT 1,
  "settings" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Seth2PlayerState_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "Seth2PlayerState_selectedMachineId_check"
    CHECK ("selectedMachineId" BETWEEN 1 AND 4000)
);

CREATE TABLE "Seth2FeatureSequence" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "betId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "machineId" INTEGER NOT NULL,
  "featureIndex" INTEGER,
  "baseAmount" DECIMAL(20,2) NOT NULL,
  "debitAmount" DECIMAL(20,2) NOT NULL,
  "finalPayout" DECIMAL(20,2) NOT NULL,
  "finalBalance" DECIMAL(20,2) NOT NULL,
  "entryGameStates" JSONB NOT NULL,
  "featureGameStates" JSONB NOT NULL,
  "mathResults" JSONB NOT NULL,
  "controlResult" JSONB NOT NULL,
  "definitionVersion" TEXT NOT NULL DEFAULT 'seth2-v1.1.5-sequence-v1',
  "status" "Seth2FeatureSequenceStatus" NOT NULL DEFAULT 'READY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "Seth2FeatureSequence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Seth2FeatureSequence_machineId_check" CHECK ("machineId" BETWEEN 1 AND 4000),
  CONSTRAINT "Seth2FeatureSequence_featureIndex_check"
    CHECK ("featureIndex" IS NULL OR "featureIndex" BETWEEN 0 AND 2)
);

CREATE UNIQUE INDEX "Seth2FeatureSequence_betId_key"
  ON "Seth2FeatureSequence"("betId");
CREATE UNIQUE INDEX "Seth2FeatureSequence_userId_operationId_key"
  ON "Seth2FeatureSequence"("userId", "operationId");
CREATE INDEX "Seth2FeatureSequence_userId_status_createdAt_idx"
  ON "Seth2FeatureSequence"("userId", "status", "createdAt");
CREATE UNIQUE INDEX "Seth2FeatureSequence_one_ready_per_user_key"
  ON "Seth2FeatureSequence"("userId")
  WHERE "status" = 'READY';

ALTER TABLE "Seth2PlayerState"
  ADD CONSTRAINT "Seth2PlayerState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Seth2FeatureSequence"
  ADD CONSTRAINT "Seth2FeatureSequence_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Seth2FeatureSequence"
  ADD CONSTRAINT "Seth2FeatureSequence_betId_fkey"
  FOREIGN KEY ("betId") REFERENCES "Bet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Seth2JackpotPool" (
  "gameId" TEXT NOT NULL,
  "grand" DECIMAL(20,2) NOT NULL DEFAULT 200000,
  "major" DECIMAL(20,2) NOT NULL DEFAULT 70000,
  "minor" DECIMAL(20,2) NOT NULL DEFAULT 13000,
  "mini" DECIMAL(20,2) NOT NULL DEFAULT 1600,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Seth2JackpotPool_pkey" PRIMARY KEY ("gameId")
);
