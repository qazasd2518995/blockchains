export type HotlineSymbolKey =
  | 'red-gem'
  | 'blue-gem'
  | 'green-gem'
  | 'yellow-gem'
  | 'diamond'
  | 'crown'
  | 'star'
  | 'jackpot';

export interface HotlineSymbolMeta {
  key: HotlineSymbolKey;
  label: string;
  shortLabel: string;
  accentHex: string;
  accentValue: number;
}

export const HOTLINE_SYMBOLS: HotlineSymbolMeta[] = [
  {
    key: 'red-gem',
    label: 'RED GEM',
    shortLabel: '0.2',
    accentHex: '#EF4444',
    accentValue: 0xef4444,
  },
  {
    key: 'blue-gem',
    label: 'BLUE GEM',
    shortLabel: '0.4',
    accentHex: '#38BDF8',
    accentValue: 0x38bdf8,
  },
  {
    key: 'green-gem',
    label: 'GREEN GEM',
    shortLabel: '0.6',
    accentHex: '#22C55E',
    accentValue: 0x22c55e,
  },
  {
    key: 'yellow-gem',
    label: 'YELLOW GEM',
    shortLabel: '0.8',
    accentHex: '#FDE047',
    accentValue: 0xfde047,
  },
  {
    key: 'diamond',
    label: 'DIAMOND',
    shortLabel: '1.2',
    accentHex: '#A78BFA',
    accentValue: 0xa78bfa,
  },
  {
    key: 'crown',
    label: 'CROWN',
    shortLabel: '1.4',
    accentHex: '#FBBF24',
    accentValue: 0xfbbf24,
  },
  {
    key: 'star',
    label: 'STAR',
    shortLabel: '1.6',
    accentHex: '#F472B6',
    accentValue: 0xf472b6,
  },
  {
    key: 'jackpot',
    label: 'JACKPOT',
    shortLabel: '1.8',
    accentHex: '#F97316',
    accentValue: 0xf97316,
  },
];

const HOTLINE_SYMBOLS_BY_KEY = new Map(
  HOTLINE_SYMBOLS.map((symbol) => [symbol.key, symbol] as const),
);

export function getHotlineSymbolMeta(symbol: number | HotlineSymbolKey): HotlineSymbolMeta {
  if (typeof symbol === 'number') {
    return HOTLINE_SYMBOLS[symbol] ?? HOTLINE_SYMBOLS[0]!;
  }

  return HOTLINE_SYMBOLS_BY_KEY.get(symbol) ?? HOTLINE_SYMBOLS[0]!;
}
