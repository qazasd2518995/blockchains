#!/usr/bin/env bash
# 一鍵初始化專案的 shell script
# 在專案根目錄執行：bash scripts/bootstrap.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "────────────────────────────────────────"
echo "Blockchain Game 專案初始化"
echo "────────────────────────────────────────"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "❌ 缺少 pnpm，請先安裝：npm i -g pnpm"
  exit 1
fi

if [ ! -f "apps/server/.env" ]; then
  echo "⚠️  apps/server/.env 不存在"
  echo "   請先複製：cp apps/server/.env.example apps/server/.env"
  echo "   並填入 DATABASE_URL 與 JWT_SECRET（至少 32 字元）"
  echo ""
  echo "   產生 JWT_SECRET：  openssl rand -hex 32"
  echo ""
  read -r -p "現在先跳過 migration，只做 pnpm install？(Y/n) " skip
  skip=${skip:-Y}
  if [[ "$skip" != "Y" && "$skip" != "y" ]]; then
    exit 1
  fi
fi

echo ""
echo "▶ 步驟 1/3：pnpm install"
pnpm install

echo ""
echo "▶ 步驟 2/3：產生 Prisma client"
pnpm --filter @bg/server prisma generate

if [ -f "apps/server/.env" ]; then
  echo ""
  echo "▶ 步驟 3/3：資料庫 migration"
  pnpm --filter @bg/server prisma migrate dev --name init
  echo ""
  echo "▶ 選擇性：種入 admin 帳號（admin@blockchain-game.local / admin123456）"
  read -r -p "是否執行 seed？(y/N) " doseed
  doseed=${doseed:-N}
  if [[ "$doseed" == "Y" || "$doseed" == "y" ]]; then
    pnpm --filter @bg/server db:seed
  fi
fi

echo ""
echo "✅ 初始化完成！"
echo ""
echo "啟動開發伺服器："
echo "  pnpm dev"
echo ""
echo "瀏覽器開啟：http://localhost:5173"
