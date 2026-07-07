import { SLOT_THEMES, type SlotThemeConfig, type SlotThemeId } from '@/lib/slotThemes';
import { getLobbyGameCover } from '@/lib/gameCoverAssets';
import { SLOT_BIG_WIN_TIER_ASSETS } from '@/lib/slotWinTiers';
import {
  getOptimizedImageSrcSet,
  type ResponsivePreset,
} from '@/lib/optimizedImages';

export type GameAssetKind =
  | 'background'
  | 'big-win'
  | 'card'
  | 'cover'
  | 'craft'
  | 'sprite'
  | 'symbol';

export interface GameAssetEntry {
  src: string;
  kind: GameAssetKind;
  critical?: boolean;
  pixi?: boolean;
}

export interface GameAssetManifest {
  gameId: string;
  assets: GameAssetEntry[];
}

interface PreloadGameAssetsOptions {
  includeNonCritical?: boolean;
  usePixi?: boolean;
}

const CARD_RANKS = [
  'ace',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'jack',
  'queen',
  'king',
] as const;

const CARD_SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
const CRASH_VARIANTS: Record<string, string> = {
  rocket: 'rocket',
  aviator: 'aviator',
  'space-fleet': 'fleet',
  jetx: 'jet',
  balloon: 'balloon',
  jetx3: 'jet3',
  'double-x': 'double',
};
const LOCAL_TABLE_GAME_IDS = [
  'twenty-one-half-doll',
  'twenty-one-half-bunny',
  'twenty-one-half-star',
  'tui-tongzi-dragon',
  'tui-tongzi-lion',
  'tui-tongzi-jade',
  'tui-tongzi-neon',
  'tui-tongzi-gold',
  'black-dot-tianjiu',
  'black-dot-royal',
  'black-dot-street',
  'black-dot-shadow',
  'black-dot-gold',
  'card-war',
] as const;
const TUI_TONGZI_GAME_IDS = new Set([
  'tui-tongzi-dragon',
  'tui-tongzi-lion',
  'tui-tongzi-jade',
  'tui-tongzi-neon',
  'tui-tongzi-gold',
]);
const BLACK_DOT_GAME_IDS = new Set([
  'black-dot-tianjiu',
  'black-dot-royal',
  'black-dot-street',
  'black-dot-shadow',
  'black-dot-gold',
]);
const LOCAL_TABLE_STAGE_ART: Partial<Record<string, string>> = {
  'twenty-one-half-doll': '/game-art/local-table/stages/rooms/ten-half-doll-stage.webp',
  'twenty-one-half-bunny': '/game-art/local-table/stages/rooms/ten-half-bunny-stage.webp',
  'twenty-one-half-star': '/game-art/local-table/stages/rooms/ten-half-star-stage.webp',
  'tui-tongzi-dragon': '/game-art/local-table/stages/rooms/tui-tongzi-dragon-stage.webp',
  'tui-tongzi-lion': '/game-art/local-table/stages/rooms/tui-tongzi-lion-stage.webp',
  'tui-tongzi-jade': '/game-art/local-table/stages/rooms/tui-tongzi-jade-stage.webp',
  'tui-tongzi-neon': '/game-art/local-table/stages/rooms/tui-tongzi-neon-stage.webp',
  'tui-tongzi-gold': '/game-art/local-table/stages/rooms/tui-tongzi-gold-stage.webp',
  'black-dot-tianjiu': '/game-art/local-table/stages/rooms/black-dot-tianjiu-stage.webp',
  'black-dot-royal': '/game-art/local-table/stages/rooms/black-dot-royal-stage.webp',
  'black-dot-street': '/game-art/local-table/stages/rooms/black-dot-street-stage.webp',
  'black-dot-shadow': '/game-art/local-table/stages/rooms/black-dot-shadow-stage.webp',
  'black-dot-gold': '/game-art/local-table/stages/rooms/black-dot-gold-stage.webp',
  'card-war': '/game-art/local-table/stages/rooms/card-war-stage.webp',
};
const MAHJONG_TILE_ASSETS = [
  '/game-art/mahjong/WhiteDragon.svg',
  ...Array.from({ length: 9 }, (_, index) => `/game-art/mahjong/Pin${index + 1}.svg`),
];
const PAI_GOW_TILE_ASSETS = [
  '1+2',
  '2+4',
  '6+6',
  '1+1',
  '4+4',
  '1+3',
  '5+5',
  '3+3',
  '2+2',
  '5+6',
  '4+6',
  '1+6',
  '1+5',
  '4+5',
  '3+6',
  '2+6',
  '3+5',
  '2+5',
  '3+4',
  '1+4',
  '2+3',
].map((pair) => `/game-art/pai-gow/Domino-${pair}.svg`);
const SLOT_GAMES_WITH_INDIVIDUAL_SYMBOLS = new Set<SlotThemeId>([
  'thunder',
  'dragonMega',
  'nebula',
  'jungle',
  'vampire',
]);
const preloadCache = new Map<string, Promise<void>>();
const warmedGames = new Set<string>();

