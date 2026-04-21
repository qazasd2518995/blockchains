export interface WinRecord {
  player: string;   // 遮蔽后的显示名，例：'a***995'
  game: string;     // 游戏中文名
  gameId: string;   // 对應 GameId
  mult: number;     // 倍率
  win: number;      // 赢得点数
}

export interface RankedWinRecord extends WinRecord {
  rank: number;
}

// 全部 18 款游戏都要出现过
export const FAKE_WIN_TICKER: WinRecord[] = [
  { player: 'a***995', game: '飙速X',      gameId: 'jetx',         mult: 24.6,  win: 12450  },
  { player: 'b***123', game: '飞行员',      gameId: 'aviator',      mult: 88.0,  win: 88000  },
  { player: 'c***456', game: '踩地雷',      gameId: 'mines',        mult: 45.5,  win: 45200  },
  { player: 'd***789', game: '弹珠台',      gameId: 'plinko',       mult: 32.0,  win: 12800  },
  { player: 'e***012', game: '骰子',        gameId: 'dice',         mult: 9.9,   win: 4950   },
  { player: 'f***234', game: '火箭',        gameId: 'rocket',       mult: 16.07, win: 80350  },
  { player: 'g***567', game: '热线',        gameId: 'hotline',      mult: 1000,  win: 500000 },
  { player: 'h***890', game: '叠塔',        gameId: 'tower',        mult: 5.4,   win: 16200  },
  { player: 'i***111', game: '猜大小',      gameId: 'hilo',         mult: 3.2,   win: 6400   },
  { player: 'j***222', game: '基诺',        gameId: 'keno',         mult: 2.1,   win: 2100   },
  { player: 'k***333', game: '彩色转轮',    gameId: 'wheel',        mult: 4.8,   win: 7200   },
  { player: 'l***444', game: '迷你轮盘',    gameId: 'mini-roulette', mult: 11.5, win: 34500  },
  { player: 'm***555', game: '太空舰队',    gameId: 'space-fleet',  mult: 8.7,   win: 26100  },
  { player: 'n***666', game: '气球',        gameId: 'balloon',      mult: 14.2,  win: 28400  },
  { player: 'o***777', game: '飙速X3',      gameId: 'jetx3',        mult: 52.0,  win: 156000 },
  { player: 'p***888', game: '双倍X',       gameId: 'double-x',     mult: 7.3,   win: 14600  },
  { player: 'q***999', game: '掉珠挑战X',   gameId: 'plinko-x',     mult: 19.9,  win: 39800  },
  { player: 'r***000', game: '狂欢节',      gameId: 'carnival',     mult: 6.6,   win: 13200  },
  // 再來一轮加变化，让总数 > 18
  { player: 's***112', game: '飞行员',      gameId: 'aviator',      mult: 12.3,  win: 18450  },
  { player: 't***334', game: '飙速X',       gameId: 'jetx',         mult: 44.0,  win: 88000  },
  { player: 'u***556', game: '踩地雷',      gameId: 'mines',        mult: 18.8,  win: 56400  },
  { player: 'v***778', game: '弹珠台',      gameId: 'plinko',       mult: 9.1,   win: 18200  },
  { player: 'w***990', game: '骰子',        gameId: 'dice',         mult: 5.5,   win: 11000  },
  { player: 'x***113', game: '热线',        gameId: 'hotline',      mult: 250,   win: 125000 },
  { player: 'y***224', game: '火箭',        gameId: 'rocket',       mult: 3.8,   win: 7600   },
  { player: 'z***335', game: '叠塔',        gameId: 'tower',        mult: 2.7,   win: 5400   },
];

export const FAKE_TODAY_TOP10: RankedWinRecord[] = [
  { rank: 1,  player: 'V***IP1',  game: '飙速X',      gameId: 'jetx',      mult: 88.0, win: 880000 },
  { rank: 2,  player: 'a***995',  game: '踩地雷',     gameId: 'mines',     mult: 45.5, win: 452000 },
  { rank: 3,  player: 'b***123',  game: '飞行员',     gameId: 'aviator',   mult: 32.0, win: 128000 },
  { rank: 4,  player: 'c***456',  game: '热线',       gameId: 'hotline',   mult: 500,  win: 100000 },
  { rank: 5,  player: 'd***789',  game: '弹珠台',     gameId: 'plinko',    mult: 18.5, win: 74000  },
  { rank: 6,  player: 'e***012',  game: '火箭',       gameId: 'rocket',    mult: 22.0, win: 66000  },
  { rank: 7,  player: 'f***234',  game: '飙速X3',     gameId: 'jetx3',     mult: 12.0, win: 48000  },
  { rank: 8,  player: 'g***567',  game: '气球',       gameId: 'balloon',   mult: 9.5,  win: 28500  },
  { rank: 9,  player: 'h***890',  game: '迷你轮盘',   gameId: 'mini-roulette', mult: 11.0, win: 22000 },
  { rank: 10, player: 'i***111',  game: '叠塔',       gameId: 'tower',     mult: 5.0,  win: 15000  },
];

export const FAKE_ONLINE_BASE = 1247;

export function getDriftedOnlineCount(): number {
  return FAKE_ONLINE_BASE + Math.floor(Math.random() * 100 - 50);
}

// 洗牌工具：前 3 名变动机率 10%、后 7 名变动机率 50%
export function reshuffleTop10(current: RankedWinRecord[]): RankedWinRecord[] {
  const next = current.map((r) => ({ ...r }));
  for (let i = 0; i < next.length; i++) {
    const target = next[i];
    if (!target) continue;
    const shouldShuffle = i < 3 ? Math.random() < 0.1 : Math.random() < 0.5;
    if (!shouldShuffle) continue;
    // 小幅度抖动 win / mult
    target.win = Math.max(1000, Math.floor(target.win * (0.9 + Math.random() * 0.25)));
    target.mult = Math.max(1.5, Number((target.mult * (0.9 + Math.random() * 0.25)).toFixed(2)));
  }
  // 按 win 重新排序
  next.sort((a, b) => b.win - a.win);
  return next.map((r, idx) => ({ ...r, rank: idx + 1 }));
}
