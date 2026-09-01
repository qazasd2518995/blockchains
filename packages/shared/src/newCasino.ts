import { GameId, isImportedGameTestUsername } from './games.js';

export const NEW_CASINO_CATALOG_VERSION = 5;

export type NewCasinoCategory = '熱門' | '拉霸' | '捕魚' | '棋牌';

export interface NewCasinoGame {
  id: string;
  name: string;
  nameEn: string;
  category: NewCasinoCategory;
  cover: string;
  route: string;
  featured: boolean;
  badge?: '熱門' | '新品';
  restricted: boolean;
}

const ORIGINAL_H5_COVERS = new Set<string>([
  GameId.H5_FORTUNE_OX,
  GameId.H5_DRAGON_HATCH,
  GameId.H5_CAPTAINS_BOUNTY,
  GameId.H5_QUEEN_OF_BOUNTY,
]);

function h5Cover(gameId: string): string {
  const source = ORIGINAL_H5_COVERS.has(gameId) ? 'original' : 'generated';
  return `/game-art/${source}/h5-individual/${gameId}-cover-v1.webp`;
}

function h5Game(
  id: string,
  name: string,
  nameEn: string,
  category: Extract<NewCasinoCategory, '拉霸' | '捕魚'>,
): NewCasinoGame {
  return {
    id,
    name,
    nameEn,
    category,
    cover: h5Cover(id),
    route: `/games/${id}`,
    featured: false,
    restricted: true,
  };
}

function megaSlot(id: string, name: string, nameEn: string, theme: string): NewCasinoGame {
  return {
    id,
    name,
    nameEn,
    category: '拉霸',
    cover: `/slots/${theme}/cover-v2.png`,
    route: `/games/${id}`,
    featured: false,
    restricted: true,
  };
}

function tableGame(
  id: string,
  name: string,
  nameEn: string,
  cover: string,
  options: { route?: string } = {},
): NewCasinoGame {
  return {
    id,
    name,
    nameEn,
    category: '棋牌',
    cover,
    route: options.route ?? `/games/${id}`,
    featured: false,
    restricted: true,
  };
}

const POPULAR_GAMES: readonly NewCasinoGame[] = [
  {
    id: GameId.STORM_OF_SETH_2,
    name: '戰神賽特 II：覺醒之力',
    nameEn: 'Storm of Seth 2 – Awakening',
    category: '熱門',
    cover: '/game-art/original/storm-of-seth-2-cover-v1.webp',
    route: '/games/storm-of-seth-2',
    featured: true,
    badge: '熱門',
    restricted: true,
  },
  {
    id: GameId.POWER_OF_THOR_2,
    name: '雷神之錘 2：雷霆風暴',
    nameEn: 'Power of Thor II: Thunder Storm',
    category: '熱門',
    cover: '/game-art/original/power-of-thor-2-cover-v1.png',
    route: '/games/power-of-thor-2',
    featured: true,
    badge: '新品',
    restricted: true,
  },
  {
    id: GameId.FRUIT_MARY,
    name: '歡樂水果機',
    nameEn: 'Fruit Mary',
    category: '熱門',
    cover: '/game-art/generated/fruit-mary-cover-v1.png',
    route: '/games/fruit-mary',
    featured: true,
    badge: '熱門',
    restricted: true,
  },
];

const SLOT_GAMES: readonly NewCasinoGame[] = [
  h5Game(GameId.H5_CAPTAINS_BOUNTY, '船長賞金', "Captain's Bounty", '拉霸'),
  h5Game(GameId.H5_FORTUNE_OX, '招財金牛', 'Fortune Ox', '拉霸'),
  h5Game(GameId.H5_DRAGON_HATCH, '龍之孵化', 'Dragon Hatch', '拉霸'),
  h5Game(GameId.H5_QUEEN_OF_BOUNTY, '賞金女王', 'Queen of Bounty', '拉霸'),
  h5Game(GameId.H5_FORTUNE_GEMS, '幸運寶石', 'Fortune Gems', '拉霸'),
  h5Game(GameId.H5_GATES_OF_OLYMPUS, '奧林匹斯之門', 'Gates of Olympus', '拉霸'),
  megaSlot(GameId.FRUIT_SLOT, '水果拉霸', 'Fruit Slots', 'fruit'),
  megaSlot(GameId.SAKURA_SLOT, '夜櫻武士', 'Sakura Blade 3x3', 'sakura'),
  megaSlot(GameId.THUNDER_SLOT, '索爾神槌', 'Thor Hammer Mega', 'thunder'),
  megaSlot(GameId.VAMPIRE_SLOT, '暗夜古堡', 'Vampire Castle Mega', 'vampire'),
];

const FISH_GAMES: readonly NewCasinoGame[] = [
  h5Game(GameId.H5_DEEP_SEA_FISHING, '深海捕魚', 'Deep Sea Fishing', '捕魚'),
  h5Game(GameId.H5_HAPPY_FISHING, '快樂捕魚', 'Happy Fishing', '捕魚'),
  h5Game(GameId.H5_THUNDER_FISHING, '雷霆戰機', 'Thunder Fishing', '捕魚'),
];

const TABLE_GAMES: readonly NewCasinoGame[] = [
  tableGame(GameId.BLACKJACK, '皇家21點', 'Royal Blackjack', '/game-art/blackjack/cover-v2.png', {
    route: '/games/blackjack',
  }),
  tableGame('blackjack-table-2', '經典21點', 'Classic Blackjack', '/game-art/blackjack/cover.png', {
    route: '/games/blackjack',
  }),
  tableGame(
    GameId.TWENTY_ONE_HALF_DOLL,
    '萌娃十點半',
    'Dolly 10.5',
    '/game-art/local-table/ten-half-doll-cover.webp',
  ),
  tableGame(
    GameId.TWENTY_ONE_HALF_BUNNY,
    '兔糖十點半',
    'Bunny 10.5',
    '/game-art/local-table/ten-half-bunny-cover.webp',
  ),
  tableGame(
    GameId.BLACK_DOT_TIANJIU,
    '天九黑粒',
    'Tin Kau Black Dot',
    '/game-art/local-table/black-dot-tianjiu-cover.webp',
  ),
  tableGame(
    GameId.BLACK_DOT_ROYAL,
    '御殿黑粒',
    'Royal Black Dot',
    '/game-art/local-table/black-dot-royal-cover.webp',
  ),
  tableGame(GameId.MINES, '踩地雷', 'Mines', '/game-art/mines/cover-v2.png'),
  tableGame(GameId.TOWER, '爬階梯', 'Stairs', '/game-art/tower/cover-v2.png'),
  tableGame(
    GameId.TUI_TONGZI_DRAGON,
    '龍門推筒',
    'Dragon Tongzi',
    '/game-art/local-table/tui-tongzi-dragon-cover.webp',
  ),
  tableGame(
    GameId.TUI_TONGZI_JADE,
    '玉兔推索',
    'Jade Suozi',
    '/game-art/local-table/tui-suozi-jade-cover.webp',
  ),
  tableGame(
    GameId.TUI_TONGZI_GOLD,
    '金殿推萬',
    'Golden Wanzi',
    '/game-art/local-table/tui-wanzi-gold-cover.webp',
  ),
];

export const NEW_CASINO_GAMES: readonly NewCasinoGame[] = [
  ...POPULAR_GAMES,
  ...SLOT_GAMES,
  ...FISH_GAMES,
  ...TABLE_GAMES,
];

export function getNewCasinoGamesForUsername(username?: string | null): readonly NewCasinoGame[] {
  return isImportedGameTestUsername(username) ? NEW_CASINO_GAMES : [];
}