export const GAME_ASSET_MANIFESTS: Record<string, GameAssetManifest> = {
  blackjack: {
    gameId: 'blackjack',
    assets: [
      criticalAsset('/game-art/blackjack/cover-v2.png', 'cover'),
      criticalAsset('/game-art/blackjack/background.png', 'background'),
      ...CARD_SUITS.flatMap((suit) =>
        CARD_RANKS.map((rank) => asset(`/cards/${rank}_of_${suit}.svg`, 'card')),
      ),
    ],
  },
  dice: simplePixiGame('dice'),
  mines: simplePixiGame('mines'),
  hilo: simplePixiGame('hilo'),
  keno: simplePixiGame('keno'),
  wheel: {
    gameId: 'wheel',
    assets: [
      criticalAsset('/game-art/wheel/cover.png', 'cover'),
      criticalPixiAsset('/game-art/wheel/background-v2.png', 'background'),
      criticalPixiAsset('/game-art/wheel/sprites.png', 'sprite'),
    ],
  },
  plinko: simplePixiGame('plinko'),
  'plinko-x': simplePixiGame('plinko', 'plinko-x', getLobbyGameCover('plinko-x')),
  tower: {
    gameId: 'tower',
    assets: [
      criticalAsset('/game-art/tower/cover-v2.png', 'cover'),
      criticalPixiAsset('/game-art/tower/background.png', 'background'),
      criticalPixiAsset('/game-art/tower/stage-background.png', 'background'),
      criticalPixiAsset('/game-art/tower/sprites.png', 'sprite'),
    ],
  },
  'mini-roulette': {
    gameId: 'mini-roulette',
    assets: [
      criticalAsset('/game-art/mini-roulette/cover-v2.png', 'cover'),
      criticalPixiAsset('/game-art/mini-roulette/background-v2.png', 'background'),
    ],
  },
  carnival: {
    gameId: 'carnival',
    assets: [
      criticalAsset('/game-art/carnival/cover-v2.png', 'cover'),
      criticalPixiAsset('/game-art/carnival/background-v2.png', 'background'),
    ],
  },
  'chicken-road': {
    gameId: 'chicken-road',
    assets: [
      criticalAsset('/game-art/chicken-road/cover.png', 'cover'),
      criticalAsset('/game-art/chicken-road/background.png', 'background'),
      criticalAsset('/game-art/chicken-road/chicken-side.png', 'sprite'),
      criticalAsset('/game-art/chicken-road/sprites.png', 'sprite'),
      criticalAsset('/game-art/chicken-road/vehicles.png', 'sprite'),
    ],
  },
  ...Object.fromEntries(LOCAL_TABLE_GAME_IDS.map((gameId) => [gameId, localTableGame(gameId)])),
  ...Object.fromEntries(Object.keys(CRASH_VARIANTS).map((gameId) => [gameId, crashGame(gameId)])),
  ...Object.fromEntries(
    Object.values(SLOT_THEMES).map((theme) => [theme.gameId, slotGame(theme)] as const),
  ),
};

export function getGameAssetManifest(gameId: string): GameAssetManifest | null {
  return GAME_ASSET_MANIFESTS[gameId] ?? null;
}

export function preloadGameAssets(
  gameId: string,
  options: PreloadGameAssetsOptions = {},
): Promise<void> {
  const includeNonCritical = options.includeNonCritical ?? false;
  const cacheKey = `${gameId}:${includeNonCritical ? 'all' : 'critical'}:${options.usePixi ?? true}`;
  const cached = preloadCache.get(cacheKey);
  if (cached) return cached;

  const manifest = getGameAssetManifest(gameId);
  if (!manifest) return Promise.resolve();

  const assets = includeNonCritical
    ? manifest.assets
    : manifest.assets.filter((entry) => entry.critical);
  const promise = Promise.all(assets.map((entry) => preloadAsset(entry, options))).then(() => {
    if (!includeNonCritical) warmRemainingGameAssets(gameId, options);
  });
  preloadCache.set(cacheKey, promise);
  return promise;
}

export function warmGameAssets(gameId: string): void {
  void preloadGameAssets(gameId, { includeNonCritical: false, usePixi: false });
}

function warmRemainingGameAssets(gameId: string, options: PreloadGameAssetsOptions): void {
  if (warmedGames.has(gameId)) return;
  warmedGames.add(gameId);

  const run = () => {
    void preloadGameAssets(gameId, { ...options, includeNonCritical: true }).catch(() => undefined);
  };

  if (typeof window === 'undefined') return;
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  };
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(run, { timeout: 2500 });
  } else {
    window.setTimeout(run, 300);
  }
}

function simplePixiGame(
  folder: string,
  gameId = folder,
  cover = `/game-art/${folder}/cover-v2.png`,
): GameAssetManifest {
  return {
    gameId,
    assets: [
      criticalAsset(cover, 'cover'),
      criticalPixiAsset(`/game-art/${folder}/background.png`, 'background'),
      criticalPixiAsset(`/game-art/${folder}/sprites.png`, 'sprite'),
    ],
  };
}

