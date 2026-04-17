import { hmacIntStream } from './hmac.js';

export type TowerDifficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export const TOWER_LEVELS = 9;
export const TOWER_HOUSE_EDGE = 0.03;

// 每個難度：每層有 cols 格，safe 格數 / 陷阱數
export const TOWER_CONFIG: Record<
  TowerDifficulty,
  { cols: number; safe: number }
> = {
  easy: { cols: 4, safe: 3 },
  medium: { cols: 3, safe: 2 },
  hard: { cols: 2, safe: 1 },
  expert: { cols: 3, safe: 1 },
  master: { cols: 4, safe: 1 },
};

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
  const { cols, safe } = TOWER_CONFIG[difficulty];
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  const layout: number[][] = [];

  for (let level = 0; level < TOWER_LEVELS; level += 1) {
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
  const { cols, safe } = TOWER_CONFIG[difficulty];
  const single = cols / safe;
  const raw = Math.pow(single, currentLevel) * (1 - TOWER_HOUSE_EDGE);
  return Math.floor(raw * 10000) / 10000;
}

export function towerNextMultiplier(
  difficulty: TowerDifficulty,
  currentLevel: number,
): number | null {
  if (currentLevel >= TOWER_LEVELS) return null;
  return towerMultiplier(difficulty, currentLevel + 1);
}
