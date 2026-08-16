import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { buildLoginPath } from '@/hooks/useRequireLogin';

const GAME_PATH = '/games/fruit-mary/index.html';
const ERROR_NOTICE_MS = 6_000;

export function FruitMaryPage() {
  const user = useAuthStore((state) => state.user);
  const setBalance = useAuthStore((state) => state.setBalance);
  const setTokens = useAuthStore((state) => state.setTokens);
  const [error, setError] = useState('');
  const gameUrl = useMemo(() => {
    const configuredBase = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
    const apiBase = `${configuredBase || window.location.origin}/api`;
    const query = new URLSearchParams({
      apiBase,
      token: 'yachiyo-session',
      room_id: '1',
      window_type: 'web',
      build: 'yachiyo-fruit-mary-v1',
    });
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
      if (payload.type === 'fruit-mary:ready') {
        setError('');
      }
      if (payload.type === 'fruit-mary:balance' || payload.type === 'fruit-mary:ready') {
        const balance = Number(payload.balance);
        if (Number.isFinite(balance)) setBalance(balance.toFixed(2));
      }
      if (payload.type === 'fruit-mary:error') {
        setError(String(payload.message || '遊戲連線失敗'));
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
  }, [setBalance, setTokens]);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(''), ERROR_NOTICE_MS);
    return () => window.clearTimeout(timeout);
  }, [error]);

  if (!user) {
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
    <div className="relative h-[calc(100svh-5.25rem)] min-h-[420px] overflow-hidden rounded-2xl border border-[#FFB33A]/30 bg-[#2A0900] shadow-[0_20px_60px_rgba(42,9,0,0.5)]">
      <iframe
        src={gameUrl}
        title="歡樂水果機"
        allow="autoplay; fullscreen"
        className="absolute inset-y-0 left-1/2 h-full w-full max-w-[750px] -translate-x-1/2 border-0 bg-black"
      />
      {error && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-red-300/30 bg-red-950/95 px-4 py-3 text-sm text-red-50 shadow-xl">
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
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#2A140A] p-6 text-center shadow-2xl">
        <AlertCircle className="mx-auto h-8 w-8 text-[#FFB33A]" aria-hidden="true" />
        <p className="mt-3 text-sm font-bold leading-6 text-white/80">{message}</p>
        {action}
      </div>
    </div>
  );
}
