import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, RotateCw } from 'lucide-react';
import { Sfx } from '@bg/game-engine';
import { useAuthStore } from '@/stores/authStore';
import { holdWalletBalanceRefresh } from '@/hooks/useLiveBalance';
import { buildLoginPath } from '@/hooks/useRequireLogin';
import { useTranslation } from '@/i18n/useTranslation';
import { PlatformBgm } from '@/lib/platformBgm';
import { useGameReturnTarget } from '@/hooks/useGameReturnTarget';
import { returnFromGame } from '@/lib/gameReturnNavigation';
import { ensureGameLoadStarted, recordGameLoadMilestone } from '@/lib/gameLoadPerformance';

const ORIGINAL_GAME_PATH = '/games/power-of-thor-2/original-runtime/index.html';
const LAYOUT_STORAGE_KEY = 'bg.thor2.layout';
const DISPOSE_FALLBACK_MS = 350;

type Thor2Layout = 'portrait' | 'landscape';
type Thor2RemountReason = 'orientation';
type Thor2FullscreenTarget = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type Thor2FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};
type Thor2ScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
};

export function PowerOfThor2Page() {
  const navigate = useNavigate();
  const returnTarget = useGameReturnTarget();
  const { locale } = useTranslation();
  const isAuthenticated = useAuthStore((state) => Boolean(state.user));
  const setBalance = useAuthStore((state) => state.setBalance);
  const setTokens = useAuthStore((state) => state.setTokens);
  const [error, setError] = useState('');
  const [deviceLayout, setDeviceLayout] = useState<Thor2Layout>(readDeviceLayout);
  const [layout, setLayout] = useState<Thor2Layout>(
    () => readSavedLayout() ?? readDeviceLayout(),
  );
  const [iframeMounted, setIframeMounted] = useState(true);
  const [iframeGeneration, setIframeGeneration] = useState(0);
  const [remountReason, setRemountReason] = useState<Thor2RemountReason | null>(null);
  const [requestedLayout, setRequestedLayout] = useState<Thor2Layout | null>(null);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ownsFullscreenRef = useRef(false);
  const currentLayoutRef = useRef(layout);
  const pendingRemountRef = useRef<{
    layout: Thor2Layout;
    reason: Thor2RemountReason;
  } | null>(null);
  const disposeFallbackTimerRef = useRef<number | null>(null);
  const remountTimerRef = useRef<number | null>(null);
  const remountFrameRef = useRef<number | null>(null);

  useEffect(() => {
    ensureGameLoadStarted('power-of-thor-2');
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    return holdWalletBalanceRefresh();
  }, [isAuthenticated]);

  const gameUrl = useMemo(() => {
    const configuredBase = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
    const apiBase = `${configuredBase || window.location.origin}/api`;
    const query = new URLSearchParams({
      // jsStart-cocos reads the first two values positionally. Keep this order.
      dir: 'PowerOfThor2',
      wspath: 'RewardableSlotUser',
      apiBase,
      lang: sourceLocale(locale),
      layout,
      build: 'qmoney-thor2-original-cocos-v6-true-landscape',
    });
    return `${ORIGINAL_GAME_PATH}?${query.toString()}`;
  }, [layout, locale]);

  const syncOriginalGameAudio = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'thor2:audio-sync' },
      window.location.origin,
    );
  }, []);

  const syncOriginalGameLayout = useCallback((nextLayout: Thor2Layout) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'thor2:layout', layout: nextLayout },
      window.location.origin,
    );
  }, []);

  const unlockOriginalGameAudio = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow as Thor2BridgeWindow | null;
    frameWindow?.__QmoneyThor2UnlockAudio?.();
    frameWindow?.postMessage({ type: 'thor2:audio-unlock' }, window.location.origin);
  }, []);

  const finishIframeRemount = useCallback((nextLayout: Thor2Layout) => {
    if (disposeFallbackTimerRef.current !== null) {
      window.clearTimeout(disposeFallbackTimerRef.current);
      disposeFallbackTimerRef.current = null;
    }
    pendingRemountRef.current = null;
    currentLayoutRef.current = nextLayout;
    saveLayout(nextLayout);
    // Match Seth 2: remove the old WebGL iframe for a paint turn before
    // mounting the other orientation, so mobile WebKit can release the GPU context.
    setIframeMounted(false);
    setLayout(nextLayout);
    setIframeGeneration((generation) => generation + 1);
    remountFrameRef.current = window.requestAnimationFrame(() => {
      remountFrameRef.current = window.requestAnimationFrame(() => {
        remountFrameRef.current = null;
        remountTimerRef.current = window.setTimeout(() => {
          remountTimerRef.current = null;
          setIframeMounted(true);
          setRemountReason(null);
        }, 80);
      });
    });
  }, []);

  const requestIframeRemount = useCallback(
    (nextLayout: Thor2Layout, reason: Thor2RemountReason) => {
      if (pendingRemountRef.current !== null || nextLayout === currentLayoutRef.current) {
        return false;
      }
      pendingRemountRef.current = { layout: nextLayout, reason };
      setError('');
      setRemountReason(reason);
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'thor2:dispose' },
        window.location.origin,
      );
      // Cached adapters may not acknowledge disposal. Keep the same bounded
      // fallback as Seth 2 so the player cannot remain stuck on the transition.
      disposeFallbackTimerRef.current = window.setTimeout(
        () => finishIframeRemount(nextLayout),
        DISPOSE_FALLBACK_MS,
      );
      return true;
    },
    [finishIframeRemount],
  );

  const requestLayoutSwitch = useCallback(
    (nextLayout: Thor2Layout) => requestIframeRemount(nextLayout, 'orientation'),
    [requestIframeRemount],
  );

  const enterLandscapeDisplay = useCallback(() => {
    const target = pageRef.current;
    if (!target) return;
    void requestThor2LandscapeFullscreen(target, ownsFullscreenRef);
  }, []);

  const leaveLandscapeDisplay = useCallback(() => {
    void releaseThor2LandscapeFullscreen(ownsFullscreenRef);
  }, []);

  const handleIframeLoad = useCallback(() => {
    recordGameLoadMilestone('power-of-thor-2', 'iframe-loaded');
    syncOriginalGameAudio();
    syncOriginalGameLayout(currentLayoutRef.current);
  }, [syncOriginalGameAudio, syncOriginalGameLayout]);

  useEffect(() => {
    const unsubscribeSfx = Sfx.subscribe(syncOriginalGameAudio);
    const unsubscribeBgm = PlatformBgm.subscribe(syncOriginalGameAudio);
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown'];
    events.forEach((eventName) =>
      window.addEventListener(eventName, unlockOriginalGameAudio, { passive: true }),
    );
    return () => {
      unsubscribeSfx();
      unsubscribeBgm();
      events.forEach((eventName) => window.removeEventListener(eventName, unlockOriginalGameAudio));
    };
  }, [syncOriginalGameAudio, unlockOriginalGameAudio]);

  useEffect(() => {
    const media = window.matchMedia('(orientation: landscape)');
    const updateDeviceLayout = () => setDeviceLayout(media.matches ? 'landscape' : 'portrait');
    media.addEventListener('change', updateDeviceLayout);
    return () => media.removeEventListener('change', updateDeviceLayout);
  }, []);

  useEffect(() => {
    const fullscreenDocument = document as Thor2FullscreenDocument;
    const updateFullscreenState = () => {
      const activeElement = document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement;
      setFullscreenActive(activeElement === pageRef.current);
      if (!activeElement) ownsFullscreenRef.current = false;
    };
    document.addEventListener('fullscreenchange', updateFullscreenState);
    document.addEventListener('webkitfullscreenchange', updateFullscreenState);
    updateFullscreenState();
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState);
      document.removeEventListener('webkitfullscreenchange', updateFullscreenState);
    };
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => syncOriginalGameLayout(layout));
    const timerId = window.setTimeout(() => syncOriginalGameLayout(layout), 180);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timerId);
    };
  }, [layout, syncOriginalGameLayout]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data as {
        type?: string;
        balance?: unknown;
        message?: unknown;
        accessToken?: unknown;
        refreshToken?: unknown;
      };
      if (payload.type === 'thor2:close') {
        returnFromGame(navigate, returnTarget.to);
        return;
      }
      if (payload.type === 'thor2:disposed' && pendingRemountRef.current) {
        finishIframeRemount(pendingRemountRef.current.layout);
      }
      if (payload.type === 'thor2:ready') {
        recordGameLoadMilestone('power-of-thor-2', 'session-ready');
        setError('');
      }
      if (payload.type === 'thor2:visual-ready') {
        recordGameLoadMilestone('power-of-thor-2', 'visual-ready');
      }
      if (payload.type === 'thor2:balance' || payload.type === 'thor2:ready') {
        const balance = Number(payload.balance);
        if (Number.isFinite(balance)) setBalance(balance.toFixed(2));
      }
      if (payload.type === 'thor2:error') {
        setError(String(payload.message || '原始遊戲連線失敗'));
      }
      if (
        payload.type === 'thor2:tokens' &&
        typeof payload.accessToken === 'string' &&
        typeof payload.refreshToken === 'string'
      ) {
        setTokens(payload.accessToken, payload.refreshToken);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [finishIframeRemount, navigate, returnTarget.to, setBalance, setTokens]);

  useEffect(
    () => () => {
      if (disposeFallbackTimerRef.current !== null) {
        window.clearTimeout(disposeFallbackTimerRef.current);
      }
      if (remountTimerRef.current !== null) window.clearTimeout(remountTimerRef.current);
      if (remountFrameRef.current !== null) window.cancelAnimationFrame(remountFrameRef.current);
      void releaseThor2LandscapeFullscreen(ownsFullscreenRef);
    },
    [],
  );

  if (!isAuthenticated) {
    return (
      <AccessPanel
        message="請先登入後再進入遊戲。"
        action={
          <Link
            to={buildLoginPath('/games/power-of-thor-2', 'game')}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-[#C58B21] px-5 text-sm font-black text-white"
          >
            前往登入
          </Link>
        }
      />
    );
  }

  return (
    <div
      ref={pageRef}
      className={pageClassName(layout, deviceLayout, fullscreenActive)}
      data-thor2-layout={layout}
      data-thor2-display={
        layout === 'landscape' && deviceLayout === 'portrait' ? 'rotated-fullscreen' : 'native'
      }
    >
      <div className="absolute inset-0 overflow-hidden bg-black">
        <div
          className={frameClassName(layout, deviceLayout)}
          data-thor2-frame={layout}
          style={{ contain: 'layout paint', isolation: 'isolate' }}
        >
          {iframeMounted ? (
            <iframe
              key={`${layout}-${iframeGeneration}`}
              ref={iframeRef}
              src={gameUrl}
              title="雷神之錘 II"
              allow="autoplay; fullscreen"
              allowFullScreen
              onLoad={handleIframeLoad}
              className="absolute inset-0 h-full w-full border-0 bg-black"
            />
          ) : (
            <div
              className="absolute inset-0 grid place-items-center bg-black text-sm font-bold text-white/75"
              role="status"
              aria-live="polite"
            >
              正在切換遊戲方向…
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          const nextLayout = layout === 'portrait' ? 'landscape' : 'portrait';
          setRequestedLayout(nextLayout);
        }}
        disabled={remountReason !== null}
        className="absolute right-[max(10px,env(safe-area-inset-right))] top-[calc(env(safe-area-inset-top)+68px)] z-30 grid h-12 w-12 place-items-center rounded-full border border-white/25 bg-[#07152E]/90 text-white shadow-[0_6px_18px_rgba(0,0,0,0.38)] backdrop-blur-md transition enabled:active:scale-95 disabled:cursor-wait disabled:opacity-55"
        aria-label={layout === 'portrait' ? '切換為橫式版面' : '切換為直式版面'}
        title={layout === 'portrait' ? '切換為橫式版面' : '切換為直式版面'}
      >
        <RotateCw className="h-5 w-5" aria-hidden="true" />
      </button>
      {requestedLayout ? (
        <div
          className="absolute inset-0 z-40 grid place-items-center bg-black/65 px-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="thor2-orientation-title"
        >
          <div className="w-full max-w-xs rounded-2xl border border-[#E9C35C]/40 bg-[#07152E] p-5 text-center shadow-2xl">
            <h2 id="thor2-orientation-title" className="text-base font-black text-white">
              切換遊戲方向
            </h2>
            <p className="mt-2 text-sm font-bold leading-6 text-white/70">
              是否切換為{requestedLayout === 'portrait' ? '直式' : '橫式'}版面？
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRequestedLayout(null)}
                className="h-11 rounded-xl border border-white/15 bg-white/5 text-sm font-black text-white/80 transition active:scale-95"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextLayout = requestedLayout;
                  // Keep the Fullscreen API inside the click gesture. Android browsers
                  // reject delayed requests after the orientation remount has begun.
                  if (nextLayout === 'landscape') enterLandscapeDisplay();
                  else leaveLandscapeDisplay();
                  setRequestedLayout(null);
                  requestLayoutSwitch(nextLayout);
                }}
                className="h-11 rounded-xl bg-[#C58B21] text-sm font-black text-white shadow-lg transition active:scale-95"
              >
                確定
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {remountReason ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 text-center text-xs font-bold text-white/65">
          正在重新建立完整畫質遊戲畫面…
        </div>
      ) : null}
      {error ? (
        <div className="absolute bottom-5 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-red-300/30 bg-red-950/95 px-4 py-3 text-sm text-red-50 shadow-xl">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}
    </div>
  );
}

