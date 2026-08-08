import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { getH5GameByCode, isImportedGameTestUsername, type H5GameCode } from '@bg/shared';
import { useAuthStore } from '@/stores/authStore';
import { buildLoginPath } from '@/hooks/useRequireLogin';

const GAME_PATH = '/games/h5-slot-collection/index.html';
const ERROR_NOTICE_MS = 6_000;
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
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const gameUrl = useMemo(() => {
    const configuredBase = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
    const apiBase = `${configuredBase || window.location.origin}/api`;
    const query = new URLSearchParams({
      apiBase,
      gameId: gameCode,
      roomId: '1',
      roomMul: '0.2',
      room_id: '1',
      language: 'zh',
      uid: 'yachiyo',
      token: 'yachiyo-session',
      build: 'yachiyo-h5-slots-v1',
    });
    return `${GAME_PATH}?${query.toString()}`;
  }, [gameCode]);

  useEffect(() => {
    setReady(false);
    setError('');
  }, [gameCode]);

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
        setReady(true);
        setError('');
      }
      if (payload.type === 'h5-slots:balance' || payload.type === 'h5-slots:ready') {
        const balance = Number(payload.balance);
        if (Number.isFinite(balance)) setBalance(balance.toFixed(2));
      }
      if (payload.type === 'h5-slots:error') {
        setReady(true);
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
        message="登入指定測試帳號後即可進入遊戲。"
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
    return <AccessPanel message={`${selectedGame.titleZh}目前僅對指定測試帳號開放。`} />;
  }

  return (
    <div className="relative flex h-[calc(100svh-5.25rem)] min-h-[440px] flex-col overflow-hidden rounded-2xl border border-[#E8C96A]/30 bg-[#05070B] shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
      <div className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#111827]/95 px-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-[#E8C96A]">
            原版 Cocos 遊戲 · 八千代正式結算
          </div>
          <div className="truncate text-sm font-black text-white">{selectedGame.titleZh}</div>
        </div>
        <div className="shrink-0 rounded-lg border border-[#E8C96A]/30 bg-[#1F2937] px-3 py-1.5 text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[#E8C96A]">
            正式遊玩
          </div>
          <div className="text-[11px] font-bold text-white/80">{selectedGame.title}</div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <iframe
          key={gameCode}
          src={gameUrl}
          title={`${selectedGame.titleZh} · ${selectedGame.title}`}
          allow="autoplay; fullscreen"
          className={
            isPortraitGame
              ? 'absolute left-1/2 top-0 h-full w-auto max-w-full -translate-x-1/2 border-0 bg-black aspect-[756/1334]'
              : 'absolute inset-0 h-full w-full border-0 bg-black'
          }
        />
        {!ready && !error && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-t from-black via-black/70 to-transparent pb-6 pt-16 text-xs font-bold text-[#F6E7A8]">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            正在驗證測試帳號並載入 {selectedGame.titleZh}…
          </div>
        )}
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
