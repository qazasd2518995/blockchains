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
  render?: {
    scale?: number;
    offsetX?: number;
    offsetY?: number;
  };
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

const SOFT_LOSS_GEMS: SlotSymbolThemeMeta[] = [
  { label: 'RED GEM', shortLabel: '0.2', accentHex: '#EF4444', accentValue: 0xef4444 },
  { label: 'BLUE GEM', shortLabel: '0.4', accentHex: '#38BDF8', accentValue: 0x38bdf8 },
  { label: 'GREEN GEM', shortLabel: '0.6', accentHex: '#22C55E', accentValue: 0x22c55e },
  { label: 'YELLOW GEM', shortLabel: '0.8', accentHex: '#FDE047', accentValue: 0xfde047 },
];

function softSlotSymbols(winningSymbols: SlotSymbolThemeMeta[]): SlotSymbolThemeMeta[] {
  return [...SOFT_LOSS_GEMS, ...winningSymbols.slice(0, 4)];
}

const CYBER_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'NEON 7', shortLabel: '0.2', accentHex: '#F45CFF', accentValue: 0xf45cff },
  { label: 'DIAMOND', shortLabel: '0.4', accentHex: '#54E8FF', accentValue: 0x54e8ff },
  { label: 'CHIP', shortLabel: '0.6', accentHex: '#7DD3FC', accentValue: 0x7dd3fc },
  { label: 'ORB', shortLabel: '0.8', accentHex: '#C084FC', accentValue: 0xc084fc },
  { label: 'BAR', shortLabel: '1.2', accentHex: '#38BDF8', accentValue: 0x38bdf8 },
  { label: 'CROWN', shortLabel: '1.4', accentHex: '#F4B53F', accentValue: 0xf4b53f },
  { label: 'HOLO STAR', shortLabel: '1.6', accentHex: '#F45CFF', accentValue: 0xf45cff },
  { label: 'JACKPOT CORE', shortLabel: '1.8', accentHex: '#F97316', accentValue: 0xf97316 },
];

const FRUIT_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'CHERRY', shortLabel: '0.2', accentHex: '#D43C63', accentValue: 0xd43c63 },
  { label: 'LEMON', shortLabel: '0.4', accentHex: '#F4D35E', accentValue: 0xf4d35e },
  { label: 'MELON', shortLabel: '0.6', accentHex: '#22C55E', accentValue: 0x22c55e },
  { label: 'BELL', shortLabel: '0.8', accentHex: '#D9A032', accentValue: 0xd9a032 },
  { label: 'SEVEN', shortLabel: '1.2', accentHex: '#D83D36', accentValue: 0xd83d36 },
  { label: 'BAR', shortLabel: '1.4', accentHex: '#B88733', accentValue: 0xb88733 },
  { label: 'GRAPES', shortLabel: '1.6', accentHex: '#A855F7', accentValue: 0xa855f7 },
  { label: 'PINEAPPLE', shortLabel: '1.8', accentHex: '#FACC15', accentValue: 0xfacc15 },
];

const FORTUNE_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'TIGER', shortLabel: '0.2', accentHex: '#D9A032', accentValue: 0xd9a032 },
  { label: 'DRAGON', shortLabel: '0.4', accentHex: '#1EA06D', accentValue: 0x1ea06d },
  { label: 'ENVELOPE', shortLabel: '0.6', accentHex: '#D84A3A', accentValue: 0xd84a3a },
  { label: 'INGOT', shortLabel: '0.8', accentHex: '#F2C15B', accentValue: 0xf2c15b },
  { label: 'LOTUS', shortLabel: '1.2', accentHex: '#7DD3A1', accentValue: 0x7dd3a1 },
  { label: 'CROWN', shortLabel: '1.4', accentHex: '#C43D35', accentValue: 0xc43d35 },
  { label: 'JADE COIN', shortLabel: '1.6', accentHex: '#10B981', accentValue: 0x10b981 },
  { label: 'LANTERN', shortLabel: '1.8', accentHex: '#EF4444', accentValue: 0xef4444 },
];

