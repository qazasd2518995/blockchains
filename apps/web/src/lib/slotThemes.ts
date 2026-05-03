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
  { label: 'NEON 7', shortLabel: 'N7', accentHex: '#F45CFF', accentValue: 0xF45CFF },
  { label: 'DIAMOND', shortLabel: 'DIA', accentHex: '#54E8FF', accentValue: 0x54E8FF },
  { label: 'CHIP', shortLabel: 'CHP', accentHex: '#36C5FF', accentValue: 0x36C5FF },
  { label: 'ORB', shortLabel: 'ORB', accentHex: '#A855F7', accentValue: 0xA855F7 },
  { label: 'BAR', shortLabel: 'BAR', accentHex: '#22D3EE', accentValue: 0x22D3EE },
  { label: 'CROWN', shortLabel: 'CRN', accentHex: '#F4B53F', accentValue: 0xF4B53F },
];

const FRUIT_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'CHERRY', shortLabel: 'CHR', accentHex: '#D43C63', accentValue: 0xD43C63 },
  { label: 'LEMON', shortLabel: 'LEM', accentHex: '#E4B431', accentValue: 0xE4B431 },
  { label: 'MELON', shortLabel: 'MEL', accentHex: '#33A862', accentValue: 0x33A862 },
  { label: 'BELL', shortLabel: 'BEL', accentHex: '#D9A032', accentValue: 0xD9A032 },
  { label: 'SEVEN', shortLabel: 'SEV', accentHex: '#D83D36', accentValue: 0xD83D36 },
  { label: 'BAR', shortLabel: 'BAR', accentHex: '#B88733', accentValue: 0xB88733 },
];

const FORTUNE_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'TIGER', shortLabel: 'TGR', accentHex: '#D9A032', accentValue: 0xD9A032 },
  { label: 'DRAGON', shortLabel: 'DRG', accentHex: '#1EA06D', accentValue: 0x1EA06D },
  { label: 'ENVELOPE', shortLabel: 'ENV', accentHex: '#D94B45', accentValue: 0xD94B45 },
  { label: 'INGOT', shortLabel: 'ING', accentHex: '#F2C15B', accentValue: 0xF2C15B },
  { label: 'LOTUS', shortLabel: 'LOT', accentHex: '#46B884', accentValue: 0x46B884 },
  { label: 'CROWN', shortLabel: 'CRN', accentHex: '#C43D35', accentValue: 0xC43D35 },
];

const OCEAN_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'PEARL', shortLabel: 'PRL', accentHex: '#A5F3FC', accentValue: 0xA5F3FC },
  { label: 'ANCHOR', shortLabel: 'ANC', accentHex: '#E0B75A', accentValue: 0xE0B75A },
  { label: 'CHEST', shortLabel: 'CHS', accentHex: '#C9913D', accentValue: 0xC9913D },
  { label: 'SAPPHIRE', shortLabel: 'SAP', accentHex: '#3B82F6', accentValue: 0x3B82F6 },
  { label: 'WHEEL', shortLabel: 'WHL', accentHex: '#D6A64A', accentValue: 0xD6A64A },
  { label: 'TRIDENT', shortLabel: 'TRI', accentHex: '#22D3EE', accentValue: 0x22D3EE },
];

const TEMPLE_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'SCARAB', shortLabel: 'SCR', accentHex: '#D9A032', accentValue: 0xD9A032 },
  { label: 'MASK', shortLabel: 'MSK', accentHex: '#2DD4BF', accentValue: 0x2DD4BF },
  { label: 'SUN', shortLabel: 'SUN', accentHex: '#F3D67D', accentValue: 0xF3D67D },
  { label: 'SERPENT', shortLabel: 'SRP', accentHex: '#1EA06D', accentValue: 0x1EA06D },
  { label: 'EMERALD', shortLabel: 'EMR', accentHex: '#10B981', accentValue: 0x10B981 },
  { label: 'CROWN', shortLabel: 'CRN', accentHex: '#F2C15B', accentValue: 0xF2C15B },
];

const CANDY_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'LOLLIPOP', shortLabel: 'POP', accentHex: '#F472B6', accentValue: 0xF472B6 },
  { label: 'CANDY', shortLabel: 'CND', accentHex: '#38BDF8', accentValue: 0x38BDF8 },
  { label: 'GUMMY', shortLabel: 'GMY', accentHex: '#A78BFA', accentValue: 0xA78BFA },
  { label: 'DONUT', shortLabel: 'DNT', accentHex: '#FB7185', accentValue: 0xFB7185 },
  { label: 'STAR', shortLabel: 'STR', accentHex: '#FBBF24', accentValue: 0xFBBF24 },
  { label: 'CUPCAKE', shortLabel: 'CAK', accentHex: '#34D399', accentValue: 0x34D399 },
];

const SAKURA_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'KATANA', shortLabel: 'KTN', accentHex: '#E5E7EB', accentValue: 0xE5E7EB },
  { label: 'MASK', shortLabel: 'MSK', accentHex: '#EF4444', accentValue: 0xEF4444 },
  { label: 'SAKURA', shortLabel: 'SAK', accentHex: '#F9A8D4', accentValue: 0xF9A8D4 },
  { label: 'LANTERN', shortLabel: 'LNT', accentHex: '#F97316', accentValue: 0xF97316 },
  { label: 'FAN', shortLabel: 'FAN', accentHex: '#C084FC', accentValue: 0xC084FC },
  { label: 'COIN', shortLabel: 'COI', accentHex: '#F2C15B', accentValue: 0xF2C15B },
];

