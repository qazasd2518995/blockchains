import type { GameIdType } from '@bg/shared';
import { GameId } from '@bg/shared';

export type HallId = 'crash' | 'classic' | 'strategy' | 'tables';

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
  classic: {
    id: 'classic',
    nameZh: '经典电子馆',
    iconKey: 'classic',
    tagline: '經典熱桌連開不停，手感一來就停不下',
    gradient: 'linear-gradient(135deg, #186073 0%, #266F85 50%, #408A9D 100%)',
    artwork: '/halls/classic-card.png',
    gameIds: [
      GameId.DICE,
      GameId.HILO,
      GameId.KENO,
      GameId.WHEEL,
      GameId.MINI_ROULETTE,
      GameId.HOTLINE,
      GameId.FRUIT_SLOT,
      GameId.FORTUNE_SLOT,
      GameId.OCEAN_SLOT,
    ],
  },
  strategy: {
    id: 'strategy',
    nameZh: '策略电子馆',
    iconKey: 'strategy',
    tagline: '邊判斷邊拚高倍，越玩越上頭',
    gradient: 'linear-gradient(135deg, #0E4555 0%, #266F85 50%, #C9A247 100%)',
    artwork: '/halls/strategy-card.png',
    gameIds: [GameId.MINES, GameId.PLINKO, GameId.PLINKO_X, GameId.TOWER, GameId.CARNIVAL],
  },
  tables: {
    id: 'tables',
    nameZh: '牌桌馆',
    iconKey: 'tables',
    tagline: '局局封盘开牌，专注牌路、节奏与桌感',
    gradient: 'linear-gradient(135deg, #1B2030 0%, #225B66 46%, #C9A247 100%)',
    artwork: '/halls/tables-card.png',
    gameIds: [GameId.BACCARAT],
  },
};

export const HALL_LIST: HallMeta[] = [HALLS.crash, HALLS.classic, HALLS.strategy, HALLS.tables];

export function getHallByGameId(gameId: string): HallMeta | undefined {
  return HALL_LIST.find((h) => h.gameIds.includes(gameId as GameIdType));
}
