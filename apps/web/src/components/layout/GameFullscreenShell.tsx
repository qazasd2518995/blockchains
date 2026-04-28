import { useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft, History, RefreshCw, WalletCards } from 'lucide-react';
import { GAMES_REGISTRY, type GameIdType } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { SoundToggle } from '@/components/layout/SoundToggle';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { useGameReturnTarget } from '@/hooks/useGameReturnTarget';

const GAME_NAME_ZH: Record<string, string> = {
  baccarat: '皇家百家',
  'baccarat-nova': '星耀百家',
  'baccarat-imperial': '御龍百家',
  dice: '骰子',
  mines: '踩地雷',
  hilo: '猜大小',
  keno: '基諾',
  wheel: '彩色轉輪',
  'mini-roulette': '迷你輪盤',
  plinko: '彈珠台',
  hotline: '熱線',
  'fruit-slot': '水果拉霸',
  'fortune-slot': '財虎拉霸',
  'ocean-slot': '海神寶藏',
  'temple-slot': '聖殿寶石',
  'candy-slot': '糖果派對',
  'sakura-slot': '夜櫻武士',
  tower: '疊塔',
  rocket: '火箭',
  aviator: '飛行員',
  'space-fleet': '太空艦隊',
  jetx: '飆速X',
  balloon: '氣球',
  jetx3: '飆速X3',
  'double-x': '雙倍X',
  'plinko-x': '掉珠挑戰X',
  carnival: '狂歡節',
};

function useCurrentGameMeta() {
  const location = useLocation();
  return useMemo(() => {
    const gameId = location.pathname.replace(/^\/games\//, '').split('/')[0] ?? '';
    const game = GAMES_REGISTRY[gameId as GameIdType];
    return {
      id: gameId,
      title: GAME_NAME_ZH[gameId] ?? game?.nameZh ?? '遊戲',
      subtitle: game?.name ?? gameId.toUpperCase(),
    };
  }, [location.pathname]);
}

export function GameFullscreenShell() {
  const { user, setBalance } = useAuthStore();
  const game = useCurrentGameMeta();
  const returnTarget = useGameReturnTarget();

  const handleBalanceRefresh = async () => {
    try {
      const res = await api.get<{ balance: string }>('/wallet/balance');
      setBalance(res.data.balance);
    } catch (err) {
      console.error(extractApiError(err));
    }
  };

  return (
    <div className="game-fullscreen-shell relative min-h-[100svh] overflow-x-hidden bg-[#050A13] text-white">
      <div className="pointer-events-none fixed inset-0">
        <img
          src="/backgrounds/casino-atmosphere.png"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover opacity-[0.18]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,19,0.92)_0%,rgba(5,10,19,0.97)_58%,rgba(5,10,19,1)_100%)]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07101C]/92 pt-[env(safe-area-inset-top)] shadow-[0_14px_36px_rgba(0,0,0,0.34)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1920px] items-center gap-2 px-2 sm:px-4 xl:px-5">
          <Link
            to={returnTarget.to}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/82 transition hover:border-white/24 hover:bg-white/[0.1] hover:text-white"
            aria-label={`返回${returnTarget.label}`}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-black leading-tight text-white sm:text-[16px]">
              {game.title}
            </div>
            <div className="truncate text-[10px] font-bold uppercase tracking-[0.22em] text-white/42">
              {game.subtitle}
            </div>
          </div>

          <button
            type="button"
            onClick={handleBalanceRefresh}
            className="hidden h-10 shrink-0 items-center gap-2 rounded-full border border-[#C9A247]/35 bg-[#101B2D] px-3 text-[12px] font-bold text-[#E8D48A] transition hover:border-[#C9A247]/65 hover:bg-[#162338] sm:inline-flex"
            title="重新載入餘額"
          >
            <WalletCards className="h-4 w-4" aria-hidden="true" />
            <span className="data-num">{formatAmount(user?.balance ?? '0')}</span>
          </button>

          <Link
            to="/history"
            className="hidden h-10 shrink-0 items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 text-[12px] font-semibold text-white/72 transition hover:border-white/24 hover:bg-white/[0.1] hover:text-white md:inline-flex"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            記錄
          </Link>

          <SoundToggle variant="dark" />

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/72 transition hover:border-white/24 hover:bg-white/[0.1] hover:text-white"
            aria-label="重新載入遊戲"
            title="重新載入遊戲"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1920px] px-0 py-2 sm:px-4 sm:py-3 xl:px-5">
        <Outlet />
      </main>
    </div>
  );
}
