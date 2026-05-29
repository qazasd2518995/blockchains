export const SLOT_DEBUG_BUILD = 'mega-slot-mobile-debug-20260527-01';

const STORAGE_KEYS = ['slot-debug', 'slotDebug'];
const TRUTHY_VALUES = new Set(['', '1', 'true', 'yes', 'on']);

type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SlotDebugSnapshot {
  label?: string;
  build: string;
  href: string;
  userAgent: string;
  viewport: {
    innerWidth: number;
    innerHeight: number;
    visualWidth: number | null;
    visualHeight: number | null;
    devicePixelRatio: number;
    screenWidth: number | null;
    screenHeight: number | null;
    orientation: string | null;
    coarsePointer: boolean | null;
  };
  serviceWorker: {
    controllerScriptURL: string | null;
    controllerState: string | null;
  };
  scripts: string[];
  assetResources: string[];
}

declare global {
  interface Window {
    __slotDebugBuild?: string;
    __slotDebugDump?: (label?: string) => SlotDebugSnapshot;
    __slotDebugProbeInstalled?: boolean;
  }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function readStorageFlag(): boolean {
  try {
    return STORAGE_KEYS.some((key) => {
      const value = localStorage.getItem(key);
      return value !== null && TRUTHY_VALUES.has(value.toLowerCase());
    });
  } catch {
    return false;
  }
}

function readUrlFlag(): boolean {
  if (!isBrowser()) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('slotDebug') ?? params.get('slot-debug');
    if (value === null) return false;
    return TRUTHY_VALUES.has(value.toLowerCase());
  } catch {
    return false;
  }
}

function persistUrlFlag(): void {
  if (!readUrlFlag()) return;
  try {
    localStorage.setItem('slot-debug', '1');
  } catch {
    /* ignore */
  }
}

export function isSlotDebugEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  if (!isBrowser()) return false;
  return readUrlFlag() || readStorageFlag();
}

function getAssetResources(): string[] {
  if (!('performance' in window)) return [];
  const entries = performance.getEntriesByType('resource');
  return entries
    .map((entry) => entry.name)
    .filter((name) => name.includes('/assets/') || name.includes('/sw.js'))
    .slice(-80);
}

export function getSlotDebugSnapshot(label?: string): SlotDebugSnapshot {
  const visualViewport = window.visualViewport;
  const orientation = window.screen?.orientation;
  return {
    label,
    build: SLOT_DEBUG_BUILD,
    href: window.location.href,
    userAgent: navigator.userAgent,
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: visualViewport?.width ?? null,
      visualHeight: visualViewport?.height ?? null,
      devicePixelRatio: window.devicePixelRatio || 1,
      screenWidth: window.screen?.width ?? null,
      screenHeight: window.screen?.height ?? null,
      orientation: orientation?.type ?? null,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? null,
    },
    serviceWorker: {
      controllerScriptURL: navigator.serviceWorker?.controller?.scriptURL ?? null,
      controllerState: navigator.serviceWorker?.controller?.state ?? null,
    },
    scripts: Array.from(document.scripts)
      .map((script) => script.src)
      .filter(Boolean)
      .slice(-50),
    assetResources: getAssetResources(),
  };
}

export function installSlotDebugProbe(label: string): void {
  if (!import.meta.env.DEV) return;
  if (!isBrowser()) return;
  persistUrlFlag();
  window.__slotDebugBuild = SLOT_DEBUG_BUILD;
  window.__slotDebugDump = getSlotDebugSnapshot;
  if (!window.__slotDebugProbeInstalled && 'serviceWorker' in navigator) {
    window.__slotDebugProbeInstalled = true;
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SLOT_DEBUG_PONG') {
        slotDebug('sw:pong', event.data, 'info');
      }
    });
    navigator.serviceWorker.controller?.postMessage({ type: 'SLOT_DEBUG_PING' });
  }
  slotDebug(`${label}:probe-installed`, getSlotDebugSnapshot(label), 'info');
}

export function probeSlotDebugBackend(): void {
  if (!isSlotDebugEnabled()) return;
  const apiBase = import.meta.env.VITE_API_BASE ?? '';
  const endpoint = `${apiBase}/api/debug/client-build?slotDebug=1`;
  void fetch(endpoint, {
    credentials: 'include',
    headers: { 'x-slot-debug': '1' },
  })
    .then(async (response) => {
      const body = await response.json().catch(() => null);
      slotDebug('backend:client-build', { status: response.status, body }, 'info');
    })
    .catch((error) => {
      slotDebug('backend:client-build-error', describeSlotDebugError(error), 'warn');
    });
}

export function slotDebug(label: string, payload?: unknown, level: DebugLevel = 'debug'): void {
  if (!isSlotDebugEnabled()) return;
  const logger = console[level] ?? console.debug;
  logger.call(console, `[slot-debug] ${label}`, payload ?? '');
}

export function describeSlotDebugError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return error;
}
