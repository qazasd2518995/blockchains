export interface WinRecord {
  player: string;
  game: string;
  gameId: string;
  mult: number;
  win: number;
  tier?: 'hot' | 'mega' | 'jackpot';
}

export interface RankedWinRecord extends WinRecord {
  rank: number;
}

const GAME_POOL: Array<{
  game: string;
  gameId: string;
  minMult: number;
  maxMult: number;
  minWin: number;
  maxWin: number;
}> = [
  { game: '御龍百家', gameId: 'baccarat-imperial', minMult: 1.95, maxMult: 12, minWin: 18000, maxWin: 260000 },
  { game: '星耀百家', gameId: 'baccarat-nova', minMult: 1.95, maxMult: 9.5, minWin: 12000, maxWin: 180000 },
  { game: '21點', gameId: 'blackjack', minMult: 2, maxMult: 2.5, minWin: 8000, maxWin: 180000 },
  { game: '飆速X', gameId: 'jetx', minMult: 8, maxMult: 180, minWin: 28000, maxWin: 980000 },
  { game: '飆速X3', gameId: 'jetx3', minMult: 15, maxMult: 320, minWin: 56000, maxWin: 1680000 },
  { game: '飛行員', gameId: 'aviator', minMult: 6, maxMult: 140, minWin: 22000, maxWin: 860000 },
  { game: '火箭', gameId: 'rocket', minMult: 5, maxMult: 120, minWin: 16000, maxWin: 720000 },
  { game: '太空艦隊', gameId: 'space-fleet', minMult: 4, maxMult: 95, minWin: 12000, maxWin: 480000 },
  { game: '踩地雷', gameId: 'mines', minMult: 8, maxMult: 160, minWin: 24000, maxWin: 920000 },
  { game: '疊塔', gameId: 'tower', minMult: 4, maxMult: 80, minWin: 12000, maxWin: 360000 },
  { game: '掉珠挑戰X', gameId: 'plinko-x', minMult: 12, maxMult: 520, minWin: 52000, maxWin: 1880000 },
  { game: '彈珠台', gameId: 'plinko', minMult: 8, maxMult: 240, minWin: 26000, maxWin: 880000 },
  { game: '彩色轉輪', gameId: 'wheel', minMult: 6, maxMult: 70, minWin: 15000, maxWin: 260000 },
  { game: '迷你輪盤', gameId: 'mini-roulette', minMult: 5, maxMult: 120, minWin: 16000, maxWin: 440000 },
  { game: '狂歡節', gameId: 'carnival', minMult: 6, maxMult: 96, minWin: 18000, maxWin: 380000 },
  { game: '水果拉霸', gameId: 'fruit-slot', minMult: 25, maxMult: 900, minWin: 68000, maxWin: 2200000 },
  { game: '財虎拉霸', gameId: 'fortune-slot', minMult: 30, maxMult: 1200, minWin: 88000, maxWin: 3600000 },
  { game: '海神寶藏', gameId: 'ocean-slot', minMult: 18, maxMult: 760, minWin: 48000, maxWin: 1800000 },
  { game: '聖殿寶石', gameId: 'temple-slot', minMult: 20, maxMult: 850, minWin: 62000, maxWin: 2400000 },
  { game: '糖果派對', gameId: 'candy-slot', minMult: 16, maxMult: 680, minWin: 36000, maxWin: 1500000 },
  { game: '夜櫻武士', gameId: 'sakura-slot', minMult: 18, maxMult: 780, minWin: 46000, maxWin: 1780000 },
  { game: '雷神之鎚', gameId: 'thunder-slot', minMult: 25, maxMult: 1600, minWin: 88000, maxWin: 5200000 },
  { game: '龍焰巨輪', gameId: 'dragon-mega-slot', minMult: 28, maxMult: 1800, minWin: 96000, maxWin: 6200000 },
  { game: '星河寶藏', gameId: 'nebula-slot', minMult: 22, maxMult: 1400, minWin: 76000, maxWin: 4300000 },
  { game: '秘境遺跡', gameId: 'jungle-slot', minMult: 20, maxMult: 1200, minWin: 65000, maxWin: 3600000 },
  { game: '暗夜古堡', gameId: 'vampire-slot', minMult: 24, maxMult: 1500, minWin: 82000, maxWin: 4800000 },
  { game: '基諾', gameId: 'keno', minMult: 4, maxMult: 80, minWin: 9000, maxWin: 260000 },
  { game: '猜大小', gameId: 'hilo', minMult: 3, maxMult: 64, minWin: 8000, maxWin: 180000 },
  { game: '骰子', gameId: 'dice', minMult: 2, maxMult: 48, minWin: 6000, maxWin: 160000 },
];

