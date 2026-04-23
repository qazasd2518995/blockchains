-- 平台退水硬上限 2.5%（電子系列）
-- 目標：
--   1. 既有資料中 rebatePercentage / maxRebatePercentage > 0.025 的一律下修到 0.025
--   2. 欄位預設值改為 0.025（schema.prisma 同步更新）
--
-- 這個 migration 只做資料修正 + 預設值調整，不改欄位型別。

UPDATE "Agent"
SET "rebatePercentage" = 0.025
WHERE "rebatePercentage" > 0.025;

UPDATE "Agent"
SET "maxRebatePercentage" = 0.025
WHERE "maxRebatePercentage" > 0.025;

ALTER TABLE "Agent"
  ALTER COLUMN "rebatePercentage" SET DEFAULT 0.025,
  ALTER COLUMN "maxRebatePercentage" SET DEFAULT 0.025;