const OCEAN_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'PEARL', shortLabel: '0.2', accentHex: '#A5F3FC', accentValue: 0xa5f3fc },
  { label: 'ANCHOR', shortLabel: '0.4', accentHex: '#F2C15B', accentValue: 0xf2c15b },
  { label: 'CHEST', shortLabel: '0.6', accentHex: '#D6A64A', accentValue: 0xd6a64a },
  { label: 'SAPPHIRE', shortLabel: '0.8', accentHex: '#3B82F6', accentValue: 0x3b82f6 },
  { label: 'WHEEL', shortLabel: '1.2', accentHex: '#D6A64A', accentValue: 0xd6a64a },
  { label: 'TRIDENT', shortLabel: '1.4', accentHex: '#22D3EE', accentValue: 0x22d3ee },
  { label: 'COMPASS', shortLabel: '1.6', accentHex: '#2DD4BF', accentValue: 0x2dd4bf },
  { label: 'GOLD SHELL', shortLabel: '1.8', accentHex: '#F59E0B', accentValue: 0xf59e0b },
];

const TEMPLE_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'SCARAB', shortLabel: '0.2', accentHex: '#D9A032', accentValue: 0xd9a032 },
  { label: 'MASK', shortLabel: '0.4', accentHex: '#22C55E', accentValue: 0x22c55e },
  { label: 'SUN', shortLabel: '0.6', accentHex: '#F3D67D', accentValue: 0xf3d67d },
  { label: 'SERPENT', shortLabel: '0.8', accentHex: '#10B981', accentValue: 0x10b981 },
  { label: 'EMERALD', shortLabel: '1.2', accentHex: '#10B981', accentValue: 0x10b981 },
  { label: 'CROWN', shortLabel: '1.4', accentHex: '#F2C15B', accentValue: 0xf2c15b },
  { label: 'ANKH', shortLabel: '1.6', accentHex: '#2DD4BF', accentValue: 0x2dd4bf },
  { label: 'PYRAMID', shortLabel: '1.8', accentHex: '#FACC15', accentValue: 0xfacc15 },
];

const CANDY_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'LOLLIPOP', shortLabel: '0.2', accentHex: '#F472B6', accentValue: 0xf472b6 },
  { label: 'CANDY', shortLabel: '0.4', accentHex: '#60A5FA', accentValue: 0x60a5fa },
  { label: 'GUMMY', shortLabel: '0.6', accentHex: '#A78BFA', accentValue: 0xa78bfa },
  { label: 'DONUT', shortLabel: '0.8', accentHex: '#FB7185', accentValue: 0xfb7185 },
  { label: 'STAR', shortLabel: '1.2', accentHex: '#FBBF24', accentValue: 0xfbbf24 },
  { label: 'CUPCAKE', shortLabel: '1.4', accentHex: '#34D399', accentValue: 0x34d399 },
  { label: 'CANDY GEM', shortLabel: '1.6', accentHex: '#F472B6', accentValue: 0xf472b6 },
  { label: 'CHOCO CROWN', shortLabel: '1.8', accentHex: '#F97316', accentValue: 0xf97316 },
];

const SAKURA_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'KATANA', shortLabel: '0.2', accentHex: '#E5E7EB', accentValue: 0xe5e7eb },
  { label: 'MASK', shortLabel: '0.4', accentHex: '#EF4444', accentValue: 0xef4444 },
  { label: 'SAKURA', shortLabel: '0.6', accentHex: '#F9A8D4', accentValue: 0xf9a8d4 },
  { label: 'LANTERN', shortLabel: '0.8', accentHex: '#F97316', accentValue: 0xf97316 },
  { label: 'FAN', shortLabel: '1.2', accentHex: '#C084FC', accentValue: 0xc084fc },
  { label: 'COIN', shortLabel: '1.4', accentHex: '#F2C15B', accentValue: 0xf2c15b },
  { label: 'TORII CREST', shortLabel: '1.6', accentHex: '#F472B6', accentValue: 0xf472b6 },
  { label: 'JADE CHARM', shortLabel: '1.8', accentHex: '#10B981', accentValue: 0x10b981 },
];

const THUNDER_SYMBOL_RENDER: Partial<Record<number, NonNullable<SlotSymbolThemeMeta['render']>>> = {
  0: { offsetX: -0.06 },
  2: { offsetX: 0.06, offsetY: -0.05 },
  3: { offsetX: -0.04, offsetY: 0.08 },
  4: { offsetX: -0.03, offsetY: 0.09 },
};

const THUNDER_SYMBOLS: SlotSymbolThemeMeta[] = softSlotSymbols([
  { label: 'HAMMER', shortLabel: '1.2', accentHex: '#FBBF24', accentValue: 0xfbbf24 },
  { label: 'AXE', shortLabel: '1.4', accentHex: '#B8C7D9', accentValue: 0xb8c7d9 },
  { label: 'SHIELD', shortLabel: '1.6', accentHex: '#F0C96A', accentValue: 0xf0c96a },
  { label: 'STORM', shortLabel: '1.8', accentHex: '#60A5FA', accentValue: 0x60a5fa },
]).map((symbol, index) => {
  const render = THUNDER_SYMBOL_RENDER[index];
  return render ? { ...symbol, render } : symbol;
});