const ACCOUNT_PREFIX = [
  'ak', 'bc', 'cn', 'dd', 'e9', 'fx', 'gg', 'hk', 'jy', 'kk', 'lo', 'mx', 'ny', 'op',
  'q7', 'rs', 'sv', 'tg', 'uo', 'vx', 'wm', 'xp', 'ya', 'z9', 'vip', 'ace', 'king',
  'bb', 'cc', 'dq', 'el', 'ft', 'gm', 'hn', 'io', 'jl', 'kr', 'lt', 'mn', 'np',
];

const ACCOUNT_SUFFIX = [
  '07', '18', '24', '31', '42', '56', '68', '73', '85', '96', '105', '119', '168',
  '207', '334', '369', '517', '520', '608', '729', '777', '880', '901', '952',
];

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomMaskedPlayer(): string {
  const prefix = randomFrom(ACCOUNT_PREFIX);
  const suffix = randomFrom(ACCOUNT_SUFFIX);
  const stars = Math.random() > 0.72 ? '****' : '***';
  return `${prefix}${stars}${suffix}`;
}

function roundWinAmount(value: number): number {
  if (value >= 1000000) return Math.round(value / 10000) * 10000;
  if (value >= 100000) return Math.round(value / 1000) * 1000;
  return Math.round(value / 100) * 100;
}

function classifyTier(win: number, mult: number): WinRecord['tier'] {
  if (win >= 1200000 || mult >= 500) return 'jackpot';
  if (win >= 420000 || mult >= 88) return 'mega';
  return 'hot';
}

export function createSimulatedWinRecord(existingPlayers: Set<string> = new Set()): WinRecord {
  let player = randomMaskedPlayer();
  let guard = 0;
  while (existingPlayers.has(player) && guard < 12) {
    player = randomMaskedPlayer();
    guard += 1;
  }

  const game = randomFrom(GAME_POOL);
  const spike = Math.random();
  const mult = Number(
    randomBetween(spike > 0.9 ? game.maxMult * 0.55 : game.minMult, game.maxMult).toFixed(2),
  );
  const win = roundWinAmount(randomBetween(game.minWin, game.maxWin) * (spike > 0.94 ? 1.4 : 1));

  return {
    player,
    game: game.game,
    gameId: game.gameId,
    mult,
    win,
    tier: classifyTier(win, mult),
  };
}

export function createSimulatedWinFeed(count: number): WinRecord[] {
  const players = new Set<string>();
  return Array.from({ length: count }, () => {
    const record = createSimulatedWinRecord(players);
    players.add(record.player);
    return record;
  });
}

export function createSimulatedTopWinners(count = 10): RankedWinRecord[] {
  const players = new Set<string>();
  return Array.from({ length: count + 8 }, () => {
    const record = createSimulatedWinRecord(players);
    players.add(record.player);
    return {
      ...record,
      win: Math.max(record.win, roundWinAmount(record.win * randomBetween(1.15, 2.2))),
    };
  })
    .sort((a, b) => b.win - a.win)
    .slice(0, count)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export const FAKE_WIN_TICKER: WinRecord[] = createSimulatedWinFeed(36);
export const FAKE_TODAY_TOP10: RankedWinRecord[] = createSimulatedTopWinners(10);

export const FAKE_ONLINE_BASE = 1247;

export function getDriftedOnlineCount(): number {
  return FAKE_ONLINE_BASE + Math.floor(Math.random() * 100 - 50);
}

export function reshuffleTop10(current: RankedWinRecord[]): RankedWinRecord[] {
  const next = current.map((row) => ({ ...row }));
  const currentPlayers = new Set(next.map((row) => row.player));

  for (let index = 0; index < next.length; index += 1) {
    const target = next[index];
    if (!target) continue;
    const shouldShuffle = index < 3 ? Math.random() < 0.28 : Math.random() < 0.72;
    if (!shouldShuffle) continue;

    if (index > 2 && Math.random() < 0.45) {
      const replacement = createSimulatedWinRecord(currentPlayers);
      currentPlayers.add(replacement.player);
      Object.assign(target, replacement);
      target.win = Math.max(replacement.win, roundWinAmount(replacement.win * randomBetween(1.05, 1.8)));
    } else {
      target.win = Math.max(1000, roundWinAmount(target.win * randomBetween(0.96, 1.22)));
      target.mult = Math.max(1.5, Number((target.mult * randomBetween(0.96, 1.16)).toFixed(2)));
      target.tier = classifyTier(target.win, target.mult);
    }
  }

  if (Math.random() < 0.65) {
    const challenger = createSimulatedWinRecord(currentPlayers);
    challenger.win = Math.max(challenger.win, roundWinAmount(challenger.win * randomBetween(1.2, 2.4)));
    next.push({ ...challenger, rank: next.length + 1 });
  }

  return next
    .sort((a, b) => b.win - a.win)
    .slice(0, 10)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