function readDeviceLayout(): Thor2Layout {
  if (typeof window === 'undefined') return 'landscape';
  return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
}

function readSavedLayout(): Thor2Layout | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    return saved === 'portrait' || saved === 'landscape' ? saved : null;
  } catch {
    return null;
  }
}

function saveLayout(layout: Thor2Layout) {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  } catch {
    // Private WebViews can deny storage; the current session still switches.
  }
}

function pageClassName(
  layout: Thor2Layout,
  deviceLayout: Thor2Layout,
  fullscreenActive: boolean,
): string {
  const base =
    'overflow-hidden bg-black shadow-[0_20px_60px_rgba(0,0,0,0.55)] transition-none';
  if (fullscreenActive || (layout === 'landscape' && deviceLayout === 'portrait')) {
    return `${base} fixed inset-0 z-[100] h-[100dvh] w-[100dvw] min-h-0 rounded-none border-0`;
  }
  return `${base} relative h-[calc(100svh-5.25rem)] min-h-[420px] rounded-2xl border border-[#E9C35C]/30`;
}

function frameClassName(layout: Thor2Layout, deviceLayout: Thor2Layout): string {
  const base = 'absolute overflow-hidden bg-black';
  if (layout === 'landscape' && deviceLayout === 'portrait') {
    // iOS Safari does not expose arbitrary-element Fullscreen or orientation lock.
    // Swap the viewport dimensions and rotate the native 1280x720 client so it still
    // occupies the whole display instead of becoming a short 16:9 strip.
    return `${base} left-1/2 top-1/2 h-[100dvw] w-[100dvh] max-h-none max-w-none -translate-x-1/2 -translate-y-1/2 rotate-90`;
  }
  return `${base} inset-0 h-full w-full`;
}

