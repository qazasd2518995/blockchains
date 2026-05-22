export type SlotThemeId =
  | 'cyber'
  | 'fruit'
  | 'fortune'
  | 'ocean'
  | 'temple'
  | 'candy'
  | 'sakura'
  | 'thunder'
  | 'dragonMega'
  | 'nebula'
  | 'jungle'
  | 'vampire';

export type SlotGameId =
  | 'hotline'
  | 'fruit-slot'
  | 'fortune-slot'
  | 'ocean-slot'
  | 'temple-slot'
  | 'candy-slot'
  | 'sakura-slot'
  | 'thunder-slot'
  | 'dragon-mega-slot'
  | 'nebula-slot'
  | 'jungle-slot'
  | 'vampire-slot';

export interface SlotSymbolThemeMeta {
  label: string;
  shortLabel: string;
  accentHex: string;
  accentValue: number;
}

export interface SlotThemeConfig {
  id: SlotThemeId;
  gameId: SlotGameId;
  reels: 3 | 5 | 6;
  rows: 3 | 5;
  title: string;
  suffix: string;
  description: string;
  stageLabel: string;
  readyLabel: string;
  spinningLabel: string;
  section: string;
  breadcrumb: string;
  rtpLabel: string;
  rtpAccent: 'acid' | 'ember' | 'toxic' | 'ice';
  cover: string;
  background: string;
  symbolSheet: string;
  bigWin?: string;
  symbols: SlotSymbolThemeMeta[];
}

const CYBER_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'NEON 7', shortLabel: 'N7', accentHex: '#F45CFF', accentValue: 0xf45cff },
  { label: 'DIAMOND', shortLabel: 'DIA', accentHex: '#54E8FF', accentValue: 0x54e8ff },
  { label: 'CHIP', shortLabel: 'CHP', accentHex: '#36C5FF', accentValue: 0x36c5ff },
  { label: 'ORB', shortLabel: 'ORB', accentHex: '#A855F7', accentValue: 0xa855f7 },
  { label: 'BAR', shortLabel: 'BAR', accentHex: '#22D3EE', accentValue: 0x22d3ee },
  { label: 'CROWN', shortLabel: 'CRN', accentHex: '#F4B53F', accentValue: 0xf4b53f },
];

const FRUIT_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'CHERRY', shortLabel: 'CHR', accentHex: '#D43C63', accentValue: 0xd43c63 },
  { label: 'LEMON', shortLabel: 'LEM', accentHex: '#E4B431', accentValue: 0xe4b431 },
  { label: 'MELON', shortLabel: 'MEL', accentHex: '#33A862', accentValue: 0x33a862 },
  { label: 'BELL', shortLabel: 'BEL', accentHex: '#D9A032', accentValue: 0xd9a032 },
  { label: 'SEVEN', shortLabel: 'SEV', accentHex: '#D83D36', accentValue: 0xd83d36 },
  { label: 'BAR', shortLabel: 'BAR', accentHex: '#B88733', accentValue: 0xb88733 },
];

const FORTUNE_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'TIGER', shortLabel: 'TGR', accentHex: '#D9A032', accentValue: 0xd9a032 },
  { label: 'DRAGON', shortLabel: 'DRG', accentHex: '#1EA06D', accentValue: 0x1ea06d },
  { label: 'ENVELOPE', shortLabel: 'ENV', accentHex: '#D94B45', accentValue: 0xd94b45 },
  { label: 'INGOT', shortLabel: 'ING', accentHex: '#F2C15B', accentValue: 0xf2c15b },
  { label: 'LOTUS', shortLabel: 'LOT', accentHex: '#46B884', accentValue: 0x46b884 },
  { label: 'CROWN', shortLabel: 'CRN', accentHex: '#C43D35', accentValue: 0xc43d35 },
];

const OCEAN_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'PEARL', shortLabel: 'PRL', accentHex: '#A5F3FC', accentValue: 0xa5f3fc },
  { label: 'ANCHOR', shortLabel: 'ANC', accentHex: '#E0B75A', accentValue: 0xe0b75a },
  { label: 'CHEST', shortLabel: 'CHS', accentHex: '#C9913D', accentValue: 0xc9913d },
  { label: 'SAPPHIRE', shortLabel: 'SAP', accentHex: '#3B82F6', accentValue: 0x3b82f6 },
  { label: 'WHEEL', shortLabel: 'WHL', accentHex: '#D6A64A', accentValue: 0xd6a64a },
  { label: 'TRIDENT', shortLabel: 'TRI', accentHex: '#22D3EE', accentValue: 0x22d3ee },
];

