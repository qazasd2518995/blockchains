import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { isSeth2TestUsername } from '@bg/shared';
import { useAuthStore } from '@/stores/authStore';
import { buildLoginPath } from '@/hooks/useRequireLogin';

const GAME_PATH = '/games/storm-of-seth-2/index.html';

export function Seth2Page() {
  const user = useAuthStore((state) => state.user);
  const setBalance = useAuthStore((state) => state.setBalance);
  const setTokens = useAuthStore((state) => state.setTokens);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const gameUrl = useMemo(() => {
    const configuredBase = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
    const apiBase = `${configuredBase || window.location.origin}/api`;
    const query = new URLSearchParams({ apiBase, build: 'yachiyo-seth2-v2' });
    return `${GAME_PATH}?${query.toString()}`;
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
      if (payload.type === 'seth2:ready') {
        setReady(true);
        setError('');
      }
      if (payload.type === 'seth2:balance' || payload.type === 'seth2:ready') {
        const balance = Number(payload.balance);
        if (Number.isFinite(balance)) setBalance(balance.toFixed(2));
      }
      if (payload.type === 'seth2:error') {
        setReady(true);
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
  }, [setBalance, setTokens]);

  if (!user) {
    return (
      <AccessPanel
        message="登入指定測試帳號後即可進入遊戲。"
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

  if (!isSeth2TestUsername(user.username)) {
    return <AccessPanel message="黃金賽特 II 目前僅對指定測試帳號開放。" />;
  }

  return (
    <div className="relative h-[calc(100svh-5.25rem)] min-h-[420px] overflow-hidden rounded-2xl border border-[#E8D48A]/25 bg-[#08040F] shadow-[0_20px_60px_rgba(8,4,15,0.48)]">
      <iframe
        src={gameUrl}
        title="黃金賽特 II：覺醒之力"
        allow="autoplay; fullscreen"
        className="absolute inset-0 h-full w-full border-0 bg-black"
      />
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-t from-[#10091D] via-[#10091D]/75 to-transparent pb-6 pt-16 text-xs font-bold text-[#E8D48A]">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          正在驗證測試帳號並載入遊戲…
        </div>
      )}
      {error && (
        <div className="absolute bottom-5 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-red-300/30 bg-red-950/95 px-4 py-3 text-sm text-red-50 shadow-xl">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
    </div>
  );
}

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
