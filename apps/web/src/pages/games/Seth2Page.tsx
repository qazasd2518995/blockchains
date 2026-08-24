import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Sfx } from '@bg/game-engine';
import { useAuthStore } from '@/stores/authStore';
import { buildLoginPath } from '@/hooks/useRequireLogin';
import { useTranslation } from '@/i18n/useTranslation';
import { PlatformBgm } from '@/lib/platformBgm';
import { isQmoneyRealm } from '@/lib/platformRealm';

const GAME_PATH = '/games/storm-of-seth-2-v115/index.html';

export function Seth2Page() {
  const { locale } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const setBalance = useAuthStore((state) => state.setBalance);
  const setTokens = useAuthStore((state) => state.setTokens);
  const [error, setError] = useState('');
  const initialViewMode = useRef<'portrait' | 'landscape'>(
    readSavedViewMode() ??
      (window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'),
  ).current;
  const [viewMode, setViewMode] = useState<'portrait' | 'landscape'>(initialViewMode);
  const [iframeMounted, setIframeMounted] = useState(true);
  const [iframeGeneration, setIframeGeneration] = useState(0);
  const [remountReason, setRemountReason] = useState<'orientation' | 'table' | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const currentViewModeRef = useRef(viewMode);
  const pendingRemountRef = useRef<{
    viewMode: 'portrait' | 'landscape';
    reason: 'orientation' | 'table';
  } | null>(null);
  const disposeFallbackTimerRef = useRef<number | null>(null);
  const remountTimerRef = useRef<number | null>(null);
  const remountFrameRef = useRef<number | null>(null);
  const syncOriginalGameAudio = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'seth2:audio-sync' },
      window.location.origin,
    );
  }, []);
  const handleIframeLoad = useCallback(() => {
    syncOriginalGameAudio();
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'seth2:shell-capabilities', tableChangeRemount: true },
      window.location.origin,
    );
  }, [syncOriginalGameAudio]);
  const unlockOriginalGameAudio = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow as Seth2AudioBridgeWindow | null;
    frameWindow?.__YachiyoSeth2UnlockAudio?.();
    frameWindow?.postMessage({ type: 'seth2:audio-unlock' }, window.location.origin);
  }, []);
  const finishIframeRemount = useCallback((nextViewMode: 'portrait' | 'landscape') => {
    if (disposeFallbackTimerRef.current !== null) {
      window.clearTimeout(disposeFallbackTimerRef.current);
      disposeFallbackTimerRef.current = null;
    }
    pendingRemountRef.current = null;
    currentViewModeRef.current = nextViewMode;
    saveViewMode(nextViewMode);
    // First remove the old WebGL iframe. Mount the new Cocos scene only after
    // WebKit has painted without it, giving the old GPU context a cleanup turn.
    setIframeMounted(false);
    setViewMode(nextViewMode);
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
    (nextViewMode: 'portrait' | 'landscape', reason: 'orientation' | 'table') => {
      if (pendingRemountRef.current !== null) return;
      pendingRemountRef.current = { viewMode: nextViewMode, reason };
      setError('');
      setRemountReason(reason);
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'seth2:dispose' },
        window.location.origin,
      );
      // Older cached adapters do not acknowledge disposal. The fallback still
      // removes that iframe, but current adapters release WebGL first.
      disposeFallbackTimerRef.current = window.setTimeout(
        () => finishIframeRemount(nextViewMode),
        350,
      );
    },
    [finishIframeRemount],
  );
  const requestViewModeSwitch = useCallback(
    (nextViewMode: 'portrait' | 'landscape') => {
      if (nextViewMode === currentViewModeRef.current) return;
      requestIframeRemount(nextViewMode, 'orientation');
    },
    [requestIframeRemount],
  );
  const requestTableChangeRemount = useCallback(() => {
    requestIframeRemount(currentViewModeRef.current, 'table');
  }, [requestIframeRemount]);
  const gameUrl = useMemo(() => {
    const configuredBase = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
    const apiBase = `${configuredBase || window.location.origin}/api`;
    const query = new URLSearchParams({
      apiBase,
      t: isQmoneyRealm ? 'qmoney-local' : 'yachiyo-local',
      gn: 'golden-seth',
      l: sourceLocale(locale),
      ct: 'slot',
      gt: 'slot-erase-any-times-2',
      socket_url: 'seth2-local',
      view_mode: viewMode,
      client_type: 'web',
      gv: '260609',
      build: isQmoneyRealm
        ? 'qmoney-seth2-v115-table-remount-1'
        : 'yachiyo-seth2-v115-table-remount-1',
    });
    return `${GAME_PATH}?${query.toString()}`;
  }, [locale, viewMode]);

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
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data as {
        type?: string;
        balance?: unknown;
        message?: unknown;
        accessToken?: unknown;
        refreshToken?: unknown;
        viewMode?: unknown;
      };
      if (
        payload.type === 'seth2:view-mode-request' &&
        (payload.viewMode === 'portrait' || payload.viewMode === 'landscape')
      ) {
        requestViewModeSwitch(payload.viewMode);
      }
      if (payload.type === 'seth2:table-change-request') {
        requestTableChangeRemount();
      }
      if (payload.type === 'seth2:disposed' && pendingRemountRef.current) {
        finishIframeRemount(pendingRemountRef.current.viewMode);
      }
      if (payload.type === 'seth2:ready') {
        setError('');
        syncOriginalGameAudio();
      }
      if (payload.type === 'seth2:balance' || payload.type === 'seth2:ready') {
        const balance = Number(payload.balance);
        if (Number.isFinite(balance)) setBalance(balance.toFixed(2));
      }
      if (payload.type === 'seth2:error') {
        setError(String(payload.message || '遊戲連線失敗'));
      }
      if (
        payload.type === 'seth2:tokens' &&
        typeof payload.accessToken === 'string' &&
        typeof payload.refreshToken === 'string'
      ) {
        setTokens(payload.accessToken, payload.refreshToken);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [
    finishIframeRemount,
    requestTableChangeRemount,
    requestViewModeSwitch,
    setBalance,
    setTokens,
    syncOriginalGameAudio,
  ]);

  useEffect(
    () => () => {
      if (disposeFallbackTimerRef.current !== null) {
        window.clearTimeout(disposeFallbackTimerRef.current);
      }
      if (remountTimerRef.current !== null) window.clearTimeout(remountTimerRef.current);
      if (remountFrameRef.current !== null) window.cancelAnimationFrame(remountFrameRef.current);
    },
    [],
  );

  if (!user) {
    return (
      <AccessPanel
        message="請先登入後即可進入遊戲。"
        action={
          <Link
            to={buildLoginPath('/games/storm-of-seth-2', 'game')}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-[#EA580C] px-5 text-sm font-black text-white"
          >
            前往登入
          </Link>
        }
      />
    );
  }

  return (
    <div className="relative h-[calc(100svh-5.25rem)] min-h-[420px] overflow-hidden rounded-2xl border border-[#E8D48A]/25 bg-[#08040F] shadow-[0_20px_60px_rgba(8,4,15,0.48)]">
      {iframeMounted ? (
        <iframe
          key={`${viewMode}-${iframeGeneration}`}
          ref={iframeRef}
          src={gameUrl}
          title="戰神賽特 II：覺醒之力"
          allow="autoplay; fullscreen"
          onLoad={handleIframeLoad}
          className="absolute inset-0 h-full w-full border-0 bg-black"
        />
      ) : (
        <div
          className="absolute inset-0 grid place-items-center bg-black text-sm font-bold text-white/75"
          role="status"
          aria-live="polite"
        >
          {remountReason === 'table' ? '正在切換機台…' : '正在切換遊戲方向…'}
        </div>
      )}
      {remountReason ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 text-center text-xs font-bold text-white/65">
          正在重新建立完整畫質遊戲畫面…
        </div>
      ) : null}
      {error && (
        <div className="absolute bottom-5 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-red-300/30 bg-red-950/95 px-4 py-3 text-sm text-red-50 shadow-xl">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
    </div>
  );
}

function readSavedViewMode(): 'portrait' | 'landscape' | null {
  try {
    const value = window.localStorage.getItem('golden-seth_view_mode');
    return value === 'portrait' || value === 'landscape' ? value : null;
  } catch {
    return null;
  }
}

function saveViewMode(viewMode: 'portrait' | 'landscape') {
  try {
    window.localStorage.setItem('golden-seth_view_mode', viewMode);
  } catch {
    // The iframe query remains authoritative when storage is unavailable.
  }
}

function sourceLocale(locale: string): string {
  if (locale === 'zh-Hans') return 'zh-cn';
  if (locale === 'zh-Hant') return 'zh-tw';
  if (locale === 'th') return 'th';
  if (locale === 'vi') return 'vn';
  return 'en';
}

type Seth2AudioBridgeWindow = Window & {
  __YachiyoSeth2UnlockAudio?: () => void;
};

function AccessPanel({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="grid min-h-[60svh] place-items-center px-5">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101B2D] p-6 text-center shadow-2xl">
        <AlertCircle className="mx-auto h-8 w-8 text-[#E8D48A]" aria-hidden="true" />
        <p className="mt-3 text-sm font-bold leading-6 text-white/80">{message}</p>
        {action}
      </div>
    </div>
  );
}
