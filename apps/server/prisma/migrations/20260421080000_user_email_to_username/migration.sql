-- Migration: User.email → User.username
-- Strategy:
--   1) Add nullable username column
--   2) Backfill from email (local part before '@', lowercased)
--   3) De-duplicate by appending "_<n>" where collisions occur
--   4) Enforce NOT NULL + UNIQUE + index, drop old email column + index

-- 1) Add the new column (nullable during backfill)
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- 2) Backfill username from email
--    - Take substring before '@'
--    - Lowercase it
--    - Replace any character outside [a-z0-9._-] with '_'
UPDATE "User"
SET "username" = regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '_', 'g')
WHERE "email" IS NOT NULL;

-- 3) De-duplicate: for any duplicate usernames, append _2, _3, ...
WITH ranked AS (
  SELECT id,
         "username",
         ROW_NUMBER() OVER (PARTITION BY "username" ORDER BY "createdAt", id) AS rn
  FROM "User"
)
UPDATE "User" u
SET "username" = ranked."username" || '_' || ranked.rn::text
FROM ranked
WHERE u.id = ranked.id
  AND ranked.rn > 1;

-- 4a) Fallback for any remaining NULLs (shouldn't happen, but be safe)
UPDATE "User"
SET "username" = 'user_' || substring("id" for 8)
WHERE "username" IS NULL OR "username" = '';

-- 4b) Now enforce NOT NULL
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- 4c) Swap indexes
DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "User_email_idx";

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_username_idx" ON "User"("username");

-- 4d) Drop the old email column
ALTER TABLE "User" DROP COLUMN "email";
