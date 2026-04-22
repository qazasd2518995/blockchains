CREATE TABLE "CrashRoomLease" (
    "gameId" TEXT NOT NULL,
    "ownerInstanceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrashRoomLease_pkey" PRIMARY KEY ("gameId")
);

CREATE INDEX "CrashRoomLease_expiresAt_idx" ON "CrashRoomLease"("expiresAt");
