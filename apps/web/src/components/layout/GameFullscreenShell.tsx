import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  History,
  KeyRound,
  Maximize2,
  RefreshCw,
  Smartphone,
  WalletCards,
  X,
} from 'lucide-react';
import { GAMES_REGISTRY, type GameIdType } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { AudioMenu } from '@/components/layout/AudioMenu';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { useGameReturnTarget } from '@/hooks/useGameReturnTarget';
import { buildLoginPath } from '@/hooks/useRequireLogin';
import { useLiveBalance } from '@/hooks/useLiveBalance';
import { getLocalizedGameTitle } from '@/i18n/gameLabels';
import { useTranslation } from '@/i18n/useTranslation';
import { ChangePasswordModal } from '@/components/layout/ChangePasswordModal';
import { BettingLimitBadge } from '@/components/game/BettingLimitBadge';
import { ResponsiveImage } from '@/lib/optimizedImages';

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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const isMegaSlot = slotLayout === 'mega';
  useLiveBalance();

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const shell = shellRef.current;
    if (!shell) return;

    const root = document.documentElement;
    let rafId = 0;
    let keyboardLockedHeight: number | null = null;

    const readViewportHeight = () =>
      Math.max(1, Math.round(window.visualViewport?.height ?? window.innerHeight));

    const isTextInputActive = () => {
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement) return true;
      if (!(active instanceof HTMLInputElement)) return false;
      return ![
        'button',
        'checkbox',
        'file',
        'hidden',
        'image',
        'radio',
        'range',
        'reset',
        'submit',
      ].includes(active.type);
    };

    const applyViewportHeight = () => {
      rafId = 0;
      const viewportHeight = readViewportHeight();
      const height = keyboardLockedHeight ?? viewportHeight;
      const value = `${height}px`;
      shell.style.setProperty('--game-shell-height', value);
      root.style.setProperty('--game-shell-height', value);
    };

    const scheduleViewportHeight = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(applyViewportHeight);
    };

    const lockViewportForKeyboard = () => {
      if (!isTextInputActive()) return;
      keyboardLockedHeight = readViewportHeight();
      scheduleViewportHeight();
    };

    const unlockViewportAfterKeyboard = () => {
      window.setTimeout(() => {
        if (isTextInputActive()) return;
        keyboardLockedHeight = null;
        scheduleViewportHeight();
      }, 180);
    };

    applyViewportHeight();
    window.addEventListener('resize', scheduleViewportHeight);
    window.addEventListener('orientationchange', scheduleViewportHeight);
    window.addEventListener('focusin', lockViewportForKeyboard);
    window.addEventListener('focusout', unlockViewportAfterKeyboard);
    window.visualViewport?.addEventListener('resize', scheduleViewportHeight);
    window.visualViewport?.addEventListener('scroll', scheduleViewportHeight);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleViewportHeight);
      window.removeEventListener('orientationchange', scheduleViewportHeight);
      window.removeEventListener('focusin', lockViewportForKeyboard);
      window.removeEventListener('focusout', unlockViewportAfterKeyboard);
      window.visualViewport?.removeEventListener('resize', scheduleViewportHeight);
      window.visualViewport?.removeEventListener('scroll', scheduleViewportHeight);
      shell.style.removeProperty('--game-shell-height');
      root.style.removeProperty('--game-shell-height');
    };
  }, []);

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
      className="game-fullscreen-shell game-warm-shell relative min-h-[100svh] overflow-x-hidden bg-[#FFF7E8] text-white"
      data-game-id={game.id}
      data-slot-layout={slotLayout}
    >
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <div className="pointer-events-none fixed inset-0">
        <ResponsiveImage
          src="/backgrounds/casino-atmosphere.png"
          alt=""
          aria-hidden="true"
          preset="hero"
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
          width={1717}
          height={916}
          className="game-shell-backdrop-image h-full w-full object-cover opacity-[0.16]"
        />
        <div className="game-shell-backdrop-tint absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,234,0.78)_0%,rgba(241,250,232,0.84)_42%,rgba(255,236,231,0.9)_68%,rgba(243,237,255,0.94)_100%)]" />
      </div>

      <header className="game-shell-header sticky top-0 z-40 border-b border-[#E8C96B]/28 bg-[#FFF7E8]/86 pt-[env(safe-area-inset-top)] shadow-[0_14px_36px_rgba(154,52,18,0.12)] backdrop-blur">
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
            <div className="relative shrink-0">
              {accountMenuOpen && (
                <button
                  type="button"
                  className="game-account-menu-backdrop fixed inset-0 z-40 cursor-default bg-transparent"
                  aria-label="關閉帳號選單"
                  onClick={() => setAccountMenuOpen(false)}
                />
              )}
              <button
                type="button"
                onClick={() => setAccountMenuOpen((value) => !value)}
                className="game-shell-balance relative z-50 inline-flex h-10 min-w-[112px] max-w-[148px] shrink-0 items-center gap-2 rounded-full border border-[#C9A247]/35 bg-[#101B2D] px-3 text-[12px] font-bold text-[#E8D48A] transition hover:border-[#C9A247]/65 hover:bg-[#162338]"
                aria-expanded={accountMenuOpen}
                aria-label={`${t.common.account} ${user.username}，${t.common.balance} ${formatAmount(user.balance ?? '0')}`}
              >
                <WalletCards className="h-4 w-4" aria-hidden="true" />
                <span className="game-shell-balance-copy flex min-w-0 flex-col items-start justify-center leading-none">
                  <span className="game-shell-account max-w-full truncate text-[10px] font-black text-white/60">
                    {user.username}
                  </span>
                  <span className="data-num mt-1 max-w-full truncate text-[11px] font-black">
                    {formatAmount(user.balance ?? '0')}
                  </span>
                </span>
                <ChevronDown
                  className={`h-3 w-3 shrink-0 text-[#E8D48A]/70 transition ${accountMenuOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {accountMenuOpen && (
                <div className="game-account-menu absolute right-0 top-[calc(100%+8px)] z-50 w-[168px] overflow-hidden rounded-[12px] border border-white/12 bg-[#0F172A] py-1 shadow-[0_18px_42px_rgba(0,0,0,0.5)]">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setPasswordOpen(true);
                    }}
                    className="flex h-11 w-full items-center gap-2 px-3 text-left text-[13px] font-bold text-white/86 transition hover:bg-white/[0.07]"
                  >
                    <KeyRound className="h-4 w-4 text-[#E8D48A]" aria-hidden="true" />
                    修改密碼
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      void handleBalanceRefresh();
                    }}
                    className="flex h-11 w-full items-center gap-2 px-3 text-left text-[13px] font-bold text-white/76 transition hover:bg-white/[0.07]"
                  >
                    <RefreshCw className="h-4 w-4 text-white/58" aria-hidden="true" />
                    {t.common.reload}
                  </button>
                </div>
              )}
            </div>
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

          <AudioMenu variant="light" className="game-shell-audio" />
          <BettingLimitBadge gameId={game.id} className="game-shell-header-limit" />

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
