CREATE TABLE "BaccaratIntegrationLedger" (
    "id" TEXT NOT NULL,
    "providerTxId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "userId" TEXT,
    "amount" DECIMAL(20,2),
    "payout" DECIMAL(20,2),
    "betId" TEXT,
    "response" JSONB,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaccaratIntegrationLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BaccaratIntegrationLedger_providerTxId_key" ON "BaccaratIntegrationLedger"("providerTxId");
CREATE INDEX "BaccaratIntegrationLedger_userId_createdAt_idx" ON "BaccaratIntegrationLedger"("userId", "createdAt");
CREATE INDEX "BaccaratIntegrationLedger_action_createdAt_idx" ON "BaccaratIntegrationLedger"("action", "createdAt");

CREATE UNIQUE INDEX "CrashBet_roundId_userId_key" ON "CrashBet"("roundId", "userId");

CREATE UNIQUE INDEX "ServerSeed_one_active_per_user_game_key"
  ON "ServerSeed"("userId", "gameCategory")
  WHERE "isActive" = true;

CREATE UNIQUE INDEX "ClientSeed_one_active_per_user_key"
  ON "ClientSeed"("userId")
  WHERE "isActive" = true;

CREATE UNIQUE INDEX "MinesRound_one_active_per_user_key"
  ON "MinesRound"("userId")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "HiLoRound_one_active_per_user_key"
  ON "HiLoRound"("userId")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "TowerRound_one_active_per_user_key"
  ON "TowerRound"("userId")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "BlackjackRound_one_active_per_user_key"
  ON "BlackjackRound"("userId")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "User"
  ADD CONSTRAINT "User_balance_nonnegative" CHECK ("balance" >= 0) NOT VALID;

ALTER TABLE "Agent"
  ADD CONSTRAINT "Agent_balance_nonnegative" CHECK ("balance" >= 0) NOT VALID,
  ADD CONSTRAINT "Agent_commission_balance_nonnegative" CHECK ("commissionBalance" >= 0) NOT VALID;

ALTER TABLE "Bet"
  ADD CONSTRAINT "Bet_amount_positive" CHECK ("amount" > 0) NOT VALID,
  ADD CONSTRAINT "Bet_payout_nonnegative" CHECK ("payout" >= 0) NOT VALID;

ALTER TABLE "CrashBet"
  ADD CONSTRAINT "CrashBet_amount_positive" CHECK ("amount" > 0) NOT VALID,
  ADD CONSTRAINT "CrashBet_payout_nonnegative" CHECK ("payout" >= 0) NOT VALID;

ALTER TABLE "ServerSeed"
  ADD CONSTRAINT "ServerSeed_nonce_nonnegative" CHECK ("nonce" >= 0) NOT VALID;