const TEMPLE_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'SCARAB', shortLabel: 'SCR', accentHex: '#D9A032', accentValue: 0xd9a032 },
  { label: 'MASK', shortLabel: 'MSK', accentHex: '#2DD4BF', accentValue: 0x2dd4bf },
  { label: 'SUN', shortLabel: 'SUN', accentHex: '#F3D67D', accentValue: 0xf3d67d },
  { label: 'SERPENT', shortLabel: 'SRP', accentHex: '#1EA06D', accentValue: 0x1ea06d },
  { label: 'EMERALD', shortLabel: 'EMR', accentHex: '#10B981', accentValue: 0x10b981 },
  { label: 'CROWN', shortLabel: 'CRN', accentHex: '#F2C15B', accentValue: 0xf2c15b },
];

const CANDY_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'LOLLIPOP', shortLabel: 'POP', accentHex: '#F472B6', accentValue: 0xf472b6 },
  { label: 'CANDY', shortLabel: 'CND', accentHex: '#38BDF8', accentValue: 0x38bdf8 },
  { label: 'GUMMY', shortLabel: 'GMY', accentHex: '#A78BFA', accentValue: 0xa78bfa },
  { label: 'DONUT', shortLabel: 'DNT', accentHex: '#FB7185', accentValue: 0xfb7185 },
  { label: 'STAR', shortLabel: 'STR', accentHex: '#FBBF24', accentValue: 0xfbbf24 },
  { label: 'CUPCAKE', shortLabel: 'CAK', accentHex: '#34D399', accentValue: 0x34d399 },
];

const SAKURA_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'KATANA', shortLabel: 'KTN', accentHex: '#E5E7EB', accentValue: 0xe5e7eb },
  { label: 'MASK', shortLabel: 'MSK', accentHex: '#EF4444', accentValue: 0xef4444 },
  { label: 'SAKURA', shortLabel: 'SAK', accentHex: '#F9A8D4', accentValue: 0xf9a8d4 },
  { label: 'LANTERN', shortLabel: 'LNT', accentHex: '#F97316', accentValue: 0xf97316 },
  { label: 'FAN', shortLabel: 'FAN', accentHex: '#C084FC', accentValue: 0xc084fc },
  { label: 'COIN', shortLabel: 'COI', accentHex: '#F2C15B', accentValue: 0xf2c15b },
];

const THUNDER_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'RUNE', shortLabel: 'RUN', accentHex: '#8DD7FF', accentValue: 0x8dd7ff },
  { label: 'SHIELD', shortLabel: 'SHD', accentHex: '#F0C96A', accentValue: 0xf0c96a },
  { label: 'AXE', shortLabel: 'AXE', accentHex: '#B8C7D9', accentValue: 0xb8c7d9 },
  { label: 'STORM', shortLabel: 'STM', accentHex: '#60A5FA', accentValue: 0x60a5fa },
  { label: 'HAMMER', shortLabel: 'HAM', accentHex: '#FBBF24', accentValue: 0xfbbf24 },
  { label: 'RED GEM', shortLabel: 'RED', accentHex: '#EF4444', accentValue: 0xef4444 },
  { label: 'BLUE GEM', shortLabel: 'BLU', accentHex: '#38BDF8', accentValue: 0x38bdf8 },
  { label: 'GREEN GEM', shortLabel: 'GRN', accentHex: '#22C55E', accentValue: 0x22c55e },
  { label: 'YELLOW GEM', shortLabel: 'YEL', accentHex: '#FDE047', accentValue: 0xfde047 },
];

const DRAGON_MEGA_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'RED GEM', shortLabel: 'RED', accentHex: '#EF4444', accentValue: 0xef4444 },
  { label: 'BLUE GEM', shortLabel: 'BLU', accentHex: '#38BDF8', accentValue: 0x38bdf8 },
  { label: 'YELLOW GEM', shortLabel: 'YEL', accentHex: '#FDE047', accentValue: 0xfde047 },
  { label: 'GREEN GEM', shortLabel: 'GRN', accentHex: '#22C55E', accentValue: 0x22c55e },
  { label: 'SCALE', shortLabel: 'SCL', accentHex: '#22C55E', accentValue: 0x22c55e },
  { label: 'DRAGON', shortLabel: 'DRG', accentHex: '#F59E0B', accentValue: 0xf59e0b },
  { label: 'CROWN', shortLabel: 'CRW', accentHex: '#FDE047', accentValue: 0xfde047 },
  { label: 'FIRE GEM', shortLabel: 'FIG', accentHex: '#F97316', accentValue: 0xf97316 },
  { label: 'HOARD', shortLabel: 'HRD', accentHex: '#A3E635', accentValue: 0xa3e635 },
];