const THUNDER_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'RUNE', shortLabel: 'RUN', accentHex: '#8DD7FF', accentValue: 0x8DD7FF },
  { label: 'SHIELD', shortLabel: 'SHD', accentHex: '#F0C96A', accentValue: 0xF0C96A },
  { label: 'AXE', shortLabel: 'AXE', accentHex: '#B8C7D9', accentValue: 0xB8C7D9 },
  { label: 'STORM', shortLabel: 'STM', accentHex: '#60A5FA', accentValue: 0x60A5FA },
  { label: 'HAMMER', shortLabel: 'HAM', accentHex: '#FBBF24', accentValue: 0xFBBF24 },
  { label: 'THUNDER', shortLabel: 'THR', accentHex: '#F97316', accentValue: 0xF97316 },
];

const DRAGON_MEGA_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'EMBER', shortLabel: 'EMB', accentHex: '#FB923C', accentValue: 0xFB923C },
  { label: 'COIN', shortLabel: 'COI', accentHex: '#FACC15', accentValue: 0xFACC15 },
  { label: 'FANG', shortLabel: 'FNG', accentHex: '#FDE68A', accentValue: 0xFDE68A },
  { label: 'ORB', shortLabel: 'ORB', accentHex: '#EF4444', accentValue: 0xEF4444 },
  { label: 'SCALE', shortLabel: 'SCL', accentHex: '#22C55E', accentValue: 0x22C55E },
  { label: 'DRAGON', shortLabel: 'DRG', accentHex: '#F59E0B', accentValue: 0xF59E0B },
];

const NEBULA_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'COMET', shortLabel: 'CMT', accentHex: '#93C5FD', accentValue: 0x93C5FD },
  { label: 'PLANET', shortLabel: 'PLN', accentHex: '#C084FC', accentValue: 0xC084FC },
  { label: 'CRYSTAL', shortLabel: 'CRY', accentHex: '#22D3EE', accentValue: 0x22D3EE },
  { label: 'PORTAL', shortLabel: 'PRT', accentHex: '#A78BFA', accentValue: 0xA78BFA },
  { label: 'NOVA', shortLabel: 'NVA', accentHex: '#F472B6', accentValue: 0xF472B6 },
  { label: 'GALAXY', shortLabel: 'GLX', accentHex: '#FDE68A', accentValue: 0xFDE68A },
];

const JUNGLE_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'LEAF', shortLabel: 'LEF', accentHex: '#86EFAC', accentValue: 0x86EFAC },
  { label: 'IDOL', shortLabel: 'IDL', accentHex: '#D97706', accentValue: 0xD97706 },
  { label: 'MASK', shortLabel: 'MSK', accentHex: '#FBBF24', accentValue: 0xFBBF24 },
  { label: 'SERPENT', shortLabel: 'SRP', accentHex: '#22C55E', accentValue: 0x22C55E },
  { label: 'EMERALD', shortLabel: 'EMR', accentHex: '#10B981', accentValue: 0x10B981 },
  { label: 'RELIC', shortLabel: 'RLC', accentHex: '#FACC15', accentValue: 0xFACC15 },
];

const VAMPIRE_SYMBOLS: SlotSymbolThemeMeta[] = [
  { label: 'ROSE', shortLabel: 'ROS', accentHex: '#FB7185', accentValue: 0xFB7185 },
  { label: 'CANDLE', shortLabel: 'CDL', accentHex: '#F8C66A', accentValue: 0xF8C66A },
  { label: 'RAVEN', shortLabel: 'RVN', accentHex: '#A78BFA', accentValue: 0xA78BFA },
  { label: 'GOBLET', shortLabel: 'GOB', accentHex: '#EF4444', accentValue: 0xEF4444 },
  { label: 'MOON', shortLabel: 'MON', accentHex: '#CBD5E1', accentValue: 0xCBD5E1 },
  { label: 'CASTLE', shortLabel: 'CST', accentHex: '#F472B6', accentValue: 0xF472B6 },
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
    description: '金色聖殿、祖母綠寶石與神秘遺物構成的 3x3 雙向固定線拉霸。',
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
    description: '糖果、甜點與彩色霓虹組成的輕快 3x3 雙向固定線拉霸。',
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
    description: '黑漆舞台、武士刀與櫻花霓虹打造的 3x3 雙向固定線拉霸。',
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
    title: '雷神之鎚',
    suffix: 'THUNDER',
    description: '6x5 全方式連線，低倍小中獎與高倍爆分同時存在。',
    stageLabel: '雷神之鎚',
    readyLabel: '蓄雷待發',
    spinningLabel: '雷電轉軸中',
    section: '§ MEGA 25',
    breadcrumb: 'THUNDER_25',
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
    description: '龍火、金幣與寶珠交錯的 6x5 全方式爆分拉霸。',
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
    description: '星雲、傳送門與水晶構成的科幻 6x5 全方式拉霸。',
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
    description: '雨林遺跡、古老面具與祖母綠的 6x5 全方式拉霸。',
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
    description: '玫瑰、月影與古堡符號打造的哥德 6x5 全方式拉霸。',
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
