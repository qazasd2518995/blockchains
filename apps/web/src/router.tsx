import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
  useRouteError,
} from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { GameFullscreenShell } from '@/components/layout/GameFullscreenShell';
import { GuestGuard } from '@/components/layout/GuestGuard';
import { preloadGameAssets } from '@/lib/gameAssetManifest';
import { useTranslation } from '@/i18n/useTranslation';
import type { Locale } from '@/i18n/types';
import { PlatformBgm } from '@/lib/platformBgm';
import { errorMessage, reloadAfterRuntimeFailure } from '@/lib/runtimeRecovery';
import { CRASH_CONFIGS } from '@/pages/games/crashConfigs';

const RUNTIME_ERROR_COPY: Record<
  Locale,
  { eyebrow: string; title: string; compact: string; full: string; reload: string }
> = {
  'zh-Hant': {
    eyebrow: '頁面更新中',
    title: '請重新載入遊戲',
    compact: '遊戲檔案正在更新，系統會自動重新整理。',
    full: '偵測到頁面檔案已更新，重新載入後即可繼續遊玩。',
    reload: '重新載入',
  },
  'zh-Hans': {
    eyebrow: '页面更新中',
    title: '请重新载入游戏',
    compact: '游戏文件正在更新，系统会自动重新整理。',
    full: '侦测到页面文件已更新，重新载入后即可继续游玩。',
    reload: '重新载入',
  },
  en: {
    eyebrow: 'Page Updating',
    title: 'Reload the game',
    compact: 'Game files are updating. The system will refresh automatically.',
    full: 'New page files were detected. Reload to continue playing.',
    reload: 'Reload',
  },
  th: {
    eyebrow: 'กำลังอัปเดตหน้า',
    title: 'โปรดโหลดเกมใหม่',
    compact: 'ไฟล์เกมกำลังอัปเดต ระบบจะรีเฟรชให้อัตโนมัติ',
    full: 'ตรวจพบไฟล์หน้าใหม่ โหลดใหม่แล้วจะเล่นต่อได้',
    reload: 'โหลดใหม่',
  },
  vi: {
    eyebrow: 'Đang cập nhật trang',
    title: 'Vui lòng tải lại game',
    compact: 'Tệp game đang được cập nhật. Hệ thống sẽ tự làm mới.',
    full: 'Phát hiện tệp trang mới. Tải lại để tiếp tục chơi.',
    reload: 'Tải lại',
  },
};

function lazyPage(loader: () => Promise<unknown>, exportName: string) {
  return lazy(async (): Promise<{ default: ComponentType<any> }> => {
    try {
      const module = await loader();
      const Page =
        module && typeof module === 'object'
          ? (module as Record<string, unknown>)[exportName]
          : undefined;
      if (!Page) throw new Error(`Missing lazy page export: ${exportName}`);
      return { default: Page as ComponentType<any> };
    } catch (error) {
      reloadAfterRuntimeFailure(error);
      return { default: () => <RouteLoadFailed error={error} /> };
    }
  });
}

const LandingPage = lazyPage(() => import('@/pages/LandingPage'), 'LandingPage');
const LoginPage = lazyPage(() => import('@/pages/auth/LoginPage'), 'LoginPage');
const LobbyPage = lazyPage(() => import('@/pages/LobbyPage'), 'LobbyPage');
const HistoryPage = lazyPage(() => import('@/pages/HistoryPage'), 'HistoryPage');
const HallPage = lazyPage(() => import('@/pages/HallPage'), 'HallPage');
const VerifyPage = lazyPage(() => import('@/pages/VerifyPage'), 'VerifyPage');
const PromosPage = lazyPage(() => import('@/pages/PromosPage'), 'PromosPage');
const NotFoundPage = lazyPage(() => import('@/pages/NotFoundPage'), 'NotFoundPage');
const BlackjackPage = lazyPage(() => import('@/pages/games/BlackjackPage'), 'BlackjackPage');
const CrashPage = lazyPage(() => import('@/pages/games/CrashPage'), 'CrashPage');
const DicePage = lazyPage(() => import('@/pages/games/DicePage'), 'DicePage');
const HiLoPage = lazyPage(() => import('@/pages/games/HiLoPage'), 'HiLoPage');
const HotlinePage = lazyPage(() => import('@/pages/games/HotlinePage'), 'HotlinePage');
const KenoPage = lazyPage(() => import('@/pages/games/KenoPage'), 'KenoPage');
const MinesPage = lazyPage(() => import('@/pages/games/MinesPage'), 'MinesPage');
const PlinkoPage = lazyPage(() => import('@/pages/games/PlinkoPage'), 'PlinkoPage');
const RoulettePage = lazyPage(() => import('@/pages/games/RoulettePage'), 'RoulettePage');
const TowerPage = lazyPage(() => import('@/pages/games/TowerPage'), 'TowerPage');
const WheelPage = lazyPage(() => import('@/pages/games/WheelPage'), 'WheelPage');

