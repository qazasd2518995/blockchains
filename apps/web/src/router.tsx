import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { GuestGuard } from '@/components/layout/GuestGuard';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { LobbyPage } from '@/pages/LobbyPage';
import { ProfilePage } from '@/pages/ProfilePage';
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
import { CrashPage, CRASH_CONFIGS } from '@/pages/games/CrashPage';

export const router = createBrowserRouter([
  {
    path: '/',
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
      { path: '/register', element: <RegisterPage /> },
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
      { path: '/lobby', element: <LobbyPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/games/dice', element: <DicePage /> },
      { path: '/games/mines', element: <MinesPage /> },
      { path: '/games/hilo', element: <HiLoPage /> },
      { path: '/games/keno', element: <KenoPage /> },
      { path: '/games/wheel', element: <WheelPage /> },
      { path: '/games/mini-roulette', element: <RoulettePage variant="mini-roulette" /> },
      { path: '/games/carnival', element: <RoulettePage variant="carnival" /> },
      { path: '/games/plinko', element: <PlinkoPage /> },
      { path: '/games/hotline', element: <HotlinePage /> },
      { path: '/games/tower', element: <TowerPage /> },
      { path: '/games/rocket', element: <CrashPage config={CRASH_CONFIGS.rocket!} /> },
      { path: '/games/aviator', element: <CrashPage config={CRASH_CONFIGS.aviator!} /> },
      { path: '/games/space-fleet', element: <CrashPage config={CRASH_CONFIGS['space-fleet']!} /> },
      { path: '/games/jetx', element: <CrashPage config={CRASH_CONFIGS.jetx!} /> },
      { path: '/games/balloon', element: <CrashPage config={CRASH_CONFIGS.balloon!} /> },
      { path: '/games/jetx3', element: <CrashPage config={CRASH_CONFIGS.jetx3!} /> },
      { path: '/games/double-x', element: <CrashPage config={CRASH_CONFIGS['double-x']!} /> },
      { path: '/games/plinko-x', element: <CrashPage config={CRASH_CONFIGS['plinko-x']!} /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
  { path: '/404', element: <Navigate to="/" replace /> },
]);
