import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Sfx } from '@bg/game-engine';
import { useAuthStore } from '@/stores/authStore';
import { buildLoginPath } from '@/hooks/useRequireLogin';
import { useTranslation } from '@/i18n/useTranslation';
import { PlatformBgm } from '@/lib/platformBgm';

const ORIGINAL_GAME_PATH = '/games/power-of-thor-2/original-runtime/index.html';

export function PowerOfThor2Page() {
  const { locale } = useTranslation();
  const isAuthenticated = useAuthStore((state) => Boolean(state.user));
  const setBalance = useAuthStore((state) => state.setBalance);
  const setTokens = useAuthStore((state) => state.setTokens);
  const [error, setError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const gameUrl = useMemo(() => {
    const configuredBase = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
    const apiBase = `${configuredBase || window.location.origin}/api`;
    const query = new URLSearchParams({
      // jsStart-cocos reads the first two values positionally. Keep this order.
      dir: 'PowerOfThor2',
      wspath: 'RewardableSlotUser',
      apiBase,
      lang: sourceLocale(locale),
      build: 'qmoney-thor2-original-cocos-v2-mobile-bootstrap',
    });
    return `${ORIGINAL_GAME_PATH}?${query.toString()}`;
  }, [locale]);

  const syncOriginalGameAudio = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'thor2:audio-sync' },
      window.location.origin,
    );
  }, []);

  const unlockOriginalGameAudio = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow as Thor2BridgeWindow | null;
    frameWindow?.__QmoneyThor2UnlockAudio?.();
    frameWindow?.postMessage({ type: 'thor2:audio-unlock' }, window.location.origin);
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
      if (payload.type === 'thor2:ready') setError('');
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
  }, [setBalance, setTokens]);

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
    <div className="relative h-[calc(100svh-5.25rem)] min-h-[420px] overflow-hidden rounded-2xl border border-[#E9C35C]/30 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
      <iframe
        ref={iframeRef}
        src={gameUrl}
        title="雷神之錘 II"
        allow="autoplay; fullscreen"
        onLoad={syncOriginalGameAudio}
        className="absolute inset-0 h-full w-full border-0 bg-black"
      />
      {error ? (
        <div className="absolute bottom-5 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-red-300/30 bg-red-950/95 px-4 py-3 text-sm text-red-50 shadow-xl">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}
    </div>
  );
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