const NEBULA_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'RED GEM', shortLabel: 'RED', accentHex: '#EF4444', accentValue: 0xef4444 },
  { label: 'BLUE GEM', shortLabel: 'BLU', accentHex: '#38BDF8', accentValue: 0x38bdf8 },
  { label: 'YELLOW GEM', shortLabel: 'YEL', accentHex: '#FDE047', accentValue: 0xfde047 },
  { label: 'GREEN GEM', shortLabel: 'GRN', accentHex: '#22C55E', accentValue: 0x22c55e },
  { label: 'NOVA', shortLabel: 'NVA', accentHex: '#F472B6', accentValue: 0xf472b6 },
  { label: 'GALAXY', shortLabel: 'GLX', accentHex: '#FDE68A', accentValue: 0xfde68a },
  { label: 'STAR CORE', shortLabel: 'SRC', accentHex: '#F0ABFC', accentValue: 0xf0abfc },
  { label: 'ASTEROID', shortLabel: 'AST', accentHex: '#94A3B8', accentValue: 0x94a3b8 },
  { label: 'QUASAR', shortLabel: 'QSR', accentHex: '#67E8F9', accentValue: 0x67e8f9 },
];

const JUNGLE_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'RED GEM', shortLabel: 'RED', accentHex: '#EF4444', accentValue: 0xef4444 },
  { label: 'BLUE GEM', shortLabel: 'BLU', accentHex: '#38BDF8', accentValue: 0x38bdf8 },
  { label: 'YELLOW GEM', shortLabel: 'YEL', accentHex: '#FDE047', accentValue: 0xfde047 },
  { label: 'GREEN GEM', shortLabel: 'GRN', accentHex: '#22C55E', accentValue: 0x22c55e },
  { label: 'EMERALD', shortLabel: 'EMR', accentHex: '#10B981', accentValue: 0x10b981 },
  { label: 'RELIC', shortLabel: 'RLC', accentHex: '#FACC15', accentValue: 0xfacc15 },
  { label: 'TOTEM', shortLabel: 'TOT', accentHex: '#D9F99D', accentValue: 0xd9f99d },
  { label: 'GOLD FRUIT', shortLabel: 'GLF', accentHex: '#FBBF24', accentValue: 0xfbbf24 },
  { label: 'TEMPLE KEY', shortLabel: 'KEY', accentHex: '#34D399', accentValue: 0x34d399 },
];

const VAMPIRE_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'RED GEM', shortLabel: 'RED', accentHex: '#EF4444', accentValue: 0xef4444 },
  { label: 'BLUE GEM', shortLabel: 'BLU', accentHex: '#38BDF8', accentValue: 0x38bdf8 },
  { label: 'YELLOW GEM', shortLabel: 'YEL', accentHex: '#FDE047', accentValue: 0xfde047 },
  { label: 'GREEN GEM', shortLabel: 'GRN', accentHex: '#22C55E', accentValue: 0x22c55e },
  { label: 'MOON', shortLabel: 'MON', accentHex: '#CBD5E1', accentValue: 0xcbd5e1 },
  { label: 'CASTLE', shortLabel: 'CST', accentHex: '#F472B6', accentValue: 0xf472b6 },
  { label: 'BAT', shortLabel: 'BAT', accentHex: '#A78BFA', accentValue: 0xa78bfa },
  { label: 'BLOOD GEM', shortLabel: 'BLD', accentHex: '#DC2626', accentValue: 0xdc2626 },
  { label: 'COFFIN', shortLabel: 'COF', accentHex: '#E879F9', accentValue: 0xe879f9 },
];

