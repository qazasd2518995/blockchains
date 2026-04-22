export type HotlineSymbolKey = 'cherry' | 'bell' | 'seven' | 'bar' | 'diamond' | 'jackpot';

export interface HotlineSymbolMeta {
  key: HotlineSymbolKey;
  label: string;
  shortLabel: string;
  accentHex: string;
  accentValue: number;
}

export const HOTLINE_SYMBOLS: HotlineSymbolMeta[] = [
  {
    key: 'cherry',
    label: 'CHERRY',
    shortLabel: 'CHR',
    accentHex: '#D43C63',
    accentValue: 0xD43C63,
  },
  {
    key: 'bell',
    label: 'BELL',
    shortLabel: 'BEL',
    accentHex: '#D98E26',
    accentValue: 0xD98E26,
  },
  {
    key: 'seven',
    label: 'SEVEN',
    shortLabel: 'SEV',
    accentHex: '#C9A24C',
    accentValue: 0xC9A24C,
  },
  {
    key: 'bar',
    label: 'BAR',
    shortLabel: 'BAR',
    accentHex: '#2B8CA8',
    accentValue: 0x2B8CA8,
  },
  {
    key: 'diamond',
    label: 'DIAMOND',
    shortLabel: 'GEM',
    accentHex: '#1E8E67',
    accentValue: 0x1E8E67,
  },
  {
    key: 'jackpot',
    label: 'JACKPOT',
    shortLabel: 'JPK',
    accentHex: '#B52A45',
    accentValue: 0xB52A45,
  },
];

const HOTLINE_SYMBOLS_BY_KEY = new Map(HOTLINE_SYMBOLS.map((symbol) => [symbol.key, symbol] as const));

export function getHotlineSymbolMeta(symbol: number | HotlineSymbolKey): HotlineSymbolMeta {
  if (typeof symbol === 'number') {
    return HOTLINE_SYMBOLS[symbol] ?? HOTLINE_SYMBOLS[0]!;
  }

  return HOTLINE_SYMBOLS_BY_KEY.get(symbol) ?? HOTLINE_SYMBOLS[0]!;
}