function coverOnlyGame(gameId: string): GameAssetManifest {
  return {
    gameId,
    assets: [criticalAsset(getLobbyGameCover(gameId), 'cover')],
  };
}

function localTableGame(gameId: string): GameAssetManifest {
  return {
    gameId,
    assets: [
      criticalAsset(getLobbyGameCover(gameId), 'cover'),
      criticalAsset(localTableStageArt(gameId), 'background'),
      ...(TUI_TONGZI_GAME_IDS.has(gameId) ? MAHJONG_TILE_ASSETS.map((src) => asset(src, 'card')) : []),
      ...(BLACK_DOT_GAME_IDS.has(gameId) ? PAI_GOW_TILE_ASSETS.map((src) => asset(src, 'card')) : []),
    ],
  };
}

function localTableStageArt(gameId: string): string {
  const roomStage = LOCAL_TABLE_STAGE_ART[gameId];
  if (roomStage) return roomStage;
  if (TUI_TONGZI_GAME_IDS.has(gameId)) return '/game-art/local-table/stages/tui-tongzi-stage.webp';
  if (BLACK_DOT_GAME_IDS.has(gameId)) return '/game-art/local-table/stages/black-dot-stage.webp';
  if (gameId === 'card-war') return '/game-art/local-table/stages/card-war-stage.webp';
  return '/game-art/local-table/stages/ten-half-stage.webp';
}

function crashGame(gameId: string): GameAssetManifest {
  const variant = CRASH_VARIANTS[gameId] ?? gameId;
  return {
    gameId,
    assets: [
      criticalAsset(getLobbyGameCover(gameId), 'cover'),
      criticalPixiAsset(`/crash/backgrounds/${variant}.jpg`, 'background'),
      criticalPixiAsset(`/crash/craft/${variant}.png`, 'craft'),
    ],
  };
}

function slotGame(theme: SlotThemeConfig): GameAssetManifest {
  const assets: GameAssetEntry[] = [
    criticalAsset(theme.cover, 'cover'),
    criticalPixiAsset(theme.background, 'background'),
    criticalPixiAsset(theme.symbolSheet, 'symbol'),
    criticalPixiAsset(theme.symbolSheet.replace(/symbols\.png$/, 'scatter.png'), 'symbol'),
  ];

  if (theme.bigWin) assets.push(asset(theme.bigWin, 'big-win'));
  if (theme.reels === 6 && theme.rows === 5) {
    assets.push(...SLOT_BIG_WIN_TIER_ASSETS.map((src) => asset(src, 'big-win')));
  }

  if (SLOT_GAMES_WITH_INDIVIDUAL_SYMBOLS.has(theme.id)) {
    assets.push(
      criticalPixiAsset(theme.symbolSheet.replace(/symbols\.png$/, 'multiplier.png'), 'symbol'),
    );
    assets.push(
      ...theme.symbols.map((_symbol, index) =>
        criticalPixiAsset(
          theme.symbolSheet.replace(/symbols\.png$/, `symbol-${index}.png`),
          'symbol',
        ),
      ),
    );
  }

  return { gameId: theme.gameId, assets };
}

function asset(src: string, kind: GameAssetKind): GameAssetEntry {
  return { src, kind };
}

function criticalAsset(src: string, kind: GameAssetKind): GameAssetEntry {
  return { src, kind, critical: true };
}

function criticalPixiAsset(src: string, kind: GameAssetKind): GameAssetEntry {
  return { src, kind, critical: true, pixi: true };
}

async function preloadAsset(
  entry: GameAssetEntry,
  options: PreloadGameAssetsOptions,
): Promise<void> {
  void entry.pixi;
  void options.usePixi;
  await preloadBrowserImage(entry);
}

function preloadBrowserImage(entry: GameAssetEntry): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const src = entry.src;
  if (!/\.(avif|jpe?g|png|svg|webp)$/i.test(src)) return Promise.resolve();

  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.loading = entry.critical ? 'eager' : 'lazy';
    if ('fetchPriority' in image && entry.critical) {
      image.fetchPriority = 'high';
    }
    if (!entry.pixi) {
      const preset = preloadPresetFor(entry);
      const srcSet = getOptimizedImageSrcSet(src, preset);
      if (srcSet) {
        image.srcset = srcSet;
        image.sizes = preloadSizesFor(entry, preset);
      }
    }
    image.onload = () => {
      if ('decode' in image) {
        image.decode().then(resolve).catch(resolve);
      } else {
        resolve();
      }
    };
    image.onerror = () => resolve();
    image.src = src;
  });
}

function preloadPresetFor(entry: GameAssetEntry): ResponsivePreset {
  if (entry.kind === 'cover') return 'hero';
  if (entry.kind === 'background') return 'game-stage';
  return 'lobby-card';
}

function preloadSizesFor(entry: GameAssetEntry, preset: ResponsivePreset): string {
  if (preset === 'game-stage') return '(min-width: 1024px) 70vw, 100vw';
  if (preset === 'hero') return '100vw';
  if (entry.kind === 'cover') return '(min-width: 1280px) 360px, (min-width: 768px) 42vw, 92vw';
  return '50vw';
}
