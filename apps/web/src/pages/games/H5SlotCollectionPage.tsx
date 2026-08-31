import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { getH5GameByCode, type H5GameCode } from '@bg/shared';
import { Sfx } from '@bg/game-engine';
import { useAuthStore } from '@/stores/authStore';
import { buildLoginPath } from '@/hooks/useRequireLogin';
import { useGameReturnTarget } from '@/hooks/useGameReturnTarget';
import { useTranslation } from '@/i18n/useTranslation';
import type { Locale } from '@/i18n/types';
import { PlatformBgm } from '@/lib/platformBgm';
import { isQmoneyRealm } from '@/lib/platformRealm';
import { returnFromGame } from '@/lib/gameReturnNavigation';
import { ensureGameLoadStarted, recordGameLoadMilestone } from '@/lib/gameLoadPerformance';

const GAME_PATH = '/games/h5-slot-collection/index.html';
const GAME_READY_TIMEOUT_MS = 50_000;
const IFRAME_RECOVERY_DELAY_MS = 100;
const ORIGINAL_LANGUAGE_BY_PLATFORM_LOCALE: Record<Locale, string> = {
  'zh-Hant': 'cht',
  'zh-Hans': 'zh',
  en: 'en',
  th: 'th',
  vi: 'vn',
};
const ROOM_MULTIPLIER_BY_GAME: Partial<Record<H5GameCode, string>> = {
  // These source games calculate the displayed stake from hard-coded legacy
  // denominations. Keep their first visible stake at or above the platform's
  // 10-point minimum so the displayed, submitted, and debited amounts agree.
  '232': '1',
  '244': '2',
  '278': '0.5',
};
export function H5SlotGamePage({ gameCode }: { gameCode: H5GameCode }) {
  const navigate = useNavigate();
  const returnTarget = useGameReturnTarget();
  const { locale } = useTranslation();
  // Balance messages arrive after every spin. Subscribe only to the boolean
  // needed by this shell so those updates do not re-render the iframe page.
  const isAuthenticated = useAuthStore((state) => Boolean(state.user));
  const setBalance = useAuthStore((state) => state.setBalance);
  const setTokens = useAuthStore((state) => state.setTokens);
  const selectedGame = getH5GameByCode(gameCode);
  const [error, setError] = useState('');
  const [iframeMounted, setIframeMounted] = useState(true);
  const [iframeGeneration, setIframeGeneration] = useState(0);
  const [recoveryReason, setRecoveryReason] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyTimerRef = useRef<number | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);
  const recoveryFrameRef = useRef<number | null>(null);
  const recoveryPendingRef = useRef(false);
  const automaticRecoveryAttemptsRef = useRef(0);

  const syncOriginalGameAudio = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow as H5AudioBridgeWindow | null;
    frameWindow?.postMessage({ type: 'h5-slots:audio-sync' }, window.location.origin);
  }, []);

  const unlockOriginalGameAudio = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow as H5AudioBridgeWindow | null;
    // Same-origin direct invocation keeps the browser's user-activation stack,
    // which is required by Safari and Chromium to resume the Cocos AudioContext.
    frameWindow?.__YachiyoUnlockAudio?.();
    frameWindow?.postMessage({ type: 'h5-slots:audio-unlock' }, window.location.origin);
  }, []);

  const clearReadyTimer = useCallback(() => {
    if (readyTimerRef.current === null) return;
    window.clearTimeout(readyTimerRef.current);
    readyTimerRef.current = null;
  }, []);

  const armReadyTimer = useCallback(() => {
    clearReadyTimer();
    readyTimerRef.current = window.setTimeout(() => {
      readyTimerRef.current = null;
      setError('遊戲畫面載入逾時，請重新建立畫面。');
    }, GAME_READY_TIMEOUT_MS);
  }, [clearReadyTimer]);

  const releaseIframe = useCallback((frame: HTMLIFrameElement | null) => {
    if (!frame) return;
    const frameWindow = frame.contentWindow as H5AudioBridgeWindow | null;
    if (frameWindow?.__YachiyoDisposeH5Game) {
      frameWindow.__YachiyoDisposeH5Game();
      return;
    }
    frameWindow?.postMessage({ type: 'h5-slots:dispose' }, window.location.origin);
  }, []);

  const requestIframeRecovery = useCallback(
    (reason: string, force = false) => {
      if (recoveryPendingRef.current) return;
      if (!force && automaticRecoveryAttemptsRef.current >= 1) {
        setError(reason || '遊戲畫面已中斷，請點擊重新載入。');
        return;
      }
      if (force) automaticRecoveryAttemptsRef.current = 0;
      automaticRecoveryAttemptsRef.current += 1;
      recoveryPendingRef.current = true;
      clearReadyTimer();
      setError('');
      setRecoveryReason(reason || '正在重新建立遊戲畫面…');
      releaseIframe(iframeRef.current);
      setIframeMounted(false);
      setIframeGeneration((generation) => generation + 1);
      recoveryFrameRef.current = window.requestAnimationFrame(() => {
        recoveryFrameRef.current = window.requestAnimationFrame(() => {
          recoveryFrameRef.current = null;
          recoveryTimerRef.current = window.setTimeout(() => {
            recoveryTimerRef.current = null;
            recoveryPendingRef.current = false;
            setIframeMounted(true);
            armReadyTimer();
          }, IFRAME_RECOVERY_DELAY_MS);
        });
      });
    },
    [armReadyTimer, clearReadyTimer, releaseIframe],
  );

  const handleIframeLoad = useCallback(() => {
    recordGameLoadMilestone(selectedGame.gameId, 'iframe-loaded');
    syncOriginalGameAudio();
    armReadyTimer();
  }, [armReadyTimer, selectedGame.gameId, syncOriginalGameAudio]);

  const gameUrl = useMemo(() => {
    const configuredBase = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
    const apiBase = `${configuredBase || window.location.origin}/api`;
    const query = new URLSearchParams({
      apiBase,
      gameId: gameCode,
      scene: selectedGame.scene,
      roomId: '1',
      roomMul: ROOM_MULTIPLIER_BY_GAME[gameCode] ?? '0.2',
      room_id: '1',
      language: ORIGINAL_LANGUAGE_BY_PLATFORM_LOCALE[locale],
      uid: isQmoneyRealm ? 'qmoney' : 'yachiyo',
      token: isQmoneyRealm ? 'qmoney-session' : 'yachiyo-session',
      build: isQmoneyRealm
        ? 'qmoney-h5-slots-v4-visual-recovery'
        : 'yachiyo-h5-slots-v4-visual-recovery',
    });
    return `${GAME_PATH}?${query.toString()}`;
  }, [gameCode, locale, selectedGame.scene]);

  useEffect(() => {
    ensureGameLoadStarted(selectedGame.gameId);
  }, [selectedGame.gameId]);

  useEffect(() => {
    setError('');
    setRecoveryReason('');
    setIframeMounted(true);
    automaticRecoveryAttemptsRef.current = 0;
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
  }, [syncOriginalGameAudio, unlockOriginalGameAudio]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data as {
        type?: string;
        balance?: unknown;
        message?: unknown;
        stage?: unknown;
        healthy?: unknown;
        accessToken?: unknown;
        refreshToken?: unknown;
        data?: {
          name?: unknown;
          arg?: { action?: unknown };
        };
      };
      const requestedClose =
        payload.type === 'h5-slots:close' ||
        (payload.type === 'WEB_INVOKE_APPSERVICE' &&
          payload.data?.name === 'postMessage' &&
          payload.data.arg?.action === 'close');
      if (requestedClose) {
        returnFromGame(navigate, returnTarget.to);
        return;
      }
      if (payload.type === 'h5-slots:ready') {
        recordGameLoadMilestone(selectedGame.gameId, 'session-ready');
        clearReadyTimer();
        setRecoveryReason('');
        setError('');
      }
      if (payload.type === 'h5-slots:visual-ready') {
        recordGameLoadMilestone(selectedGame.gameId, 'visual-ready');
      }
      if (payload.type === 'h5-slots:balance' || payload.type === 'h5-slots:ready') {
        const balance = Number(payload.balance);
        if (Number.isFinite(balance)) setBalance(balance.toFixed(2));
      }
      if (payload.type === 'h5-slots:error') {
        clearReadyTimer();
        setError(String(payload.message || '遊戲連線失敗'));
      }
      if (payload.type === 'h5-slots:fatal') {
        const message = String(payload.message || '遊戲畫面已中斷');
        requestIframeRecovery(message);
      }
      if (payload.type === 'h5-slots:health' && payload.healthy === false) {
        requestIframeRecovery('遊戲畫面已中斷，正在重新建立畫面');
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
  }, [
    clearReadyTimer,
    navigate,
    requestIframeRecovery,
    returnTarget.to,
    selectedGame.gameId,
    setBalance,
    setTokens,
  ]);

  useEffect(() => {
    const checkFrameHealth = () => {
      if (document.visibilityState !== 'visible') return;
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'h5-slots:health-check' },
        window.location.origin,
      );
    };
    document.addEventListener('visibilitychange', checkFrameHealth);
    window.addEventListener('pageshow', checkFrameHealth);
    const healthTimer = window.setInterval(checkFrameHealth, 5_000);
    return () => {
      window.clearInterval(healthTimer);
      document.removeEventListener('visibilitychange', checkFrameHealth);
      window.removeEventListener('pageshow', checkFrameHealth);
    };
  }, []);

  useEffect(() => {
    const mountedFrame = iframeRef.current;
    return () => {
      releaseIframe(mountedFrame);
    };
  }, [gameCode, iframeGeneration, iframeMounted, releaseIframe]);

  useEffect(
    () => () => {
      clearReadyTimer();
      if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
      if (recoveryFrameRef.current !== null) window.cancelAnimationFrame(recoveryFrameRef.current);
    },
    [clearReadyTimer],
  );

  if (!isAuthenticated) {
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

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#E8C96A]/30 bg-[#05070B] shadow-[0_20px_60px_rgba(0,0,0,0.55)] md:h-[calc(100svh-5.25rem)]">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {iframeMounted ? (
          <iframe
            ref={iframeRef}
            key={`${gameCode}-${iframeGeneration}`}
            src={gameUrl}
            title={`${selectedGame.titleZh} · ${selectedGame.title}`}
            allow="autoplay; fullscreen"
            onLoad={handleIframeLoad}
            className="absolute inset-0 h-full w-full border-0 bg-black"
          />
        ) : (
          <div
            className="absolute inset-0 grid place-items-center bg-black px-6 text-center text-sm font-bold text-white/75"
            role="status"
            aria-live="polite"
          >
            {recoveryReason || '正在重新建立遊戲畫面…'}
          </div>
        )}
        {error && (
          <div className="absolute bottom-5 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-red-300/30 bg-red-950/95 px-4 py-3 text-sm text-red-50 shadow-xl">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={() => requestIframeRecovery('正在重新載入完整遊戲畫面…', true)}
              className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-black text-white"
            >
              重新載入
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type H5AudioBridgeWindow = Window & {
  __YachiyoUnlockAudio?: () => void;
  __YachiyoDisposeH5Game?: () => boolean;
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
