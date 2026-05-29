ALTER TABLE "Agent"
  ADD COLUMN IF NOT EXISTS "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "twoFactorLastUsedStep" BIGINT,
  ADD COLUMN IF NOT EXISTS "twoFactorLastUsedAt" TIMESTAMP(3);

UPDATE "Agent"
SET "twoFactorRequired" = true
WHERE username IN ('superadmin', 'admin2', 'admin3');
