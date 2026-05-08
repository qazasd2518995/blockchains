CREATE TABLE "HotlineJackpotPool" (
    "gameId" TEXT NOT NULL,
    "grand" DECIMAL(20, 2) NOT NULL DEFAULT 0,
    "major" DECIMAL(20, 2) NOT NULL DEFAULT 0,
    "minor" DECIMAL(20, 2) NOT NULL DEFAULT 0,
    "mini" DECIMAL(20, 2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotlineJackpotPool_pkey" PRIMARY KEY ("gameId")
);
