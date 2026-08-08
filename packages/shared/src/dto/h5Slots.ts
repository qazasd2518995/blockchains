export const H5_SLOT_GAME_CODES = [
  '113',
  '116',
  '135',
  '155',
  '160',
  '161',
  '188',
  '232',
  '244',
  '252',
  '262',
  '264',
  '269',
  '271',
  '273',
  '276',
  '278',
  '281',
  '301',
  '302',
  '321',
] as const;

export type H5SlotGameCode = (typeof H5_SLOT_GAME_CODES)[number];

export const H5_FISH_GAME_CODES = ['2', '12', '13', '14'] as const;
export type H5FishGameCode = (typeof H5_FISH_GAME_CODES)[number];
export const H5_GAME_CODES = [...H5_SLOT_GAME_CODES, ...H5_FISH_GAME_CODES] as const;
export type H5GameCode = (typeof H5_GAME_CODES)[number];

export const H5_INDIVIDUAL_GAME_IDS = {
  H5_NINE_LINE_PULL_KING: 'h5-nine-line-pull-king',
  H5_WATER_MARGIN: 'h5-water-margin',
  H5_DIAMOND_STRIKE: 'h5-diamond-strike',
  H5_YU_PU_TUAN: 'h5-yu-pu-tuan',
  H5_FRUIT_LITTLE_MARY: 'h5-fruit-little-mary',
  H5_AZTEC_TREASURE: 'h5-aztec-treasure',
  H5_FIRE_88: 'h5-fire-88',
  H5_LUCKY_777: 'h5-lucky-777',
  H5_CAISHEN_FA_FA_FA: 'h5-caishen-fa-fa-fa',
  H5_FLYING_TOGETHER: 'h5-flying-together',
  H5_STAR_97: 'h5-star-97',
  H5_FORTUNE_OX: 'h5-fortune-ox',
  H5_MAHJONG_WAYS: 'h5-mahjong-ways',
  H5_MAHJONG_WAYS_2: 'h5-mahjong-ways-2',
  H5_DRAGON_HATCH: 'h5-dragon-hatch',
  H5_CAPTAINS_BOUNTY: 'h5-captains-bounty',
  H5_CAISHEN_WINS: 'h5-caishen-wins',
  H5_QUEEN_OF_BOUNTY: 'h5-queen-of-bounty',
  H5_GOLDEN_EMPIRE: 'h5-golden-empire',
  H5_FORTUNE_GEMS: 'h5-fortune-gems',
  H5_GATES_OF_OLYMPUS: 'h5-gates-of-olympus',
  H5_OCEAN_KING_2: 'h5-ocean-king-2',
  H5_DEEP_SEA_FISHING: 'h5-deep-sea-fishing',
  H5_THUNDER_FISHING: 'h5-thunder-fishing',
  H5_HAPPY_FISHING: 'h5-happy-fishing',
} as const;

export type H5IndividualGameId =
  (typeof H5_INDIVIDUAL_GAME_IDS)[keyof typeof H5_INDIVIDUAL_GAME_IDS];

export interface H5SlotGameDefinition {
  code: H5SlotGameCode;
  gameId: H5IndividualGameId;
  title: string;
  titleZh: string;
  scene: string;
}