async function requestThor2LandscapeFullscreen(
  target: HTMLElement,
  ownsFullscreenRef: { current: boolean },
): Promise<void> {
  const fullscreenDocument = document as Thor2FullscreenDocument;
  const activeElement = document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement;
  const fullscreenTarget = target as Thor2FullscreenTarget;

  try {
    if (!activeElement && target.requestFullscreen) {
      await target.requestFullscreen({ navigationUI: 'hide' });
      ownsFullscreenRef.current = true;
    } else if (!activeElement && fullscreenTarget.webkitRequestFullscreen) {
      await fullscreenTarget.webkitRequestFullscreen();
      ownsFullscreenRef.current = true;
    }
  } catch {
    // The rotated full-viewport fallback below remains available on iOS/WebViews.
  }

  try {
    await (screen.orientation as Thor2ScreenOrientation | undefined)?.lock?.('landscape');
  } catch {
    // Browsers may require installed/PWA mode or may not implement orientation lock.
  }
}

async function releaseThor2LandscapeFullscreen(ownsFullscreenRef: {
  current: boolean;
}): Promise<void> {
  try {
    (screen.orientation as Thor2ScreenOrientation | undefined)?.unlock?.();
  } catch {
    // Orientation unlock is optional on iOS/WebViews.
  }

  if (!ownsFullscreenRef.current) return;
  ownsFullscreenRef.current = false;
  const fullscreenDocument = document as Thor2FullscreenDocument;
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (fullscreenDocument.webkitFullscreenElement) {
      await fullscreenDocument.webkitExitFullscreen?.();
    }
  } catch {
    // The browser may already have left fullscreen through its own UI.
  }
}

function sourceLocale(locale: string): string {
  if (locale === 'zh-Hans') return 'zh-CN';
  if (locale === 'zh-Hant') return 'zh-TW';
  if (locale === 'th') return 'th-TH';
  if (locale === 'vi') return 'vi-VN';
  return 'en-US';
}

type Thor2BridgeWindow = Window & {
  __QmoneyThor2UnlockAudio?: () => void;
};

function AccessPanel({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="grid min-h-[60svh] place-items-center px-5">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111827] p-6 text-center shadow-2xl">
        <AlertCircle className="mx-auto h-8 w-8 text-[#E9C35C]" aria-hidden="true" />
        <p className="mt-3 text-sm font-bold leading-6 text-white/80">{message}</p>
        {action}
      </div>
    </div>
  );
}
