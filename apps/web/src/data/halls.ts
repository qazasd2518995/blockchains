import type { GameIdType } from '@bg/shared';
import { GameId } from '@bg/shared';

export type HallId = 'crash' | 'tables' | 'slots' | 'roulette' | 'classic' | 'strategy';

export interface HallMeta {
  id: HallId;
  nameZh: string;
  iconKey: string;
  tagline: string;
  gradient: string;
  artwork: string;
  gameIds: GameIdType[];
}

export const HALLS: Record<HallId, HallMeta> = {
  crash: {
    id: 'crash',
    nameZh: 'Crash 飞行馆',
    iconKey: 'crash',
    tagline: '倍速起飛，看準時機一鍵收分',
    gradient: 'linear-gradient(135deg, #051E2B 0%, #186073 50%, #D4574A 100%)',
    artwork: '/halls/crash-card.png',
    gameIds: [
      GameId.ROCKET,
      GameId.AVIATOR,
      GameId.SPACE_FLEET,
      GameId.JETX,
      GameId.BALLOON,
      GameId.JETX3,
      GameId.DOUBLE_X,
    ],
  },
  tables: {
    id: 'tables',
    nameZh: '棋牌牌桌馆',
    iconKey: 'tables',
    tagline: '看牌路、拚手牌，專注每一局牌桌節奏',
    gradient: 'linear-gradient(135deg, #1B2030 0%, #225B66 46%, #C9A247 100%)',
    artwork: '/halls/tables-card.png',
    gameIds: [
      GameId.BACCARAT,
      GameId.BACCARAT_NOVA,
      GameId.BACCARAT_IMPERIAL,
      GameId.BLACKJACK,
      GameId.HILO,
    ],
  },
  slots: {
    id: 'slots',
    nameZh: '拉霸老虎机馆',
    iconKey: 'slots',
    tagline: '多款主題老虎機，轉軸、連線、爆分節奏集中開',
    gradient: 'linear-gradient(135deg, #111827 0%, #7C2D12 48%, #C9A247 100%)',
    artwork: '/halls/slots-card.png',
    gameIds: [
      GameId.HOTLINE,
      GameId.FRUIT_SLOT,
      GameId.FORTUNE_SLOT,
      GameId.OCEAN_SLOT,
      GameId.TEMPLE_SLOT,
      GameId.CANDY_SLOT,
      GameId.SAKURA_SLOT,
      GameId.THUNDER_SLOT,
      GameId.DRAGON_MEGA_SLOT,
      GameId.NEBULA_SLOT,
      GameId.JUNGLE_SLOT,
      GameId.VAMPIRE_SLOT,
    ],
  },
  roulette: {
    id: 'roulette',
    nameZh: '轮盘转轮馆',
    iconKey: 'roulette',
    tagline: '指針、輪盤、轉輪一次排開，押區押色都直覺',
    gradient: 'linear-gradient(135deg, #0F172A 0%, #145369 52%, #D6B75B 100%)',
    artwork: '/halls/roulette-card.png',
    gameIds: [GameId.WHEEL, GameId.MINI_ROULETTE, GameId.CARNIVAL],
  },
  classic: {
    id: 'classic',
    nameZh: '即开电子馆',
    iconKey: 'classic',
    tagline: '骰子、基諾、彈珠這類短局即開玩法集中在這裡',
    gradient: 'linear-gradient(135deg, #186073 0%, #266F85 50%, #408A9D 100%)',
    artwork: '/halls/classic-card.png',
    gameIds: [
      GameId.DICE,
      GameId.KENO,
      GameId.PLINKO,
      GameId.PLINKO_X,
    ],
  },
  strategy: {
    id: 'strategy',
    nameZh: '策略挑战馆',
    iconKey: 'strategy',
    tagline: '逐步選擇、隨時收手，靠判斷把倍率一路推高',
    gradient: 'linear-gradient(135deg, #0E4555 0%, #266F85 50%, #C9A247 100%)',
    artwork: '/halls/strategy-card.png',
    gameIds: [GameId.MINES, GameId.TOWER],
  },
};

export const HALL_LIST: HallMeta[] = [
  HALLS.crash,
  HALLS.tables,
  HALLS.slots,
  HALLS.roulette,
  HALLS.classic,
  HALLS.strategy,
];

export function getHallByGameId(gameId: string): HallMeta | undefined {
  return HALL_LIST.find((h) => h.gameIds.includes(gameId as GameIdType));
}
