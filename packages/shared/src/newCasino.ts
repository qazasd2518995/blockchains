import { H5_FISH_GAMES, H5_SLOT_GAMES } from './dto/h5Slots.js';
import { GameId, isImportedGameTestUsername } from './games.js';

export const NEW_CASINO_CATALOG_VERSION = 1;

export type NewCasinoCategory = '賽特' | '雷神' | 'H5拉霸' | '捕魚' | 'MegaSlot';

export interface NewCasinoGame {
  id: string;
  name: string;
  nameEn: string;
  provider: string;
  category: NewCasinoCategory;
  cover: string;
  route: string;
  featured: boolean;
  badge?: '熱門' | '新品' | '原版';
  restricted: boolean;
}

const ORIGINAL_H5_COVERS = new Set([
  'h5-fire-88',
  'h5-lucky-777',
  'h5-fortune-ox',
  'h5-mahjong-ways',
  'h5-mahjong-ways-2',
  'h5-dragon-hatch',
  'h5-captains-bounty',
  'h5-caishen-wins',
  'h5-queen-of-bounty',
]);

function h5Cover(gameId: string): string {
  const source = ORIGINAL_H5_COVERS.has(gameId) ? 'original' : 'generated';
  return `/game-art/${source}/h5-individual/${gameId}-cover-v1.webp`;
}

const H5_SLOT_CATALOG: readonly NewCasinoGame[] = H5_SLOT_GAMES.map((game, index) => ({
  id: game.gameId,
  name: game.titleZh,
  nameEn: game.title,
  provider: '原版 H5',
  category: 'H5拉霸',
  cover: h5Cover(game.gameId),
  route: `/games/${game.gameId}`,
  featured: index < 6,
  badge: ORIGINAL_H5_COVERS.has(game.gameId) ? '原版' : index < 3 ? '新品' : undefined,
  restricted: true,
}));

const H5_FISH_CATALOG: readonly NewCasinoGame[] = H5_FISH_GAMES.map((game, index) => ({
  id: game.gameId,
  name: game.titleZh,
  nameEn: game.title,
  provider: '原版 H5',
  category: '捕魚',
  cover: h5Cover(game.gameId),
  route: `/games/${game.gameId}`,
  featured: index === 0,
  badge: index === 0 ? '新品' : undefined,
  restricted: true,
}));

const MEGA_SLOT_CATALOG: readonly NewCasinoGame[] = [
  ['fruit-slot', '水果拉霸', 'Fruit Slot', 'fruit'],
  ['fortune-slot', '財虎拉霸', 'Fortune Tiger', 'fortune'],
  ['ocean-slot', '海神寶藏', 'Ocean Treasure', 'ocean'],
  ['temple-slot', '聖殿寶石', 'Temple Gems', 'temple'],
  ['candy-slot', '糖果派對', 'Candy Party', 'candy'],
  ['sakura-slot', '夜櫻武士', 'Sakura Samurai', 'sakura'],
  ['thunder-slot', '索爾神槌', 'Thunder Hammer', 'thunder'],
  ['dragon-mega-slot', '龍焰巨輪', 'Dragon Mega', 'dragon-mega'],
  ['nebula-slot', '星河寶藏', 'Nebula Treasure', 'nebula'],
  ['jungle-slot', '秘境遺跡', 'Jungle Relics', 'jungle'],
  ['vampire-slot', '暗夜古堡', 'Vampire Castle', 'vampire'],
].map(([id, name, nameEn, theme], index) => ({
  id: id!,
  name: name!,
  nameEn: nameEn!,
  provider: 'YACHIYO MEGA',
  category: 'MegaSlot' as const,
  cover: `/slots/${theme}/cover-v2.png`,
  route: `/games/${id}`,
  featured: index < 4,
  badge: index === 0 ? ('熱門' as const) : index >= 7 ? ('新品' as const) : undefined,
  restricted: false,
}));

export const NEW_CASINO_GAMES: readonly NewCasinoGame[] = [
  {
    id: GameId.POWER_OF_THOR_2,
    name: '雷神之錘 2：雷霆風暴',
    nameEn: 'Power of Thor II: Thunder Storm',
    provider: 'RSG',
    category: '雷神',
    cover: '/_optimized/game-art/original/power-of-thor-2-cover-v1@960.webp',
    route: '/games/power-of-thor-2',
    featured: true,
    badge: '新品',
    restricted: true,
  },
  {
    id: GameId.STORM_OF_SETH_2,
    name: '戰神賽特 II：覺醒之力',
    nameEn: 'Storm of Seth 2 – Awakening',
    provider: 'ATG',
    category: '賽特',
    cover: '/game-art/original/storm-of-seth-2-cover-v1.webp',
    route: '/games/storm-of-seth-2',
    featured: true,
    badge: '熱門',
    restricted: true,
  },
  {
    id: GameId.FRUIT_MARY,
    name: '歡樂水果機',
    nameEn: 'Fruit Mary',
    provider: 'YACHIYO CLASSIC',
    category: 'H5拉霸',
    cover: '/game-art/generated/fruit-mary-cover-v1.png',
    route: '/games/fruit-mary',
    featured: true,
    badge: '熱門',
    restricted: true,
  },
  ...H5_SLOT_CATALOG,
  ...H5_FISH_CATALOG,
  ...MEGA_SLOT_CATALOG,
];

export function getNewCasinoGamesForUsername(username?: string | null): readonly NewCasinoGame[] {
  return isImportedGameTestUsername(username) ? NEW_CASINO_GAMES : [];
}
