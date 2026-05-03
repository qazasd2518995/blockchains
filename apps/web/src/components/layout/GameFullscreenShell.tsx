import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft, History, Maximize2, RefreshCw, Smartphone, WalletCards, X } from 'lucide-react';
import { GAMES_REGISTRY, type GameIdType } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { SoundToggle } from '@/components/layout/SoundToggle';
import { MusicToggle } from '@/components/layout/MusicToggle';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { useGameReturnTarget } from '@/hooks/useGameReturnTarget';
import { buildLoginPath } from '@/hooks/useRequireLogin';

const GAME_NAME_ZH: Record<string, string> = {
  baccarat: '皇家百家',
  'baccarat-nova': '星耀百家',
  'baccarat-imperial': '御龍百家',
  blackjack: '21點',
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
  'thunder-slot': '雷神之鎚',
  'dragon-mega-slot': '龍焰巨輪',
  'nebula-slot': '星河寶藏',
  'jungle-slot': '秘境遺跡',
  'vampire-slot': '暗夜古堡',
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

const MEGA_SLOT_GAME_IDS = new Set([
  'thunder-slot',
  'dragon-mega-slot',
  'nebula-slot',
  'jungle-slot',
  'vampire-slot',
]);

type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type FullscreenTarget = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
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
  const location = useLocation();
  const loginPath = buildLoginPath(`${location.pathname}${location.search}`, 'game');
  const slotLayout = MEGA_SLOT_GAME_IDS.has(game.id) ? 'mega' : 'standard';
  const shellRef = useRef<HTMLDivElement>(null);
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [immersiveNotice, setImmersiveNotice] = useState<'ios' | 'blocked' | null>(null);
  const isMegaSlot = slotLayout === 'mega';

  useEffect(() => {
    const updateMode = () => {
      setStandaloneMode(isStandaloneDisplayMode() || Boolean(document.fullscreenElement));
    };
    const mediaQueries = [
      window.matchMedia('(display-mode: fullscreen)'),
      window.matchMedia('(display-mode: standalone)'),
    ];
    updateMode();
    document.addEventListener('fullscreenchange', updateMode);
    mediaQueries.forEach((query) => query.addEventListener('change', updateMode));
    return () => {
      document.removeEventListener('fullscreenchange', updateMode);
      mediaQueries.forEach((query) => query.removeEventListener('change', updateMode));
    };
  }, []);

  const handleEnterImmersive = async () => {
    const target = shellRef.current ?? document.documentElement;
    const entered = await requestImmersiveMode(target);
    if (entered || isStandaloneDisplayMode()) {
      setStandaloneMode(true);
      setImmersiveNotice(null);
      return;
    }
    setImmersiveNotice(isAppleTouchDevice() ? 'ios' : 'blocked');
  };

  const handleBalanceRefresh = async () => {
    if (!user) return;
    try {
      const res = await api.get<{ balance: string }>('/wallet/balance');
      setBalance(res.data.balance);
    } catch (err) {
      console.error(extractApiError(err));
    }
  };

  return (
    <div
      ref={shellRef}
      className="game-fullscreen-shell relative min-h-[100svh] overflow-x-hidden bg-[#050A13] text-white"
      data-game-id={game.id}
      data-slot-layout={slotLayout}
    >
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
            className="game-shell-back inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/82 transition hover:border-white/24 hover:bg-white/[0.1] hover:text-white"
            aria-label={`返回${returnTarget.label}`}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>

          <div className="game-shell-title-block min-w-0 flex-1">
            <div className="game-shell-title truncate text-[15px] font-black leading-tight text-white sm:text-[16px]">
              {game.title}
            </div>
            <div className="game-shell-subtitle truncate text-[10px] font-bold uppercase tracking-[0.22em] text-white/42">
              {game.subtitle}
            </div>
          </div>

          {user ? (
            <button
              type="button"
              onClick={handleBalanceRefresh}
              className="game-shell-balance hidden h-10 shrink-0 items-center gap-2 rounded-full border border-[#C9A247]/35 bg-[#101B2D] px-3 text-[12px] font-bold text-[#E8D48A] transition hover:border-[#C9A247]/65 hover:bg-[#162338] sm:inline-flex"
              title="重新載入餘額"
            >
              <WalletCards className="h-4 w-4" aria-hidden="true" />
              <span className="data-num">{formatAmount(user.balance ?? '0')}</span>
            </button>
          ) : (
            <Link
              to={loginPath}
              className="game-shell-balance hidden h-10 shrink-0 items-center rounded-full border border-[#C9A247]/35 bg-[#101B2D] px-3 text-[12px] font-bold text-[#E8D48A] transition hover:border-[#C9A247]/65 hover:bg-[#162338] sm:inline-flex"
            >
              登入下注
            </Link>
          )}

          <Link
            to={user ? '/history' : loginPath}
            className="game-shell-history hidden h-10 shrink-0 items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 text-[12px] font-semibold text-white/72 transition hover:border-white/24 hover:bg-white/[0.1] hover:text-white md:inline-flex"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            記錄
          </Link>

          <SoundToggle variant="dark" />
          <MusicToggle variant="dark" />

          {isMegaSlot && !standaloneMode && (
            <button
              type="button"
              onClick={() => void handleEnterImmersive()}
              className="game-shell-immersive inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#7DD3FC]/35 bg-[#0B2133] px-3 text-[12px] font-bold text-[#BDEBFF] transition hover:border-[#7DD3FC]/65 hover:bg-[#11304A]"
              aria-label="全螢幕"
              title="全螢幕"
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
              <span>全螢幕</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="game-shell-reload inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/72 transition hover:border-white/24 hover:bg-white/[0.1] hover:text-white"
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

      {immersiveNotice && (
        <div className="game-immersive-notice" role="status" aria-live="polite">
          <div className="flex min-w-0 items-start gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-[#F3D67D]" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-black text-white">
                {immersiveNotice === 'ios' ? 'iPhone 全螢幕開法' : '瀏覽器未允許全螢幕'}
              </div>
              <div className="mt-1 text-white/72">
                {immersiveNotice === 'ios'
                  ? '請用 Safari 分享按鈕加入主畫面，再從主畫面 BG 圖示開啟。'
                  : '請允許全螢幕，或把 BG 加入主畫面後從圖示開啟。'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setImmersiveNotice(null)}
            className="game-immersive-notice__close"
            aria-label="關閉提示"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

async function requestImmersiveMode(target: HTMLElement): Promise<boolean> {
  const fullscreenTarget = target as FullscreenTarget;
  let entered = Boolean(document.fullscreenElement);

  try {
    if (!entered && target.requestFullscreen) {
      await target.requestFullscreen({ navigationUI: 'hide' });
      entered = true;
    } else if (!entered && fullscreenTarget.webkitRequestFullscreen) {
      await fullscreenTarget.webkitRequestFullscreen();
      entered = true;
    }
  } catch {
    entered = false;
  }

  try {
    await (screen.orientation as ScreenOrientationWithLock | undefined)?.lock?.('landscape');
  } catch {
    // iOS Safari and normal browser tabs may reject orientation lock.
  }

  return entered;
}

function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as NavigatorWithStandalone;
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  );
}

function isAppleTouchDevice(): boolean {
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
}
