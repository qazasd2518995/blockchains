import type { GameIdType } from '@bg/shared';
import { GameId } from '@bg/shared';

export type HallId = 'crash' | 'classic' | 'strategy';

export interface HallMeta {
  id: HallId;
  nameZh: string;
  iconKey: string;
  tagline: string;
  gradient: string;
  gameIds: GameIdType[];
}

export const HALLS: Record<HallId, HallMeta> = {
  crash: {
    id: 'crash',
    nameZh: 'Crash 飞行馆',
    iconKey: 'crash',
    tagline: '倍率无上限，敢飞敢收',
    gradient: 'linear-gradient(135deg, #051E2B 0%, #186073 50%, #D4574A 100%)',
    gameIds: [
      GameId.ROCKET,
      GameId.AVIATOR,
      GameId.SPACE_FLEET,
      GameId.JETX,
      GameId.BALLOON,
      GameId.JETX3,
      GameId.DOUBLE_X,
      GameId.PLINKO_X,
    ],
  },
  classic: {
    id: 'classic',
    nameZh: '经典电子馆',
    iconKey: 'classic',
    tagline: '经典玩法，纯粹手感',
    gradient: 'linear-gradient(135deg, #186073 0%, #266F85 50%, #408A9D 100%)',
    gameIds: [
      GameId.DICE,
      GameId.HILO,
      GameId.KENO,
      GameId.WHEEL,
      GameId.MINI_ROULETTE,
      GameId.HOTLINE,
    ],
  },
  strategy: {
    id: 'strategy',
    nameZh: '策略电子馆',
    iconKey: 'strategy',
    tagline: '策略取胜，拆弹解谜',
    gradient: 'linear-gradient(135deg, #0E4555 0%, #266F85 50%, #C9A247 100%)',
    gameIds: [GameId.MINES, GameId.PLINKO, GameId.TOWER, GameId.CARNIVAL],
  },
};

export const HALL_LIST: HallMeta[] = [HALLS.crash, HALLS.classic, HALLS.strategy];

export function getHallByGameId(gameId: string): HallMeta | undefined {
  return HALL_LIST.find((h) => h.gameIds.includes(gameId as GameIdType));
}