const DRAGON_MEGA_SYMBOLS: SlotSymbolThemeMeta[] = softSlotSymbols([
  { label: 'SCALE', shortLabel: '1.2', accentHex: '#22C55E', accentValue: 0x22c55e },
  { label: 'DRAGON', shortLabel: '1.4', accentHex: '#F59E0B', accentValue: 0xf59e0b },
  { label: 'CROWN', shortLabel: '1.6', accentHex: '#FDE047', accentValue: 0xfde047 },
  { label: 'FIRE GEM', shortLabel: '1.8', accentHex: '#F97316', accentValue: 0xf97316 },
]);

const NEBULA_SYMBOLS: SlotSymbolThemeMeta[] = softSlotSymbols([
  { label: 'NOVA', shortLabel: '1.2', accentHex: '#F472B6', accentValue: 0xf472b6 },
  { label: 'GALAXY', shortLabel: '1.4', accentHex: '#FDE68A', accentValue: 0xfde68a },
  { label: 'STAR CORE', shortLabel: '1.6', accentHex: '#F0ABFC', accentValue: 0xf0abfc },
  { label: 'QUASAR', shortLabel: '1.8', accentHex: '#67E8F9', accentValue: 0x67e8f9 },
]);

const JUNGLE_SYMBOLS: SlotSymbolThemeMeta[] = softSlotSymbols([
  { label: 'EMERALD', shortLabel: '1.2', accentHex: '#10B981', accentValue: 0x10b981 },
  { label: 'RELIC', shortLabel: '1.4', accentHex: '#FACC15', accentValue: 0xfacc15 },
  { label: 'TOTEM', shortLabel: '1.6', accentHex: '#D9F99D', accentValue: 0xd9f99d },
  { label: 'GOLD FRUIT', shortLabel: '1.8', accentHex: '#FBBF24', accentValue: 0xfbbf24 },
]);

const VAMPIRE_SYMBOLS: SlotSymbolThemeMeta[] = softSlotSymbols([
  { label: 'MOON', shortLabel: '1.2', accentHex: '#CBD5E1', accentValue: 0xcbd5e1 },
  { label: 'CASTLE', shortLabel: '1.4', accentHex: '#F472B6', accentValue: 0xf472b6 },
  { label: 'BAT', shortLabel: '1.6', accentHex: '#A78BFA', accentValue: 0xa78bfa },
  { label: 'BLOOD GEM', shortLabel: '1.8', accentHex: '#DC2626', accentValue: 0xdc2626 },
]);

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
    cover: '/slots/cyber/cover-v2.png',
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
    cover: '/slots/fruit/cover-v2.png',
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
    cover: '/slots/fortune/cover-v2.png',
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
    cover: '/slots/ocean/cover-v2.png',
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
    cover: '/slots/temple/cover-v2.png',
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
    cover: '/slots/candy/cover-v2.png',
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
    cover: '/slots/sakura/cover-v2.png',
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
    cover: '/slots/thunder/cover-v2.png',
    background: '/slots/thunder/background.png',
    symbolSheet: '/slots/thunder/symbols.png',
    bigWin: '/_optimized/slots/thunder/big-win@1600.webp',
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
    cover: '/slots/dragon-mega/cover-v2.png',
    background: '/slots/dragon-mega/background.png',
    symbolSheet: '/slots/dragon-mega/symbols.png',
    bigWin: '/_optimized/slots/dragon-mega/big-win@1600.webp',
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
    cover: '/slots/nebula/cover-v2.png',
    background: '/slots/nebula/background.png',
    symbolSheet: '/slots/nebula/symbols.png',
    bigWin: '/_optimized/slots/nebula/big-win@1600.webp',
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
    cover: '/slots/jungle/cover-v2.png',
    background: '/slots/jungle/background.png',
    symbolSheet: '/slots/jungle/symbols.png',
    bigWin: '/_optimized/slots/jungle/big-win@1600.webp',
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
    cover: '/slots/vampire/cover-v2.png',
    background: '/slots/vampire/background.png',
    symbolSheet: '/slots/vampire/symbols.png',
    bigWin: '/_optimized/slots/vampire/big-win@1600.webp',
    symbols: VAMPIRE_SYMBOLS,
  },
};

export function getSlotTheme(id: SlotThemeId): SlotThemeConfig {
  return SLOT_THEMES[id] ?? SLOT_THEMES.cyber;
}
