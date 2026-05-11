import { lazy, Suspense, useLayoutEffect, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { GameFullscreenShell } from '@/components/layout/GameFullscreenShell';
import { GuestGuard } from '@/components/layout/GuestGuard';
import { preloadGameAssets } from '@/lib/gameAssetManifest';
import { useTranslation } from '@/i18n/useTranslation';
import { PlatformBgm } from '@/lib/platformBgm';
import { CRASH_CONFIGS } from '@/pages/games/crashConfigs';

const LandingPage = lazy(() =>
  import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })),
);
const LoginPage = lazy(() =>
  import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const LobbyPage = lazy(() => import('@/pages/LobbyPage').then((m) => ({ default: m.LobbyPage })));
const HistoryPage = lazy(() =>
  import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const HallPage = lazy(() => import('@/pages/HallPage').then((m) => ({ default: m.HallPage })));
const VerifyPage = lazy(() =>
  import('@/pages/VerifyPage').then((m) => ({ default: m.VerifyPage })),
);
const PromosPage = lazy(() =>
  import('@/pages/PromosPage').then((m) => ({ default: m.PromosPage })),
);
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

const BlackjackPage = lazy(() =>
  import('@/pages/games/BlackjackPage').then((m) => ({ default: m.BlackjackPage })),
);
const ChickenRoadPage = lazy(() =>
  import('@/pages/games/ChickenRoadPage').then((m) => ({ default: m.ChickenRoadPage })),
);
const CrashPage = lazy(() =>
  import('@/pages/games/CrashPage').then((m) => ({ default: m.CrashPage })),
);
const DicePage = lazy(() =>
  import('@/pages/games/DicePage').then((m) => ({ default: m.DicePage })),
);
const HiLoPage = lazy(() =>
  import('@/pages/games/HiLoPage').then((m) => ({ default: m.HiLoPage })),
);
const HotlinePage = lazy(() =>
  import('@/pages/games/HotlinePage').then((m) => ({ default: m.HotlinePage })),
);
const KenoPage = lazy(() =>
  import('@/pages/games/KenoPage').then((m) => ({ default: m.KenoPage })),
);
const MinesPage = lazy(() =>
  import('@/pages/games/MinesPage').then((m) => ({ default: m.MinesPage })),
);
const PlinkoPage = lazy(() =>
  import('@/pages/games/PlinkoPage').then((m) => ({ default: m.PlinkoPage })),
);
const RoulettePage = lazy(() =>
  import('@/pages/games/RoulettePage').then((m) => ({ default: m.RoulettePage })),
);
const TowerPage = lazy(() =>
  import('@/pages/games/TowerPage').then((m) => ({ default: m.TowerPage })),
);
const WheelPage = lazy(() =>
  import('@/pages/games/WheelPage').then((m) => ({ default: m.WheelPage })),
);

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
          gameRoute('/games/chicken-road', 'chicken-road', <ChickenRoadPage />),
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
