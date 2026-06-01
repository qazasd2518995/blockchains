export type SlotBigWinTier = 'big' | 'huge' | 'mega';

export interface SlotBigWinTierMeta {
  badge: string;
  eyebrow: string;
  title: string;
  featureEyebrow: string;
  featureTitle: string;
  asset: string;
}

export const SLOT_BIG_WIN_MIN_MULTIPLIER = 20;

export const SLOT_BIG_WIN_TIER_META: Record<SlotBigWinTier, SlotBigWinTierMeta> = {
  big: {
    badge: 'BIG WIN',
    eyebrow: '連鎖消除',
    title: '恭喜爆分',
    featureEyebrow: '免費遊戲結算',
    featureTitle: '爆分獎金',
    asset: '/slots/win-tiers/big.webp',
  },
  huge: {
    badge: 'SUPER WIN',
    eyebrow: '倍數狂飆',
    title: '超級爆分',
    featureEyebrow: '超級免費結算',
    featureTitle: '超級爆分',
    asset: '/slots/win-tiers/huge.webp',
  },
  mega: {
    badge: 'MEGA WIN',
    eyebrow: '極限爆擊',
    title: 'MEGA 爆分',
    featureEyebrow: 'MEGA 免費結算',
    featureTitle: 'MEGA 爆分',
    asset: '/slots/win-tiers/mega.webp',
  },
};

export const SLOT_BIG_WIN_TIER_ASSETS = Object.values(SLOT_BIG_WIN_TIER_META).map(
  (meta) => meta.asset,
);

const preloadedAssets = new Set<string>();

export function preloadSlotBigWinTierAssets(): void {
  if (typeof window === 'undefined') return;

  for (const src of SLOT_BIG_WIN_TIER_ASSETS) {
    if (preloadedAssets.has(src)) continue;
    preloadedAssets.add(src);
    preloadImage(src).catch(() => {
      preloadedAssets.delete(src);
    });
  }
}

export function getSlotBigWinTier(
  multiplier: number,
  won: boolean,
  minimumMultiplier = SLOT_BIG_WIN_MIN_MULTIPLIER,
): SlotBigWinTier | null {
  if (!won || !Number.isFinite(multiplier) || multiplier < minimumMultiplier) return null;

  if (multiplier >= 500) return 'mega';
  if (multiplier >= 50) return 'huge';
  return 'big';
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if ('decode' in image) {
        image.decode().then(resolve).catch(resolve);
      } else {
        resolve();
      }
    };
    image.onerror = () => reject(new Error(`Failed to preload ${src}`));
    image.src = src;
  });
}
