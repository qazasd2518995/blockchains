import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  History,
  Maximize2,
  RefreshCw,
  Smartphone,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import { GAMES_REGISTRY, type GameIdType } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { AudioMenu } from '@/components/layout/AudioMenu';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { useGameReturnTarget } from '@/hooks/useGameReturnTarget';
import { buildLoginPath } from '@/hooks/useRequireLogin';
import { useLiveBalance } from '@/hooks/useLiveBalance';
import { getLocalizedGameTitle } from '@/i18n/gameLabels';
import { useTranslation } from '@/i18n/useTranslation';

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
  const { locale } = useTranslation();
  return useMemo(() => {
    const gameId = location.pathname.replace(/^\/games\//, '').split('/')[0] ?? '';
    const game = GAMES_REGISTRY[gameId as GameIdType];
    return {
      id: gameId,
      title: getLocalizedGameTitle(gameId, locale, game?.nameZh ?? '遊戲'),
      subtitle: game?.name ?? gameId.toUpperCase(),
    };
  }, [locale, location.pathname]);
}

export function GameFullscreenShell() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const game = useCurrentGameMeta();
  const returnTarget = useGameReturnTarget();
  const location = useLocation();
  const loginPath = buildLoginPath(`${location.pathname}${location.search}`, 'game');
  const slotLayout = MEGA_SLOT_GAME_IDS.has(game.id) ? 'mega' : 'standard';
  const shellRef = useRef<HTMLDivElement>(null);
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [immersiveNotice, setImmersiveNotice] = useState<'ios' | 'blocked' | null>(null);
  const isMegaSlot = slotLayout === 'mega';
  useLiveBalance();

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
            aria-label={`${t.common.back}${returnTarget.label}`}
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
              className="game-shell-balance inline-flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-full border border-[#C9A247]/35 bg-[#101B2D] px-3 text-[12px] font-bold text-[#E8D48A] transition hover:border-[#C9A247]/65 hover:bg-[#162338]"
              title={t.common.reload}
              aria-label={`${t.common.reload}，${t.common.balance} ${formatAmount(user.balance ?? '0')}`}
            >
              <WalletCards className="h-4 w-4" aria-hidden="true" />
              <span className="data-num">{formatAmount(user.balance ?? '0')}</span>
            </button>
          ) : (
            <Link
              to={loginPath}
              className="game-shell-balance inline-flex h-10 min-w-0 shrink-0 items-center rounded-full border border-[#C9A247]/35 bg-[#101B2D] px-3 text-[12px] font-bold text-[#E8D48A] transition hover:border-[#C9A247]/65 hover:bg-[#162338]"
            >
              {t.common.loginToBet}
            </Link>
          )}

          <Link
            to={user ? '/history' : loginPath}
            className="game-shell-history hidden h-10 shrink-0 items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 text-[12px] font-semibold text-white/72 transition hover:border-white/24 hover:bg-white/[0.1] hover:text-white md:inline-flex"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            {t.common.record}
          </Link>

          <AudioMenu variant="dark" />
          <LanguageSwitcher variant="dark" compact />

          {isMegaSlot && !standaloneMode && (
            <button
              type="button"
              onClick={() => void handleEnterImmersive()}
              className="game-shell-immersive inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#7DD3FC]/35 bg-[#0B2133] px-3 text-[12px] font-bold text-[#BDEBFF] transition hover:border-[#7DD3FC]/65 hover:bg-[#11304A]"
              aria-label={t.common.fullscreen}
              title={t.common.fullscreen}
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
              <span>{t.common.fullscreen}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="game-shell-reload inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/72 transition hover:border-white/24 hover:bg-white/[0.1] hover:text-white"
            aria-label={t.common.reload}
            title={t.common.reload}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <GameActivityHeat
        gameId={game.id}
        label={t.common.activityHeat}
        ariaLabel={t.common.activityHeatLabel}
      />

      <main className="relative z-10 mx-auto w-full max-w-[1920px] px-0 py-2 sm:px-4 sm:py-3 xl:px-5">
        <Outlet />
      </main>

      {immersiveNotice && (
        <div className="game-immersive-notice" role="status" aria-live="polite">
          <div className="flex min-w-0 items-start gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-[#F3D67D]" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-black text-white">
                {immersiveNotice === 'ios'
                  ? t.common.iosFullscreenGuide
                  : t.common.fullscreenBlocked}
              </div>
              <div className="mt-1 text-white/72">
                {immersiveNotice === 'ios'
                  ? t.common.iosFullscreenHelp
                  : t.common.fullscreenBlockedHelp}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setImmersiveNotice(null)}
            className="game-immersive-notice__close"
            aria-label={t.common.close}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function GameActivityHeat({
  gameId,
  label,
  ariaLabel,
}: {
  gameId: string;
  label: string;
  ariaLabel: string;
}) {
  const [count, setCount] = useState(() => getInitialActivityHeat(gameId));

  useEffect(() => {
    setCount(getInitialActivityHeat(gameId));
    const timer = window.setInterval(
      () => {
        setCount((current) => {
          const delta = Math.floor(Math.random() * 7) - 3;
          const nextDelta = delta === 0 ? 1 : delta;
          return clampActivityHeat(current + nextDelta);
        });
      },
      2600 + (hashString(gameId) % 1100),
    );
    return () => window.clearInterval(timer);
  }, [gameId]);

  return (
    <div className="game-activity-heat" aria-label={`${ariaLabel} ${count}`}>
      <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label}</span>
      <strong className="data-num">{count}</strong>
    </div>
  );
}

function getInitialActivityHeat(gameId: string): number {
  return 10 + (hashString(gameId) % 51);
}

function clampActivityHeat(value: number): number {
  return Math.max(10, Math.min(60, value));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
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
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1)
  );
}
