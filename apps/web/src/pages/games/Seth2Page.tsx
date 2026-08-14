import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Sfx } from '@bg/game-engine';
import { useAuthStore } from '@/stores/authStore';
import { buildLoginPath } from '@/hooks/useRequireLogin';
import { useTranslation } from '@/i18n/useTranslation';
import { PlatformBgm } from '@/lib/platformBgm';

const GAME_PATH = '/games/storm-of-seth-2-v115/index.html';

export function Seth2Page() {
  const { locale } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const setBalance = useAuthStore((state) => state.setBalance);
  const setTokens = useAuthStore((state) => state.setTokens);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'portrait' | 'landscape'>(() =>
    window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape',
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const syncOriginalGameAudio = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'seth2:audio-sync' },
      window.location.origin,
    );
  }, []);
  const unlockOriginalGameAudio = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow as Seth2AudioBridgeWindow | null;
    frameWindow?.__YachiyoSeth2UnlockAudio?.();
    frameWindow?.postMessage({ type: 'seth2:audio-unlock' }, window.location.origin);
  }, []);
  const gameUrl = useMemo(() => {
    const configuredBase = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
    const apiBase = `${configuredBase || window.location.origin}/api`;
    const query = new URLSearchParams({
      apiBase,
      t: 'yachiyo-local',
      gn: 'golden-seth',
      l: sourceLocale(locale),
      ct: 'slot',
      gt: 'slot-erase-any-times-2',
      socket_url: 'seth2-local',
      view_mode: viewMode,
      client_type: 'web',
      gv: '260609',
      build: 'yachiyo-seth2-v115',
    });
    return `${GAME_PATH}?${query.toString()}`;
  }, [locale, viewMode]);

  useEffect(() => {
    const query = window.matchMedia('(orientation: portrait)');
    const onChange = (event: MediaQueryListEvent) => {
      setViewMode(event.matches ? 'portrait' : 'landscape');
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

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
      };
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
  }, [setBalance, setTokens, syncOriginalGameAudio]);

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
      <iframe
        ref={iframeRef}
        src={gameUrl}
        title="黃金賽特 II：覺醒之力"
        allow="autoplay; fullscreen"
        onLoad={syncOriginalGameAudio}
        className="absolute inset-0 h-full w-full border-0 bg-black"
      />
      {error && (
        <div className="absolute bottom-5 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-red-300/30 bg-red-950/95 px-4 py-3 text-sm text-red-50 shadow-xl">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
    </div>
  );
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
