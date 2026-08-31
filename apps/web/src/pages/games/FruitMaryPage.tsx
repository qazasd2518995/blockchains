import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { buildLoginPath } from '@/hooks/useRequireLogin';
import { isQmoneyRealm } from '@/lib/platformRealm';
import { ensureGameLoadStarted, recordGameLoadMilestone } from '@/lib/gameLoadPerformance';

const GAME_PATH = '/games/fruit-mary/index.html';
const GAME_READY_TIMEOUT_MS = 45_000;
const IFRAME_RECOVERY_DELAY_MS = 100;
const RECOVERY_STABILITY_WINDOW_MS = 60_000;

export function FruitMaryPage() {
  // The iframe reports balance frequently while playing; auth presence is the
  // only user state this wrapper needs, so balance changes should not re-render it.
  const isAuthenticated = useAuthStore((state) => Boolean(state.user));
  const setBalance = useAuthStore((state) => state.setBalance);
  const setTokens = useAuthStore((state) => state.setTokens);
  const [error, setError] = useState('');
  const [iframeMounted, setIframeMounted] = useState(true);
  const [iframeGeneration, setIframeGeneration] = useState(0);
  const [recoveryReason, setRecoveryReason] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyTimerRef = useRef<number | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);
  const recoveryFrameRef = useRef<number | null>(null);
  const recoveryStabilityTimerRef = useRef<number | null>(null);
  const recoveryPendingRef = useRef(false);
  const automaticRecoveryAttemptsRef = useRef(0);

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

  const clearRecoveryStabilityTimer = useCallback(() => {
    if (recoveryStabilityTimerRef.current === null) return;
    window.clearTimeout(recoveryStabilityTimerRef.current);
    recoveryStabilityTimerRef.current = null;
  }, []);

  const armRecoveryStabilityTimer = useCallback(() => {
    clearRecoveryStabilityTimer();
    recoveryStabilityTimerRef.current = window.setTimeout(() => {
      recoveryStabilityTimerRef.current = null;
      automaticRecoveryAttemptsRef.current = 0;
    }, RECOVERY_STABILITY_WINDOW_MS);
  }, [clearRecoveryStabilityTimer]);

  const releaseIframe = useCallback((frame: HTMLIFrameElement | null) => {
    if (!frame) return;
    const frameWindow = frame.contentWindow as FruitMaryBridgeWindow | null;
    if (frameWindow?.__YachiyoDisposeFruitMaryGame) {
      frameWindow.__YachiyoDisposeFruitMaryGame();
      return;
    }
    frameWindow?.postMessage({ type: 'fruit-mary:dispose' }, window.location.origin);
  }, []);

  const requestIframeRecovery = useCallback(
    (reason: string, force = false) => {
      if (recoveryPendingRef.current) return;
      if (!force && automaticRecoveryAttemptsRef.current >= 1) {
        clearRecoveryStabilityTimer();
        setError(reason || '遊戲畫面已中斷，請點擊重新載入。');
        return;
      }
      clearRecoveryStabilityTimer();
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
    [armReadyTimer, clearReadyTimer, clearRecoveryStabilityTimer, releaseIframe],
  );

  const handleIframeLoad = useCallback(() => {
    recordGameLoadMilestone('fruit-mary', 'iframe-loaded');
    armReadyTimer();
  }, [armReadyTimer]);

  const gameUrl = useMemo(() => {
    const configuredBase = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
    const apiBase = `${configuredBase || window.location.origin}/api`;
    const query = new URLSearchParams({
      apiBase,
      token: isQmoneyRealm ? 'qmoney-session' : 'yachiyo-session',
      room_id: '1',
      window_type: 'web',
      build: isQmoneyRealm
        ? 'qmoney-fruit-mary-v4-stable-health'
        : 'yachiyo-fruit-mary-v4-stable-health',
    });
    return `${GAME_PATH}?${query.toString()}`;
  }, []);

  useEffect(() => {
    ensureGameLoadStarted('fruit-mary');
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data as {
        type?: string;
        balance?: unknown;
        message?: unknown;
        healthy?: unknown;
        accessToken?: unknown;
        refreshToken?: unknown;
      };
      if (payload.type === 'fruit-mary:ready') {
        recordGameLoadMilestone('fruit-mary', 'session-ready');
        clearReadyTimer();
        if (automaticRecoveryAttemptsRef.current > 0) armRecoveryStabilityTimer();
        setRecoveryReason('');
        setError('');
      }
      if (payload.type === 'fruit-mary:visual-ready') {
        recordGameLoadMilestone('fruit-mary', 'visual-ready');
      }
      if (payload.type === 'fruit-mary:balance' || payload.type === 'fruit-mary:ready') {
        const balance = Number(payload.balance);
        if (Number.isFinite(balance)) setBalance(balance.toFixed(2));
      }
      if (payload.type === 'fruit-mary:error') {
        setError(String(payload.message || '遊戲連線失敗'));
      }
      if (payload.type === 'fruit-mary:fatal') {
        requestIframeRecovery(String(payload.message || '遊戲畫面已中斷'));
      }
      if (payload.type === 'fruit-mary:health' && payload.healthy === false) {
        requestIframeRecovery('遊戲畫面已中斷，正在重新建立畫面');
      }
      if (
        payload.type === 'fruit-mary:tokens' &&
        typeof payload.accessToken === 'string' &&
        typeof payload.refreshToken === 'string'
      ) {
        setTokens(payload.accessToken, payload.refreshToken);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [armRecoveryStabilityTimer, clearReadyTimer, requestIframeRecovery, setBalance, setTokens]);

  useEffect(() => {
    const checkFrameHealth = () => {
      if (document.visibilityState !== 'visible') return;
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'fruit-mary:health-check' },
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
    return () => releaseIframe(mountedFrame);
  }, [iframeGeneration, iframeMounted, releaseIframe]);

  useEffect(
    () => () => {
      clearReadyTimer();
      clearRecoveryStabilityTimer();
      if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
      if (recoveryFrameRef.current !== null) window.cancelAnimationFrame(recoveryFrameRef.current);
    },
    [clearReadyTimer, clearRecoveryStabilityTimer],
  );

  if (!isAuthenticated) {
    return (
      <AccessPanel
        message="請先登入後即可進入遊戲。"
        action={
          <Link
            to={buildLoginPath('/games/fruit-mary', 'game')}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-[#EA580C] px-5 text-sm font-black text-white"
          >
            前往登入
          </Link>
        }
      />
    );
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-[#FFB33A]/30 bg-[#2A0900] shadow-[0_20px_60px_rgba(42,9,0,0.5)] md:h-[calc(100svh-5.25rem)]">
      {iframeMounted ? (
        <iframe
          ref={iframeRef}
          key={iframeGeneration}
          src={gameUrl}
          title="歡樂水果機"
          allow="autoplay; fullscreen"
          onLoad={handleIframeLoad}
          className="absolute inset-y-0 left-1/2 h-full w-full max-w-[750px] -translate-x-1/2 border-0 bg-black"
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
  );
}

type FruitMaryBridgeWindow = Window & {
  __YachiyoDisposeFruitMaryGame?: () => boolean;
};

function AccessPanel({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="grid min-h-[60svh] place-items-center px-5">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#2A140A] p-6 text-center shadow-2xl">
        <AlertCircle className="mx-auto h-8 w-8 text-[#FFB33A]" aria-hidden="true" />
        <p className="mt-3 text-sm font-bold leading-6 text-white/80">{message}</p>
        {action}
      </div>
    </div>
  );
}
