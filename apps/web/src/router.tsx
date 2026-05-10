import { lazy, Suspense, useLayoutEffect, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { GameFullscreenShell } from '@/components/layout/GameFullscreenShell';
import { GuestGuard } from '@/components/layout/GuestGuard';
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
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-[12px] font-semibold tracking-[0.24em] text-white/55">
      LOADING
    </div>
  );
}

function suspended(element: ReactNode): JSX.Element {
  return <Suspense fallback={<RouteLoading />}>{element}</Suspense>;
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
          { path: '/games/dice', element: suspended(<DicePage />) },
          { path: '/games/mines', element: suspended(<MinesPage />) },
          { path: '/games/hilo', element: suspended(<HiLoPage />) },
          { path: '/games/blackjack', element: suspended(<BlackjackPage />) },
          { path: '/games/keno', element: suspended(<KenoPage />) },
          { path: '/games/wheel', element: suspended(<WheelPage />) },
          {
            path: '/games/mini-roulette',
            element: suspended(<RoulettePage variant="mini-roulette" />),
          },
          { path: '/games/carnival', element: suspended(<RoulettePage variant="carnival" />) },
          { path: '/games/plinko', element: suspended(<PlinkoPage />) },
          { path: '/games/hotline', element: suspended(<HotlinePage theme="cyber" />) },
          { path: '/games/fruit-slot', element: suspended(<HotlinePage theme="fruit" />) },
          { path: '/games/fortune-slot', element: suspended(<HotlinePage theme="fortune" />) },
          { path: '/games/ocean-slot', element: suspended(<HotlinePage theme="ocean" />) },
          { path: '/games/temple-slot', element: suspended(<HotlinePage theme="temple" />) },
          { path: '/games/candy-slot', element: suspended(<HotlinePage theme="candy" />) },
          { path: '/games/sakura-slot', element: suspended(<HotlinePage theme="sakura" />) },
          { path: '/games/thunder-slot', element: suspended(<HotlinePage theme="thunder" />) },
          {
            path: '/games/dragon-mega-slot',
            element: suspended(<HotlinePage theme="dragonMega" />),
          },
          { path: '/games/nebula-slot', element: suspended(<HotlinePage theme="nebula" />) },
          { path: '/games/jungle-slot', element: suspended(<HotlinePage theme="jungle" />) },
          { path: '/games/vampire-slot', element: suspended(<HotlinePage theme="vampire" />) },
          { path: '/games/tower', element: suspended(<TowerPage />) },
          { path: '/games/chicken-road', element: suspended(<ChickenRoadPage />) },
          {
            path: '/games/rocket',
            element: suspended(<CrashPage config={CRASH_CONFIGS.rocket!} />),
          },
          {
            path: '/games/aviator',
            element: suspended(<CrashPage config={CRASH_CONFIGS.aviator!} />),
          },
          {
            path: '/games/space-fleet',
            element: suspended(<CrashPage config={CRASH_CONFIGS['space-fleet']!} />),
          },
          { path: '/games/jetx', element: suspended(<CrashPage config={CRASH_CONFIGS.jetx!} />) },
          {
            path: '/games/balloon',
            element: suspended(<CrashPage config={CRASH_CONFIGS.balloon!} />),
          },
          { path: '/games/jetx3', element: suspended(<CrashPage config={CRASH_CONFIGS.jetx3!} />) },
          {
            path: '/games/double-x',
            element: suspended(<CrashPage config={CRASH_CONFIGS['double-x']!} />),
          },
          { path: '/games/plinko-x', element: suspended(<PlinkoPage variant="x" />) },
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