export const H5_SLOT_GAMES: readonly H5SlotGameDefinition[] = [
  {
    code: '113',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_NINE_LINE_PULL_KING,
    title: 'Nine-Line Pull King',
    titleZh: '九線拉王',
    scene: 'Slot_9xianlawang',
  },
  {
    code: '116',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_WATER_MARGIN,
    title: 'Water Margin',
    titleZh: '水滸傳',
    scene: 'Slot_Shuihuzhuan',
  },
  {
    code: '135',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_DIAMOND_STRIKE,
    title: 'Diamond Strike',
    titleZh: '鑽石衝擊',
    scene: 'Slot_DiamondStrike',
  },
  {
    code: '155',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_YU_PU_TUAN,
    title: 'Yu Pu Tuan',
    titleZh: '玉蒲團',
    scene: 'Slot_Yuputuan',
  },
  {
    code: '160',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_FRUIT_LITTLE_MARY,
    title: 'Fruit Little Mary',
    titleZh: '水果小瑪莉',
    scene: 'Slot_Shuiguoxiaomali',
  },
  {
    code: '161',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_AZTEC_TREASURE,
    title: 'Aztec Treasure',
    titleZh: '阿茲特克寶藏',
    scene: 'Slot_aztec',
  },
  {
    code: '188',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_FIRE_88,
    title: 'Fire 88',
    titleZh: '火焰 88',
    scene: 'Slot_Fire88',
  },
  {
    code: '232',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_LUCKY_777,
    title: 'Lucky 777',
    titleZh: '幸運 777',
    scene: 'Slot_lucky777',
  },
  {
    code: '244',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_CAISHEN_FA_FA_FA,
    title: 'Caishen Fa Fa Fa',
    titleZh: '財神發發發',
    scene: 'Slot_caishenfafafa',
  },
  {
    code: '252',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_FLYING_TOGETHER,
    title: 'Flying Together',
    titleZh: '比翼雙飛',
    scene: 'Slot_biyishuangfei',
  },
  {
    code: '262',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_STAR_97,
    title: 'Star 97',
    titleZh: '明星 97',
    scene: 'Slot_mingxing972023',
  },
  {
    code: '264',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_FORTUNE_OX,
    title: 'Fortune Ox',
    titleZh: '招財金牛',
    scene: 'Slot_fortuneox',
  },
  {
    code: '269',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_MAHJONG_WAYS,
    title: 'Mahjong Ways',
    titleZh: '麻將胡了',
    scene: 'Slot_mahjongways',
  },
  {
    code: '271',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_MAHJONG_WAYS_2,
    title: 'Mahjong Ways 2',
    titleZh: '麻將胡了 2',
    scene: 'Slot_mahjongway2',
  },
  {
    code: '273',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_DRAGON_HATCH,
    title: 'Dragon Hatch',
    titleZh: '龍之孵化',
    scene: 'Slot_dragonhatch',
  },
  {
    code: '276',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_CAPTAINS_BOUNTY,
    title: "Captain's Bounty",
    titleZh: '船長賞金',
    scene: 'Slot_captainsbounty',
  },
  {
    code: '278',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_CAISHEN_WINS,
    title: 'Caishen Wins',
    titleZh: '財神贏',
    scene: 'Slot_caishenwins',
  },
  {
    code: '281',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_QUEEN_OF_BOUNTY,
    title: 'Queen of Bounty',
    titleZh: '賞金女王',
    scene: 'Slot_queenbounty',
  },
  {
    code: '301',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_GOLDEN_EMPIRE,
    title: 'Golden Empire',
    titleZh: '黃金帝國',
    scene: 'Slot_goldenempire',
  },
  {
    code: '302',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_FORTUNE_GEMS,
    title: 'Fortune Gems',
    titleZh: '幸運寶石',
    scene: 'Slot_fortunegems',
  },
  {
    code: '321',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_GATES_OF_OLYMPUS,
    title: 'Gates of Olympus',
    titleZh: '奧林匹斯之門',
    scene: 'Slot_gatesofolympushb',
  },
] as const;

export interface H5FishGameDefinition {
  code: H5FishGameCode;
  gameId: H5IndividualGameId;
  title: string;
  titleZh: string;
  scene: string;
}

export const H5_FISH_GAMES: readonly H5FishGameDefinition[] = [
  {
    code: '2',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_OCEAN_KING_2,
    title: 'Ocean King 2',
    titleZh: '海王 2',
    scene: 'Fish_haiwang2Main',
  },
  {
    code: '12',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_DEEP_SEA_FISHING,
    title: 'Deep Sea Fishing',
    titleZh: '深海捕魚',
    scene: 'FishshenhaibuyuMain',
  },
  {
    code: '13',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_THUNDER_FISHING,
    title: 'Thunder Fishing',
    titleZh: '雷霆戰機',
    scene: 'FishleitingzhanjiMain',
  },
  {
    code: '14',
    gameId: H5_INDIVIDUAL_GAME_IDS.H5_HAPPY_FISHING,
    title: 'Happy Fishing',
    titleZh: '快樂捕魚',
    scene: 'FishkuailebuyuMain',
  },
] as const;

export const H5_GAMES = [...H5_SLOT_GAMES, ...H5_FISH_GAMES] as const;
export const H5_GAME_IDS = H5_GAMES.map((game) => game.gameId) as readonly H5IndividualGameId[];

const H5_GAME_BY_CODE = new Map<H5GameCode, (typeof H5_GAMES)[number]>(
  H5_GAMES.map((game) => [game.code, game]),
);
const H5_GAME_ID_SET = new Set<string>(H5_GAME_IDS);

export function getH5GameByCode(code: H5GameCode): (typeof H5_GAMES)[number] {
  return H5_GAME_BY_CODE.get(code)!;
}

export function isH5IndividualGameId(value: string): value is H5IndividualGameId {
  return H5_GAME_ID_SET.has(value);
}

export function isH5SlotGameCode(value: string): value is H5SlotGameCode {
  return H5_SLOT_GAME_CODES.includes(value as H5SlotGameCode);
}

export function isH5FishGameCode(value: string): value is H5FishGameCode {
  return H5_FISH_GAME_CODES.includes(value as H5FishGameCode);
}

export function isH5GameCode(value: string): value is H5GameCode {
  return H5_GAME_CODES.includes(value as H5GameCode);
}
