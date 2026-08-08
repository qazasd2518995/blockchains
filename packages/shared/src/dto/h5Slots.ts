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

export interface H5SlotGameDefinition {
  code: H5SlotGameCode;
  title: string;
  titleZh: string;
  scene: string;
}

export const H5_SLOT_GAMES: readonly H5SlotGameDefinition[] = [
  { code: '113', title: 'Nine-Line Pull King', titleZh: '九線拉王', scene: 'Slot_9xianlawang' },
  { code: '116', title: 'Water Margin', titleZh: '水滸傳', scene: 'Slot_Shuihuzhuan' },
  { code: '135', title: 'Diamond Strike', titleZh: '鑽石衝擊', scene: 'Slot_DiamondStrike' },
  { code: '155', title: 'Yu Pu Tuan', titleZh: '玉蒲團', scene: 'Slot_Yuputuan' },
  { code: '160', title: 'Fruit Little Mary', titleZh: '水果小瑪莉', scene: 'Slot_Shuiguoxiaomali' },
  { code: '161', title: 'Aztec Treasure', titleZh: '阿茲特克寶藏', scene: 'Slot_aztec' },
  { code: '188', title: 'Fire 88', titleZh: '火焰 88', scene: 'Slot_Fire88' },
  { code: '232', title: 'Lucky 777', titleZh: '幸運 777', scene: 'Slot_lucky777' },
  { code: '244', title: 'Caishen Fa Fa Fa', titleZh: '財神發發發', scene: 'Slot_caishenfafafa' },
  { code: '252', title: 'Flying Together', titleZh: '比翼雙飛', scene: 'Slot_biyishuangfei' },
  { code: '262', title: 'Star 97', titleZh: '明星 97', scene: 'Slot_mingxing972023' },
  { code: '264', title: 'Fortune Ox', titleZh: '招財金牛', scene: 'Slot_fortuneox' },
  { code: '269', title: 'Mahjong Ways', titleZh: '麻將胡了', scene: 'Slot_mahjongways' },
  { code: '271', title: 'Mahjong Ways 2', titleZh: '麻將胡了 2', scene: 'Slot_mahjongway2' },
  { code: '273', title: 'Dragon Hatch', titleZh: '龍之孵化', scene: 'Slot_dragonhatch' },
  { code: '276', title: "Captain's Bounty", titleZh: '船長賞金', scene: 'Slot_captainsbounty' },
  { code: '278', title: 'Caishen Wins', titleZh: '財神贏', scene: 'Slot_caishenwins' },
  { code: '281', title: 'Queen of Bounty', titleZh: '賞金女王', scene: 'Slot_queenbounty' },
  { code: '301', title: 'Golden Empire', titleZh: '黃金帝國', scene: 'Slot_goldenempire' },
  { code: '302', title: 'Fortune Gems', titleZh: '幸運寶石', scene: 'Slot_fortunegems' },
  { code: '321', title: 'Gates of Olympus', titleZh: '奧林匹斯之門', scene: 'Slot_gatesofolympushb' },
] as const;

export interface H5FishGameDefinition {
  code: H5FishGameCode;
  title: string;
  titleZh: string;
  scene: string;
}

export const H5_FISH_GAMES: readonly H5FishGameDefinition[] = [
  { code: '2', title: 'Ocean King 2', titleZh: '海王 2', scene: 'Fish_haiwang2Main' },
  { code: '12', title: 'Deep Sea Fishing', titleZh: '深海捕魚', scene: 'FishshenhaibuyuMain' },
  { code: '13', title: 'Thunder Fishing', titleZh: '雷霆戰機', scene: 'FishleitingzhanjiMain' },
  { code: '14', title: 'Happy Fishing', titleZh: '快樂捕魚', scene: 'FishkuailebuyuMain' },
] as const;

export const H5_GAMES = [...H5_SLOT_GAMES, ...H5_FISH_GAMES] as const;

export function isH5SlotGameCode(value: string): value is H5SlotGameCode {
  return H5_SLOT_GAME_CODES.includes(value as H5SlotGameCode);
}

export function isH5FishGameCode(value: string): value is H5FishGameCode {
  return H5_FISH_GAME_CODES.includes(value as H5FishGameCode);
}

export function isH5GameCode(value: string): value is H5GameCode {
  return H5_GAME_CODES.includes(value as H5GameCode);
}
