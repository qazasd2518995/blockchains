import { useLayoutEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { GameFullscreenShell } from '@/components/layout/GameFullscreenShell';
import { GuestGuard } from '@/components/layout/GuestGuard';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { LobbyPage } from '@/pages/LobbyPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { DicePage } from '@/pages/games/DicePage';
import { MinesPage } from '@/pages/games/MinesPage';
import { HiLoPage } from '@/pages/games/HiLoPage';
import { KenoPage } from '@/pages/games/KenoPage';
import { WheelPage } from '@/pages/games/WheelPage';
import { RoulettePage } from '@/pages/games/RoulettePage';
import { PlinkoPage } from '@/pages/games/PlinkoPage';
import { HotlinePage } from '@/pages/games/HotlinePage';
import { TowerPage } from '@/pages/games/TowerPage';
import { BlackjackPage } from '@/pages/games/BlackjackPage';
import { CrashPage, CRASH_CONFIGS } from '@/pages/games/CrashPage';
import { HallPage } from '@/pages/HallPage';
import { VerifyPage } from '@/pages/VerifyPage';
import { PromosPage } from '@/pages/PromosPage';
import { BaccaratPage } from '@/pages/games/BaccaratPage';
import { PlatformBgm } from '@/lib/platformBgm';

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
        element: <LandingPage />,
      },
      {
        element: (
          <GuestGuard>
            <Outlet />
          </GuestGuard>
        ),
        children: [
          { path: '/login', element: <LoginPage /> },
        ],
      },
      { path: '/games/baccarat', element: <BaccaratPage variant="royal" /> },
      { path: '/games/baccarat-nova', element: <BaccaratPage variant="nova" /> },
      { path: '/games/baccarat-imperial', element: <BaccaratPage variant="imperial" /> },
      {
        element: <GameFullscreenShell />,
        children: [
          { path: '/games/dice', element: <DicePage /> },
          { path: '/games/mines', element: <MinesPage /> },
          { path: '/games/hilo', element: <HiLoPage /> },
          { path: '/games/blackjack', element: <BlackjackPage /> },
          { path: '/games/keno', element: <KenoPage /> },
          { path: '/games/wheel', element: <WheelPage /> },
          { path: '/games/mini-roulette', element: <RoulettePage variant="mini-roulette" /> },
          { path: '/games/carnival', element: <RoulettePage variant="carnival" /> },
          { path: '/games/plinko', element: <PlinkoPage /> },
          { path: '/games/hotline', element: <HotlinePage theme="cyber" /> },
          { path: '/games/fruit-slot', element: <HotlinePage theme="fruit" /> },
          { path: '/games/fortune-slot', element: <HotlinePage theme="fortune" /> },
          { path: '/games/ocean-slot', element: <HotlinePage theme="ocean" /> },
          { path: '/games/temple-slot', element: <HotlinePage theme="temple" /> },
          { path: '/games/candy-slot', element: <HotlinePage theme="candy" /> },
          { path: '/games/sakura-slot', element: <HotlinePage theme="sakura" /> },
          { path: '/games/thunder-slot', element: <HotlinePage theme="thunder" /> },
          { path: '/games/dragon-mega-slot', element: <HotlinePage theme="dragonMega" /> },
          { path: '/games/nebula-slot', element: <HotlinePage theme="nebula" /> },
          { path: '/games/jungle-slot', element: <HotlinePage theme="jungle" /> },
          { path: '/games/vampire-slot', element: <HotlinePage theme="vampire" /> },
          { path: '/games/tower', element: <TowerPage /> },
          { path: '/games/rocket', element: <CrashPage config={CRASH_CONFIGS.rocket!} /> },
          { path: '/games/aviator', element: <CrashPage config={CRASH_CONFIGS.aviator!} /> },
          { path: '/games/space-fleet', element: <CrashPage config={CRASH_CONFIGS['space-fleet']!} /> },
          { path: '/games/jetx', element: <CrashPage config={CRASH_CONFIGS.jetx!} /> },
          { path: '/games/balloon', element: <CrashPage config={CRASH_CONFIGS.balloon!} /> },
          { path: '/games/jetx3', element: <CrashPage config={CRASH_CONFIGS.jetx3!} /> },
          { path: '/games/double-x', element: <CrashPage config={CRASH_CONFIGS['double-x']!} /> },
          { path: '/games/plinko-x', element: <PlinkoPage variant="x" /> },
        ],
      },
      {
        element: (
          <AppShell>
            <Outlet />
          </AppShell>
        ),
        children: [
          { path: '/lobby', element: <LobbyPage /> },
          { path: '/hall/:hallId', element: <HallPage /> },
          { path: '/verify', element: <VerifyPage /> },
          { path: '/promos', element: <PromosPage /> },
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
        children: [
          { path: '/history', element: <HistoryPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
      { path: '/404', element: <Navigate to="/" replace /> },
    ],
  },
]);
