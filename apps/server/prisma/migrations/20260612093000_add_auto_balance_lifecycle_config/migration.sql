ALTER TABLE "MemberAutoBalanceControl"
ADD COLUMN "templateKey" TEXT,
ADD COLUMN "lifecycleSteps" JSONB,
ADD COLUMN "currentStageIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lifecycleCompletedAt" TIMESTAMP(3),
ADD COLUMN "lastBalance" DECIMAL(20,2),
ADD COLUMN "secondLineAmount" DECIMAL(20,2);

CREATE INDEX "MemberAutoBalanceControl_templateKey_isActive_idx"
ON "MemberAutoBalanceControl"("templateKey", "isActive");

CREATE TABLE "AutoBalanceConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "templateKey" TEXT NOT NULL DEFAULT 'SEVEN_NO_RECOVERY',
  "secondLineAmount" DECIMAL(20,2) NOT NULL DEFAULT 50000,
  "operatorUsername" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutoBalanceConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AutoBalanceConfig" ("id", "isEnabled", "templateKey", "secondLineAmount", "updatedAt")
VALUES ('default', true, 'SEVEN_NO_RECOVERY', 50000, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
