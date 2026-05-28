import { hmacIntStream } from './hmac.js';

export type TowerDifficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export const TOWER_LEVELS = 9;
export const TOWER_HOUSE_EDGE = 0.03;

// 每個難度：每層有 cols 格，safe 格數 / 陷阱數
export const TOWER_CONFIG: Record<
  TowerDifficulty,
  { cols: number; safe: number; openingSafe?: number[] }
> = {
  easy: { cols: 4, safe: 3, openingSafe: [4] },
  medium: { cols: 3, safe: 2, openingSafe: [3] },
  hard: { cols: 4, safe: 2, openingSafe: [3] },
  expert: { cols: 5, safe: 2, openingSafe: [4, 3] },
  master: { cols: 6, safe: 2, openingSafe: [4, 3, 3] },
};

export function towerSafeCountForLevel(difficulty: TowerDifficulty, level: number): number {
  const cfg = TOWER_CONFIG[difficulty];
  const openingSafe = cfg.openingSafe?.[level];
  const safe = openingSafe ?? cfg.safe;
  return Math.max(1, Math.min(cfg.cols, safe));
}

/**
 * 為每一層決定哪些 col 是安全格（0-indexed）。
 * 使用 HMAC 打亂 col 順序，取前 safe 個為安全。
 */
export function towerLayout(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  difficulty: TowerDifficulty,
): number[][] {
  const { cols } = TOWER_CONFIG[difficulty];
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  const layout: number[][] = [];

  for (let level = 0; level < TOWER_LEVELS; level += 1) {
    const safe = towerSafeCountForLevel(difficulty, level);
    const positions = Array.from({ length: cols }, (_, i) => i);
    for (let i = cols - 1; i > 0; i -= 1) {
      const r = stream.next().value as number;
      const j = r % (i + 1);
      const a = positions[i] as number;
      const b = positions[j] as number;
      positions[i] = b;
      positions[j] = a;
    }
    layout.push(positions.slice(0, safe).sort((a, b) => a - b));
  }
  return layout;
}

export function towerMultiplier(
  difficulty: TowerDifficulty,
  currentLevel: number,
): number {
  if (currentLevel <= 0) return 1;
  const { cols } = TOWER_CONFIG[difficulty];
  let fair = 1;
  for (let level = 0; level < currentLevel; level += 1) {
    fair *= cols / towerSafeCountForLevel(difficulty, level);
  }
  const raw = fair <= 1 ? 1 : fair * (1 - TOWER_HOUSE_EDGE);
  return Math.floor(raw * 10000) / 10000;
}

export function towerNextMultiplier(
  difficulty: TowerDifficulty,
  currentLevel: number,
): number | null {
  if (currentLevel >= TOWER_LEVELS) return null;
  return towerMultiplier(difficulty, currentLevel + 1);
}
