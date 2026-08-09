import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { getH5GameByCode, isImportedGameTestUsername, type H5GameCode } from '@bg/shared';
import { Sfx } from '@bg/game-engine';
import { useAuthStore } from '@/stores/authStore';
import { buildLoginPath } from '@/hooks/useRequireLogin';
import { PlatformBgm } from '@/lib/platformBgm';

const GAME_PATH = '/games/h5-slot-collection/index.html';
const ERROR_NOTICE_MS = 6_000;
const ROOM_MULTIPLIER_BY_GAME: Partial<Record<H5GameCode, string>> = {
  // These source games calculate the displayed stake from hard-coded legacy
  // denominations. Keep their first visible stake at or above the platform's
  // 10-point minimum so the displayed, submitted, and debited amounts agree.
  '232': '1',
  '244': '2',
  '278': '0.5',
};
const PORTRAIT_GAME_CODES = new Set<H5GameCode>([
  '264',
  '269',
  '271',
  '273',
  '276',
  '278',
  '281',
  '301',
  '302',
]);

export function H5SlotGamePage({ gameCode }: { gameCode: H5GameCode }) {
  const user = useAuthStore((state) => state.user);
  const setBalance = useAuthStore((state) => state.setBalance);
  const setTokens = useAuthStore((state) => state.setTokens);
  const selectedGame = getH5GameByCode(gameCode);
  const isPortraitGame = PORTRAIT_GAME_CODES.has(gameCode);
  const [error, setError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const syncOriginalGameAudio = () => {
    const frameWindow = iframeRef.current?.contentWindow as H5AudioBridgeWindow | null;
    frameWindow?.postMessage({ type: 'h5-slots:audio-sync' }, window.location.origin);
  };

  const unlockOriginalGameAudio = () => {
    const frameWindow = iframeRef.current?.contentWindow as H5AudioBridgeWindow | null;
    // Same-origin direct invocation keeps the browser's user-activation stack,
    // which is required by Safari and Chromium to resume the Cocos AudioContext.
    frameWindow?.__YachiyoUnlockAudio?.();
    frameWindow?.postMessage({ type: 'h5-slots:audio-unlock' }, window.location.origin);
  };

  const gameUrl = useMemo(() => {
    const configuredBase = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
    const apiBase = `${configuredBase || window.location.origin}/api`;
    const query = new URLSearchParams({
      apiBase,
      gameId: gameCode,
      roomId: '1',
      roomMul: ROOM_MULTIPLIER_BY_GAME[gameCode] ?? '0.2',
      room_id: '1',
      language: 'zh',
      uid: 'yachiyo',
      token: 'yachiyo-session',
      build: 'yachiyo-h5-slots-v2',
    });
    return `${GAME_PATH}?${query.toString()}`;
  }, [gameCode]);

  useEffect(() => {
    setError('');
  }, [gameCode]);

  useEffect(() => {
    const sync = () => syncOriginalGameAudio();
    const unsubscribeSfx = Sfx.subscribe(sync);
    const unsubscribeBgm = PlatformBgm.subscribe(sync);
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown'];
    events.forEach((eventName) =>
      window.addEventListener(eventName, unlockOriginalGameAudio, { passive: true }),
    );
    return () => {
      unsubscribeSfx();
      unsubscribeBgm();
      events.forEach((eventName) => window.removeEventListener(eventName, unlockOriginalGameAudio));
    };
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data) return;
      const payload = event.data as {
        type?: string;
        balance?: unknown;
        message?: unknown;
        accessToken?: unknown;
        refreshToken?: unknown;
      };
      if (payload.type === 'h5-slots:ready') {
        setError('');
      }
      if (payload.type === 'h5-slots:balance' || payload.type === 'h5-slots:ready') {
        const balance = Number(payload.balance);
        if (Number.isFinite(balance)) setBalance(balance.toFixed(2));
      }
      if (payload.type === 'h5-slots:error') {
        setError(String(payload.message || '遊戲連線失敗'));
      }
      if (
        payload.type === 'h5-slots:tokens' &&
        typeof payload.accessToken === 'string' &&
        typeof payload.refreshToken === 'string'
      ) {
        setTokens(payload.accessToken, payload.refreshToken);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [setBalance, setTokens]);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(''), ERROR_NOTICE_MS);
    return () => window.clearTimeout(timeout);
  }, [error]);

  if (!user) {
    return (
      <AccessPanel
        message="請先登入後再進入遊戲。"
        action={
          <Link
            to={buildLoginPath(`/games/${selectedGame.gameId}`, 'game')}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-[#EA580C] px-5 text-sm font-black text-white"
          >
            前往登入
          </Link>
        }
      />
    );
  }

  if (!isImportedGameTestUsername(user.username)) {
    return <AccessPanel message="此遊戲目前尚未開放。" />;
  }

  return (
    <div className="relative flex h-[calc(100svh-5.25rem)] min-h-[440px] flex-col overflow-hidden rounded-2xl border border-[#E8C96A]/30 bg-[#05070B] shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <iframe
          ref={iframeRef}
          key={gameCode}
          src={gameUrl}
          title={`${selectedGame.titleZh} · ${selectedGame.title}`}
          allow="autoplay; fullscreen"
          onLoad={syncOriginalGameAudio}
          className={
            isPortraitGame
              ? 'absolute left-1/2 top-0 h-full w-auto max-w-full -translate-x-1/2 border-0 bg-black aspect-[756/1334]'
              : 'absolute inset-0 h-full w-full border-0 bg-black'
          }
        />
        {error && (
          <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-red-300/30 bg-red-950/95 px-4 py-3 text-sm text-red-50 shadow-xl">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

type H5AudioBridgeWindow = Window & {
  __YachiyoUnlockAudio?: () => void;
};

function AccessPanel({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="grid min-h-[60svh] place-items-center px-5">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111827] p-6 text-center shadow-2xl">
        <AlertCircle className="mx-auto h-8 w-8 text-[#E8C96A]" aria-hidden="true" />
        <p className="mt-3 text-sm font-bold leading-6 text-white/80">{message}</p>
        {action}
      </div>
    </div>
  );
}