export const SLOT_THEMES: Record<SlotThemeId, SlotThemeConfig> = {
  cyber: {
    id: 'cyber',
    gameId: 'hotline',
    reels: 5,
    rows: 3,
    title: '霓虹熱線',
    suffix: 'HOTLINE',
    description: '霓虹燈牌、電光符號與左右雙向固定線派彩。',
    stageLabel: '霓虹熱線',
    readyLabel: '待機中',
    spinningLabel: '轉軸加速中',
    section: '§ SLOT 08',
    breadcrumb: 'HOTLINE_08',
    rtpLabel: 'RTP 97%',
    rtpAccent: 'ember',
    cover: '/slots/cyber/cover.png',
    background: '/slots/cyber/background.png',
    symbolSheet: '/slots/cyber/symbols.png',
    symbols: CYBER_SYMBOLS,
  },
  fruit: {
    id: 'fruit',
    gameId: 'fruit-slot',
    reels: 5,
    rows: 3,
    title: '水果拉霸',
    suffix: 'FRUIT',
    description: '櫻桃、檸檬、西瓜與金鈴鐺的雙向固定線水果機。',
    stageLabel: '水果拉霸',
    readyLabel: '待機中',
    spinningLabel: '水果轉軸中',
    section: '§ SLOT 19',
    breadcrumb: 'FRUIT_19',
    rtpLabel: 'RTP 97%',
    rtpAccent: 'acid',
    cover: '/slots/fruit/cover.png',
    background: '/slots/fruit/background.png',
    symbolSheet: '/slots/fruit/symbols.png',
    symbols: FRUIT_SYMBOLS,
  },
  fortune: {
    id: 'fortune',
    gameId: 'fortune-slot',
    reels: 5,
    rows: 3,
    title: '財虎拉霸',
    suffix: 'FORTUNE',
    description: '金虎、玉龍、元寶與紅包構成的雙向固定線財富主題。',
    stageLabel: '財虎拉霸',
    readyLabel: '待機中',
    spinningLabel: '財運轉軸中',
    section: '§ SLOT 20',
    breadcrumb: 'FORTUNE_20',
    rtpLabel: 'RTP 97%',
    rtpAccent: 'toxic',
    cover: '/slots/fortune/cover.png',
    background: '/slots/fortune/background.png',
    symbolSheet: '/slots/fortune/symbols.png',
    symbols: FORTUNE_SYMBOLS,
  },
  ocean: {
    id: 'ocean',
    gameId: 'ocean-slot',
    reels: 5,
    rows: 3,
    title: '海神寶藏',
    suffix: 'OCEAN',
    description: '珍珠、船錨、寶箱與三叉戟的雙向固定線深海拉霸。',
    stageLabel: '海神寶藏',
    readyLabel: '待機中',
    spinningLabel: '寶藏轉軸中',
    section: '§ SLOT 21',
    breadcrumb: 'OCEAN_21',
    rtpLabel: 'RTP 97%',
    rtpAccent: 'ice',
    cover: '/slots/ocean/cover.png',
    background: '/slots/ocean/background.png',
    symbolSheet: '/slots/ocean/symbols.png',
    symbols: OCEAN_SYMBOLS,
  },
  temple: {
    id: 'temple',
    gameId: 'temple-slot',
    reels: 3,
    rows: 3,
    title: '聖殿寶石',
    suffix: 'TEMPLE',
    description: '金色聖殿、祖母綠寶石與神秘遺物構成的 3x3 五線固定派彩拉霸。',
    stageLabel: '聖殿寶石',
    readyLabel: '待機中',
    spinningLabel: '寶石轉軸中',
    section: '§ SLOT 22',
    breadcrumb: 'TEMPLE_22',
    rtpLabel: 'RTP 97%',
    rtpAccent: 'toxic',
    cover: '/slots/temple/cover.png',
    background: '/slots/temple/background.png',
    symbolSheet: '/slots/temple/symbols.png',
    symbols: TEMPLE_SYMBOLS,
  },
  candy: {
    id: 'candy',
    gameId: 'candy-slot',
    reels: 3,
    rows: 3,
    title: '糖果派對',
    suffix: 'CANDY',
    description: '糖果、甜點與彩色霓虹組成的輕快 3x3 五線固定派彩拉霸。',
    stageLabel: '糖果派對',
    readyLabel: '待機中',
    spinningLabel: '糖果轉軸中',
    section: '§ SLOT 23',
    breadcrumb: 'CANDY_23',
    rtpLabel: 'RTP 97%',
    rtpAccent: 'acid',
    cover: '/slots/candy/cover.png',
    background: '/slots/candy/background.png',
    symbolSheet: '/slots/candy/symbols.png',
    symbols: CANDY_SYMBOLS,
  },
  sakura: {
    id: 'sakura',
    gameId: 'sakura-slot',
    reels: 3,
    rows: 3,
    title: '夜櫻武士',
    suffix: 'SAKURA',
    description: '黑漆舞台、武士刀與櫻花霓虹打造的 3x3 五線固定派彩拉霸。',
    stageLabel: '夜櫻武士',
    readyLabel: '待機中',
    spinningLabel: '夜櫻轉軸中',
    section: '§ SLOT 24',
    breadcrumb: 'SAKURA_24',
    rtpLabel: 'RTP 97%',
    rtpAccent: 'ember',
    cover: '/slots/sakura/cover.png',
    background: '/slots/sakura/background.png',
    symbolSheet: '/slots/sakura/symbols.png',
    symbols: SAKURA_SYMBOLS,
  },
  thunder: {
    id: 'thunder',
    gameId: 'thunder-slot',
    reels: 6,
    rows: 5,
    title: '索爾神槌',
    suffix: 'THOR',
    description: '神槌、戰斧、盾牌與四色寶石構成的 6x5 計數派彩拉霸。',
    stageLabel: '索爾神槌',
    readyLabel: '神槌就緒',
    spinningLabel: '雷電連鎖中',
    section: '§ MEGA 25',
    breadcrumb: 'THOR_25',
    rtpLabel: 'RTP 96.5%',
    rtpAccent: 'ember',
    cover: '/slots/thunder/cover.png',
    background: '/slots/thunder/background.png',
    symbolSheet: '/slots/thunder/symbols.png',
    bigWin: '/slots/thunder/big-win.png',
    symbols: THUNDER_SYMBOLS,
  },
  dragonMega: {
    id: 'dragonMega',
    gameId: 'dragon-mega-slot',
    reels: 6,
    rows: 5,
    title: '龍焰巨輪',
    suffix: 'DRAGON',
    description: '龍火、金幣與寶珠交錯的 6x5 計數派彩爆分拉霸。',
    stageLabel: '龍焰巨輪',
    readyLabel: '龍焰待燃',
    spinningLabel: '龍火翻騰中',
    section: '§ MEGA 26',
    breadcrumb: 'DRAGON_26',
    rtpLabel: 'RTP 96.5%',
    rtpAccent: 'toxic',
    cover: '/slots/dragon-mega/cover.png',
    background: '/slots/dragon-mega/background.png',
    symbolSheet: '/slots/dragon-mega/symbols.png',
    bigWin: '/slots/dragon-mega/big-win.png',
    symbols: DRAGON_MEGA_SYMBOLS,
  },
  nebula: {
    id: 'nebula',
    gameId: 'nebula-slot',
    reels: 6,
    rows: 5,
    title: '星河寶藏',
    suffix: 'NEBULA',
    description: '星雲、傳送門與水晶構成的科幻 6x5 計數派彩拉霸。',
    stageLabel: '星河寶藏',
    readyLabel: '星門就緒',
    spinningLabel: '星雲連鎖中',
    section: '§ MEGA 27',
    breadcrumb: 'NEBULA_27',
    rtpLabel: 'RTP 96.5%',
    rtpAccent: 'ice',
    cover: '/slots/nebula/cover.png',
    background: '/slots/nebula/background.png',
    symbolSheet: '/slots/nebula/symbols.png',
    bigWin: '/slots/nebula/big-win.png',
    symbols: NEBULA_SYMBOLS,
  },
  jungle: {
    id: 'jungle',
    gameId: 'jungle-slot',
    reels: 6,
    rows: 5,
    title: '秘境遺跡',
    suffix: 'JUNGLE',
    description: '雨林遺跡、古老面具與祖母綠的 6x5 計數派彩拉霸。',
    stageLabel: '秘境遺跡',
    readyLabel: '遺跡甦醒',
    spinningLabel: '藤蔓連鎖中',
    section: '§ MEGA 28',
    breadcrumb: 'JUNGLE_28',
    rtpLabel: 'RTP 96.5%',
    rtpAccent: 'acid',
    cover: '/slots/jungle/cover.png',
    background: '/slots/jungle/background.png',
    symbolSheet: '/slots/jungle/symbols.png',
    bigWin: '/slots/jungle/big-win.png',
    symbols: JUNGLE_SYMBOLS,
  },
  vampire: {
    id: 'vampire',
    gameId: 'vampire-slot',
    reels: 6,
    rows: 5,
    title: '暗夜古堡',
    suffix: 'CASTLE',
    description: '玫瑰、月影與古堡符號打造的哥德 6x5 計數派彩拉霸。',
    stageLabel: '暗夜古堡',
    readyLabel: '夜幕降臨',
    spinningLabel: '古堡轉軸中',
    section: '§ MEGA 29',
    breadcrumb: 'CASTLE_29',
    rtpLabel: 'RTP 96.5%',
    rtpAccent: 'ember',
    cover: '/slots/vampire/cover.png',
    background: '/slots/vampire/background.png',
    symbolSheet: '/slots/vampire/symbols.png',
    bigWin: '/slots/vampire/big-win.png',
    symbols: VAMPIRE_SYMBOLS,
  },
};

export function getSlotTheme(id: SlotThemeId): SlotThemeConfig {
  return SLOT_THEMES[id] ?? SLOT_THEMES.cyber;
}
