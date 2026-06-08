import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useRouteError } from 'react-router-dom';
import { AdminShell } from '@/components/layout/AdminShell';
import { AdminGuard, AdminGuestGuard } from '@/components/layout/AdminGuard';
import { useAdminAuthStore } from '@/stores/adminAuthStore';

const CHUNK_RELOAD_STORAGE_KEY = 'bg-admin:chunk-reload-at';
const CHUNK_RELOAD_WINDOW_MS = 30_000;

const AdminLoginPage = lazyRoute(() =>
  import('@/pages/auth/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage })),
);
const AdminDashboardPage = lazyRoute(() =>
  import('@/pages/dashboard/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
);
const AgentHierarchyPage = lazyRoute(() =>
  import('@/pages/agents/AgentHierarchyPage').then((m) => ({ default: m.AgentHierarchyPage })),
);
const MemberBetRecordsPage = lazyRoute(() =>
  import('@/pages/members/MemberBetRecordsPage').then((m) => ({ default: m.MemberBetRecordsPage })),
);
const TransfersPage = lazyRoute(() =>
  import('@/pages/transfers/TransfersPage').then((m) => ({ default: m.TransfersPage })),
);
const AgentLogsPage = lazyRoute(() =>
  import('@/pages/logs/AgentLogsPage').then((m) => ({ default: m.AgentLogsPage })),
);
const ReportsPage = lazyRoute(() =>
  import('@/pages/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const ControlsOverviewPage = lazyRoute(() =>
  import('@/pages/controls/ControlsOverviewPage').then((m) => ({
    default: m.ControlsOverviewPage,
  })),
);
const AuditLogPage = lazyRoute(() =>
  import('@/pages/audit/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
);
const SubAccountsPage = lazyRoute(() =>
  import('@/pages/subaccounts/SubAccountsPage').then((m) => ({ default: m.SubAccountsPage })),
);
const AnnouncementsPage = lazyRoute(() =>
  import('@/pages/announcements/AnnouncementsPage').then((m) => ({
    default: m.AnnouncementsPage,
  })),
);

function RouteLoading(): JSX.Element {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-[12px] font-semibold tracking-[0.24em] text-ink-500">
      LOADING
    </div>
  );
}

function suspended(element: ReactNode): JSX.Element {
  return <Suspense fallback={<RouteLoading />}>{element}</Suspense>;
}

function lazyRoute(factory: () => Promise<{ default: ComponentType }>) {
  return lazy(() =>
    factory().catch((error) => {
      if (shouldReloadForChunkError(error)) {
        console.warn('[bg-admin] route chunk failed, refreshing app shell once', error);
        window.location.reload();
        return new Promise<never>(() => undefined);
      }
      throw error;
    }),
  );
}

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Importing a module script failed') ||
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Loading chunk') ||
    message.includes('ChunkLoadError')
  );
}

function shouldReloadForChunkError(error: unknown): boolean {
  if (typeof window === 'undefined' || !isChunkLoadError(error)) return false;
  try {
    const lastReloadAt = Number(window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY) ?? '0');
    if (Number.isFinite(lastReloadAt) && Date.now() - lastReloadAt < CHUNK_RELOAD_WINDOW_MS) {
      return false;
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, Date.now().toString());
    return true;
  } catch {
    return true;
  }
}

function RouteErrorFallback(): JSX.Element {
  const error = useRouteError();
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    if (shouldReloadForChunkError(error)) {
      console.warn('[bg-admin] route error is stale chunk, refreshing app shell once', error);
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#E9ECEF] px-6">
      <div className="crt-panel max-w-xl p-6 text-center">
        <div className="font-display text-3xl text-[#D4574A]">
          {chunkError ? '版本更新中' : '系統錯誤'}
        </div>
        <div className="mt-3 text-[12px] leading-relaxed text-ink-600">
          {chunkError
            ? '後台版本已更新，正在重新載入最新檔案。'
            : error instanceof Error
              ? error.message
              : '發生未知錯誤，請重新整理頁面。'}
        </div>
        <button type="button" onClick={() => window.location.reload()} className="btn-acid mt-5">
          重新整理
        </button>
      </div>
    </div>
  );
}

function SuperAdminOnly({ children }: { children: ReactNode }): JSX.Element {
  const { agent } = useAdminAuthStore();
  if (agent?.role !== 'SUPER_ADMIN') return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/admin/login" replace />,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/admin',
    element: <Navigate to="/admin/dashboard" replace />,
    errorElement: <RouteErrorFallback />,
  },
  // 舊路徑相容：agents / members 全導向 accounts
  { path: '/admin/agents', element: <Navigate to="/admin/accounts" replace /> },
  { path: '/admin/members', element: <Navigate to="/admin/accounts" replace /> },
  {
    errorElement: <RouteErrorFallback />,
    element: (
      <AdminGuestGuard>
        <Outlet />
      </AdminGuestGuard>
    ),
    children: [{ path: '/admin/login', element: suspended(<AdminLoginPage />) }],
  },
  {
    errorElement: <RouteErrorFallback />,
    element: (
      <AdminGuard>
        <AdminShell>
          <Outlet />
        </AdminShell>
      </AdminGuard>
    ),
    children: [
      { path: '/admin/dashboard', element: suspended(<AdminDashboardPage />) },
      { path: '/admin/accounts', element: suspended(<AgentHierarchyPage />) },
      { path: '/admin/members/:id/bets', element: suspended(<MemberBetRecordsPage />) },
      { path: '/admin/transfers', element: suspended(<TransfersPage />) },
      { path: '/admin/logs', element: suspended(<AgentLogsPage />) },
      { path: '/admin/reports', element: suspended(<ReportsPage />) },
      {
        path: '/admin/controls',
        element: suspended(
          <SuperAdminOnly>
            <ControlsOverviewPage />
          </SuperAdminOnly>,
        ),
      },
      { path: '/admin/audit', element: suspended(<AuditLogPage />) },
      { path: '/admin/subaccounts', element: suspended(<SubAccountsPage />) },
      {
        path: '/admin/announcements',
        element: suspended(
          <SuperAdminOnly>
            <AnnouncementsPage />
          </SuperAdminOnly>,
        ),
      },
    ],
  },
  {
    path: '*',
    element: (
      <div className="flex min-h-screen items-center justify-center">
        <div className="crt-panel p-8 text-center">
          <div className="font-display text-5xl text-[#D4574A]">404</div>
          <div className="mt-3 text-[12px] text-ink-500">页面不存在</div>
        </div>
      </div>
    ),
  },
]);