function RouteLoading(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-[12px] font-semibold tracking-[0.24em] text-white/55">
      {t.common.loading}
    </div>
  );
}

function suspended(element: ReactNode): JSX.Element {
  return <Suspense fallback={<RouteLoading />}>{element}</Suspense>;
}

function RouteLoadFailed({ error }: { error: unknown }): JSX.Element {
  return <RuntimeErrorScreen error={error} compact />;
}

function RouteErrorScreen(): JSX.Element {
  const error = useRouteError();
  return <RuntimeErrorScreen error={error} />;
}

function RuntimeErrorScreen({
  error,
  compact = false,
}: {
  error: unknown;
  compact?: boolean;
}): JSX.Element {
  const { locale } = useTranslation();
  const copy = RUNTIME_ERROR_COPY[locale];

  useEffect(() => {
    reloadAfterRuntimeFailure(error);
  }, [error]);

  return (
    <div className="grid min-h-[100svh] place-items-center bg-[#050A13] px-5 text-white">
      <div className="w-full max-w-[360px] rounded-[18px] border border-[#FED7AA]/28 bg-[#101B2D] p-5 text-center shadow-[0_24px_60px_rgba(0,0,0,0.38)]">
        <div className="text-[12px] font-black tracking-[0.22em] text-[#F3D67D]">
          {copy.eyebrow}
        </div>
        <h1 className="mt-3 text-[22px] font-black text-white">{copy.title}</h1>
        <p className="mt-2 text-[13px] leading-6 text-white/68">
          {compact ? copy.compact : copy.full}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[12px] bg-[#EA580C] text-[14px] font-black text-white"
        >
          {copy.reload}
        </button>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-h-28 overflow-auto rounded-[10px] bg-black/30 p-3 text-left text-[10px] text-white/60">
            {errorMessage(error)}
          </pre>
        )}
      </div>
    </div>
  );
}

function gameRoute(path: string, gameId: string, element: ReactNode) {
  return {
    path,
    loader: async () => {
      await preloadGameAssets(gameId);
      return null;
    },
    element: suspended(element),
  };
}

function RouteViewportReset() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  useLayoutEffect(() => {
    PlatformBgm.setRouteSuppressed(pathname.startsWith('/games/baccarat'));
    PlatformBgm.init();
  }, [pathname]);

  return <Outlet />;
}

