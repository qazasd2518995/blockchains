CREATE TABLE "BlackjackRound" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "betAmount" DECIMAL(20,2) NOT NULL,
  "totalBetAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "dealerHand" JSONB NOT NULL,
  "playerHands" JSONB NOT NULL,
  "activeHandIndex" INTEGER NOT NULL DEFAULT 0,
  "deck" JSONB NOT NULL,
  "deckIndex" INTEGER NOT NULL DEFAULT 0,
  "currentMultiplier" DECIMAL(20,4) NOT NULL DEFAULT 1,
  "status" "RoundStatus" NOT NULL DEFAULT 'ACTIVE',
  "nonce" INTEGER NOT NULL,
  "serverSeedId" TEXT NOT NULL,
  "clientSeedUsed" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),

  CONSTRAINT "BlackjackRound_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BlackjackRound"
  ADD CONSTRAINT "BlackjackRound_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Bet" ADD COLUMN "blackjackRoundId" TEXT;

ALTER TABLE "Bet"
  ADD CONSTRAINT "Bet_blackjackRoundId_fkey"
  FOREIGN KEY ("blackjackRoundId") REFERENCES "BlackjackRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Bet_blackjackRoundId_key" ON "Bet"("blackjackRoundId");
CREATE INDEX "BlackjackRound_userId_status_idx" ON "BlackjackRound"("userId", "status");
