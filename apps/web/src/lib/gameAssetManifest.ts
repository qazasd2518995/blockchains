import { SLOT_THEMES, type SlotThemeConfig } from '@/lib/slotThemes';
import { H5_GAMES } from '@bg/shared';
import { getLobbyGameCover } from '@/lib/gameCoverAssets';
import { SLOT_BIG_WIN_TIER_ASSETS } from '@/lib/slotWinTiers';
import {
  getOptimizedImageSrcSet,
  getOptimizedImageUrl,
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
const POKER_CARD_ASSETS = CARD_SUITS.flatMap((suit) =>
  CARD_RANKS.map((rank) => `/cards/${rank}_of_${suit}.svg`),
);
const CRASH_VARIANTS: Record<string, string> = {
  rocket: 'rocket',
  aviator: 'aviator',
  'space-fleet': 'fleet',
  jetx: 'jet',
  balloon: 'balloon',
  jetx3: 'jet3',
  'double-x': 'double',
};
const BACCARAT_TABLE_GAME_IDS = [
  'baccarat-dragon',
  'baccarat-panda',
  'baccarat-fox',
  'baccarat-tiger',
  'baccarat-phoenix',
] as const;
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
  'card-war-neon',
  'card-war-gold',
  'card-war-crystal',
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
const POKER_LOCAL_TABLE_GAME_IDS = new Set([
  'twenty-one-half-doll',
  'twenty-one-half-bunny',
  'twenty-one-half-star',
  'card-war',
  'card-war-neon',
  'card-war-gold',
  'card-war-crystal',
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
  'card-war-neon': '/game-art/local-table/card-war-neon-cover.webp',
  'card-war-gold': '/game-art/local-table/card-war-gold-cover.webp',
  'card-war-crystal': '/game-art/local-table/card-war-crystal-cover.webp',
};
const MAHJONG_TILE_ASSETS = [
  '/game-art/mahjong/Back.svg',
  '/game-art/mahjong/WhiteDragon.svg',
  ...['Pin', 'Sou', 'Man'].flatMap((suit) =>
    Array.from({ length: 9 }, (_, index) => `/game-art/mahjong/${suit}${index + 1}.svg`),
  ),
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
const preloadCache = new Map<string, Promise<void>>();
const warmedGames = new Set<string>();
const warmedCocosShellAssets = new Set<string>();
const H5_GAME_ID_SET = new Set<string>(H5_GAMES.map((game) => game.gameId));

interface CocosShellAsset {
  src: string;
  as: 'fetch' | 'script';
}

const SETH2_SHELL_ASSETS: readonly CocosShellAsset[] = [
  { src: '/games/storm-of-seth-2-v115/app.js', as: 'script' },
  { src: '/games/storm-of-seth-2-v115/src/settings.json', as: 'fetch' },
  {
    src: '/games/storm-of-seth-2-v115/src/seth2-local-adapter.js?v=20260816-orientation-3',
    as: 'script',
  },
  { src: '/games/storm-of-seth-2-v115/cocos-js/cc.js', as: 'script' },
  { src: '/games/storm-of-seth-2-v115/assets/internal/config.json', as: 'fetch' },
  { src: '/games/storm-of-seth-2-v115/assets/internal/index.js', as: 'script' },
  { src: '/games/storm-of-seth-2-v115/assets/main/config.json', as: 'fetch' },
  { src: '/games/storm-of-seth-2-v115/assets/main/index.js', as: 'script' },
  { src: '/games/storm-of-seth-2-v115/assets/resources/config.json', as: 'fetch' },
  { src: '/games/storm-of-seth-2-v115/assets/g1005/config.json', as: 'fetch' },
  { src: '/games/storm-of-seth-2-v115/assets/g1005/index.js', as: 'script' },
  { src: '/slotFramework/manifest.json', as: 'fetch' },
  {
    src: '/slotFramework/40401f29702686de9cfed69b217641b6029834f7/config.json',
    as: 'fetch',
  },
  {
    src: '/slotFramework/40401f29702686de9cfed69b217641b6029834f7/index.js',
    as: 'script',
  },
];

const H5_SHELL_ASSETS: readonly CocosShellAsset[] = [
  { src: '/games/h5-slot-collection/yachiyo-adapter.js?v=40', as: 'script' },
  { src: '/games/h5-slot-collection/src/settings.33a69.js', as: 'script' },
  { src: '/games/h5-slot-collection/main.649de.js?v=2', as: 'script' },
  { src: '/games/h5-slot-collection/cocos2d-js-min.22f51.js', as: 'script' },
  { src: '/games/h5-slot-collection/assets/resources/config.9bbee.json', as: 'fetch' },
  { src: '/games/h5-slot-collection/assets/resources/index.9bbee.js', as: 'script' },
  { src: '/games/h5-slot-collection/assets/main/config.9d2e3.json', as: 'fetch' },
  { src: '/games/h5-slot-collection/assets/main/index.9d2e3.js', as: 'script' },
];

export const GAME_ASSET_MANIFESTS: Record<string, GameAssetManifest> = {
  'storm-of-seth-2': coverOnlyGame('storm-of-seth-2'),
  'fruit-mary': coverOnlyGame('fruit-mary'),
  'h5-slot-collection': coverOnlyGame('h5-slot-collection'),
  ...Object.fromEntries(H5_GAMES.map((game) => [game.gameId, coverOnlyGame(game.gameId)])),
  blackjack: {
    gameId: 'blackjack',
    assets: [
      criticalAsset('/game-art/blackjack/cover-v2.png', 'cover'),
      criticalAsset('/game-art/blackjack/background.png', 'background'),
      ...POKER_CARD_ASSETS.map((src) => asset(src, 'card')),
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
  ...Object.fromEntries(
    BACCARAT_TABLE_GAME_IDS.map((gameId) => [gameId, baccaratTableGame(gameId)]),
  ),
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
  warmCocosShell(gameId);
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

function warmCocosShell(gameId: string): void {
  if (typeof document === 'undefined') return;
  const shellAssets =
    gameId === 'storm-of-seth-2'
      ? SETH2_SHELL_ASSETS
      : H5_GAME_ID_SET.has(gameId)
        ? H5_SHELL_ASSETS
        : null;
  if (!shellAssets) return;

  for (const assetEntry of shellAssets) {
    if (warmedCocosShellAssets.has(assetEntry.src)) continue;
    warmedCocosShellAssets.add(assetEntry.src);
    const link = document.createElement('link');
    // Safari may indefinitely defer `prefetch`, especially on iPhone. Preload
    // is intentional here: this only runs for an explicit pointer intent or
    // the idle Seth 2 warmup, and lets the same-origin iframe reuse the HTTP
    // cache immediately.
    link.rel = 'preload';
    link.as = assetEntry.as;
    link.href = assetEntry.src;
    if (
      assetEntry.as === 'fetch' ||
      assetEntry.src.includes('/assets/') ||
      assetEntry.src.includes('/slotFramework/')
    ) {
      link.crossOrigin = 'anonymous';
    }
    document.head.appendChild(link);
  }
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

function baccaratTableGame(gameId: string): GameAssetManifest {
  return {
    gameId,
    assets: [
      criticalAsset(getLobbyGameCover(gameId), 'cover'),
      ...POKER_CARD_ASSETS.map((src) => asset(src, 'card')),
    ],
  };
}

function localTableGame(gameId: string): GameAssetManifest {
  return {
    gameId,
    assets: [
      criticalAsset(localTableStageArt(gameId), 'background'),
      ...(POKER_LOCAL_TABLE_GAME_IDS.has(gameId)
        ? POKER_CARD_ASSETS.map((src) => asset(src, 'card'))
        : []),
      ...(TUI_TONGZI_GAME_IDS.has(gameId)
        ? MAHJONG_TILE_ASSETS.map((src) => asset(src, 'card'))
        : []),
      ...(BLACK_DOT_GAME_IDS.has(gameId)
        ? PAI_GOW_TILE_ASSETS.map((src) => asset(src, 'card'))
        : []),
    ],
  };
}

function localTableStageArt(gameId: string): string {
  const roomStage = LOCAL_TABLE_STAGE_ART[gameId];
  if (roomStage) return roomStage;
  if (TUI_TONGZI_GAME_IDS.has(gameId)) return '/game-art/local-table/stages/tui-tongzi-stage.webp';
  if (BLACK_DOT_GAME_IDS.has(gameId)) return '/game-art/local-table/stages/black-dot-stage.webp';
  if (gameId.startsWith('card-war')) return '/game-art/local-table/stages/card-war-stage.webp';
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
    // Router 只等封面完成就進入頁面；盤面圖由 scene 與閒置預熱共用瀏覽器 cache。
    // 不再阻塞等待整張 symbols.png 與全部原始 PNG 解碼。
    optimizedAsset(theme.cover, 960, 'hero', 'cover', true),
    optimizedAsset(theme.background, 1600, 'game-stage', 'background'),
    ...theme.symbols.map((_symbol, index) =>
      optimizedAsset(
        theme.symbolSheet.replace(/symbols\.png$/, `symbol-${index}.png`),
        960,
        'game-stage',
        'symbol',
      ),
    ),
  ];

  if (theme.bigWin) assets.push(exactImageAsset(theme.bigWin, 'big-win'));
  if (theme.reels === 6 && theme.rows === 5) {
    assets.push(...SLOT_BIG_WIN_TIER_ASSETS.map((src) => exactImageAsset(src, 'big-win')));
    assets.push(
      optimizedAsset(
        theme.symbolSheet.replace(/symbols\.png$/, 'scatter.png'),
        960,
        'game-stage',
        'symbol',
      ),
      optimizedAsset(
        theme.symbolSheet.replace(/symbols\.png$/, 'multiplier.png'),
        960,
        'game-stage',
        'symbol',
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

function exactImageAsset(src: string, kind: GameAssetKind, critical = false): GameAssetEntry {
  return { src, kind, critical, pixi: true };
}

function optimizedAsset(
  src: string,
  width: number,
  preset: ResponsivePreset,
  kind: GameAssetKind,
  critical = false,
): GameAssetEntry {
  const optimizedSrc = src.startsWith('/_optimized/')
    ? src
    : getOptimizedImageUrl(src, width, preset);
  return exactImageAsset(optimizedSrc, kind, critical);
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
    if (!entry.pixi && !src.startsWith('/_optimized/')) {
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
  if (preset === 'game-stage' && entry.src.includes('/game-art/local-table/stages/')) {
    return '(max-width: 480px) 240px, (min-width: 1024px) 70vw, 100vw';
  }
  if (preset === 'game-stage') return '(min-width: 1024px) 70vw, 100vw';
  if (preset === 'hero') return '100vw';
  if (entry.kind === 'cover') return '(min-width: 1280px) 360px, (min-width: 768px) 42vw, 92vw';
  return '50vw';
}
