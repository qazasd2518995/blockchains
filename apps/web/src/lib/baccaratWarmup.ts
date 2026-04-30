import { api } from '@/lib/api';
import { BACCARAT_VARIANTS, type BaccaratVariantConfig } from '@/lib/baccaratVariants';

const FALLBACK_BACCARAT_URL = 'http://localhost:5174';
const WARMUP_IFRAME_ID = 'bg-baccarat-warmup-frame';
const WARMUP_IFRAME_TTL_MS = 45_000;

let warmupPromise: Promise<void> | null = null;
let warmupKey: string | null = null;

export function resolveBaccaratUrl(): string {
  const raw = (import.meta.env.VITE_BACCARAT_URL as string | undefined)?.trim();
  return raw && /^https?:\/\//i.test(raw) ? raw : FALLBACK_BACCARAT_URL;
}

export function resolveApiBase(): string {
  return (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || window.location.origin;
}

export function ensureBaccaratResourceHints(baccaratUrl = resolveBaccaratUrl()): void {
  const origin = new URL(baccaratUrl).origin;
  for (const rel of ['dns-prefetch', 'preconnect'] as const) {
    const selector = `link[data-baccarat-preconnect="${rel}"]`;
    if (document.head.querySelector(selector)) continue;
    const link = document.createElement('link');
    link.rel = rel;
    link.href = origin;
    link.dataset.baccaratPreconnect = rel;
    if (rel === 'preconnect') link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
}

export function buildBaccaratLaunchUrl(input: {
  baccaratUrl?: string;
  launchToken: string;
  config: BaccaratVariantConfig;
  returnUrl: string;
}): string {
  const target = new URL('/login', input.baccaratUrl ?? resolveBaccaratUrl());
  target.searchParams.set('launchToken', input.launchToken);
  target.searchParams.set('gameId', input.config.gameId);
  target.searchParams.set('provider', input.config.provider);
  target.searchParams.set('skin', input.config.skin);
  target.searchParams.set('returnUrl', input.returnUrl);
  return target.toString();
}

export function warmBaccaratInBackground(input: {
  userId: string;
  username?: string;
  returnUrl?: string;
}): Promise<void> | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return null;

  const baccaratUrl = resolveBaccaratUrl();
  const nextWarmupKey = `${input.userId}:${baccaratUrl}`;
  if (warmupPromise && warmupKey === nextWarmupKey) return warmupPromise;

  warmupKey = nextWarmupKey;
  warmupPromise = runWarmup({
    baccaratUrl,
    returnUrl: input.returnUrl ?? new URL('/lobby', window.location.origin).toString(),
  }).catch((error) => {
    if (warmupKey === nextWarmupKey) {
      warmupPromise = null;
      warmupKey = null;
    }
    if (import.meta.env.DEV) {
      console.debug('[baccarat-warmup] failed', error);
    }
  });

  return warmupPromise;
}

async function runWarmup(input: { baccaratUrl: string; returnUrl: string }): Promise<void> {
  ensureBaccaratResourceHints(input.baccaratUrl);

  const primary = BACCARAT_VARIANTS.royal;
  const res = await api.post<{ launchToken: string }>('/auth/baccarat-launch', {
    gameId: primary.gameId,
    provider: primary.provider,
    skin: primary.skin,
  });

  const launchUrl = buildBaccaratLaunchUrl({
    baccaratUrl: input.baccaratUrl,
    launchToken: res.data.launchToken,
    config: primary,
    returnUrl: input.returnUrl,
  });

  injectWarmupIframe(launchUrl);
}

function injectWarmupIframe(src: string): void {
  document.getElementById(WARMUP_IFRAME_ID)?.remove();

  const iframe = document.createElement('iframe');
  iframe.id = WARMUP_IFRAME_ID;
  iframe.title = 'Baccarat warmup';
  iframe.src = src;
  iframe.loading = 'eager';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.style.position = 'fixed';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.left = '-10px';
  iframe.style.bottom = '-10px';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  const cleanup = window.setTimeout(() => {
    iframe.remove();
  }, WARMUP_IFRAME_TTL_MS);
  iframe.addEventListener('load', () => {
    window.setTimeout(() => {
      window.clearTimeout(cleanup);
      iframe.remove();
    }, 10_000);
  });

  document.body.appendChild(iframe);
}