function RootEntry() {
  return <Navigate to="/lobby" replace />;
}

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorScreen />,
    element: <RouteViewportReset />,
    children: [
      {
        path: '/',
        element: <RootEntry />,
      },
      {
        path: '/landing',
        element: suspended(<LandingPage />),
      },
      {
        element: (
          <GuestGuard>
            <Outlet />
          </GuestGuard>
        ),
        children: [{ path: '/login', element: suspended(<LoginPage />) }],
      },
      { path: '/games/baccarat', element: <Navigate to="/lobby" replace /> },
      { path: '/games/baccarat-nova', element: <Navigate to="/lobby" replace /> },
      { path: '/games/baccarat-imperial', element: <Navigate to="/lobby" replace /> },
      { path: '/games/chicken-road', element: <Navigate to="/lobby" replace /> },
      {
        element: <GameFullscreenShell />,
        children: [
          gameRoute('/games/dice', 'dice', <DicePage />),
          gameRoute('/games/mines', 'mines', <MinesPage />),
          gameRoute('/games/hilo', 'hilo', <HiLoPage />),
          gameRoute('/games/blackjack', 'blackjack', <BlackjackPage />),
          gameRoute('/games/keno', 'keno', <KenoPage />),
          gameRoute('/games/wheel', 'wheel', <WheelPage />),
          gameRoute(
            '/games/mini-roulette',
            'mini-roulette',
            <RoulettePage variant="mini-roulette" />,
          ),
          gameRoute('/games/carnival', 'carnival', <RoulettePage variant="carnival" />),
          gameRoute('/games/plinko', 'plinko', <PlinkoPage />),
          gameRoute('/games/hotline', 'hotline', <HotlinePage theme="cyber" />),
          gameRoute('/games/fruit-slot', 'fruit-slot', <HotlinePage theme="fruit" />),
          gameRoute('/games/fortune-slot', 'fortune-slot', <HotlinePage theme="fortune" />),
          gameRoute('/games/ocean-slot', 'ocean-slot', <HotlinePage theme="ocean" />),
          gameRoute('/games/temple-slot', 'temple-slot', <HotlinePage theme="temple" />),
          gameRoute('/games/candy-slot', 'candy-slot', <HotlinePage theme="candy" />),
          gameRoute('/games/sakura-slot', 'sakura-slot', <HotlinePage theme="sakura" />),
          gameRoute('/games/thunder-slot', 'thunder-slot', <HotlinePage theme="thunder" />),
          gameRoute(
            '/games/dragon-mega-slot',
            'dragon-mega-slot',
            <HotlinePage theme="dragonMega" />,
          ),
          gameRoute('/games/nebula-slot', 'nebula-slot', <HotlinePage theme="nebula" />),
          gameRoute('/games/jungle-slot', 'jungle-slot', <HotlinePage theme="jungle" />),
          gameRoute('/games/vampire-slot', 'vampire-slot', <HotlinePage theme="vampire" />),
          gameRoute('/games/tower', 'tower', <TowerPage />),
          gameRoute('/games/rocket', 'rocket', <CrashPage config={CRASH_CONFIGS.rocket!} />),
          gameRoute('/games/aviator', 'aviator', <CrashPage config={CRASH_CONFIGS.aviator!} />),
          gameRoute(
            '/games/space-fleet',
            'space-fleet',
            <CrashPage config={CRASH_CONFIGS['space-fleet']!} />,
          ),
          gameRoute('/games/jetx', 'jetx', <CrashPage config={CRASH_CONFIGS.jetx!} />),
          gameRoute('/games/balloon', 'balloon', <CrashPage config={CRASH_CONFIGS.balloon!} />),
          gameRoute('/games/jetx3', 'jetx3', <CrashPage config={CRASH_CONFIGS.jetx3!} />),
          gameRoute(
            '/games/double-x',
            'double-x',
            <CrashPage config={CRASH_CONFIGS['double-x']!} />,
          ),
          gameRoute('/games/plinko-x', 'plinko-x', <PlinkoPage variant="x" />),
        ],
      },
      {
        element: (
          <AppShell>
            <Outlet />
          </AppShell>
        ),
        children: [
          { path: '/lobby', element: suspended(<LobbyPage />) },
          { path: '/hall/:hallId', element: suspended(<HallPage />) },
          { path: '/verify', element: suspended(<VerifyPage />) },
          { path: '/promos', element: suspended(<PromosPage />) },
          { path: '/profile', element: <Navigate to="/lobby" replace /> },
        ],
      },
      {
        element: (
          <AuthGuard>
            <AppShell>
              <Outlet />
            </AppShell>
          </AuthGuard>
        ),
        children: [{ path: '/history', element: suspended(<HistoryPage />) }],
      },
      { path: '*', element: suspended(<NotFoundPage />) },
      { path: '/404', element: <Navigate to="/" replace /> },
    ],
  },
]);
