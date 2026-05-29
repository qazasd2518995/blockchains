import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AdminShell } from '@/components/layout/AdminShell';
import { AdminGuard, AdminGuestGuard } from '@/components/layout/AdminGuard';
import { useAdminAuthStore } from '@/stores/adminAuthStore';

const AdminLoginPage = lazy(() => import('@/pages/auth/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage })));
const AdminDashboardPage = lazy(() => import('@/pages/dashboard/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const AgentHierarchyPage = lazy(() => import('@/pages/agents/AgentHierarchyPage').then((m) => ({ default: m.AgentHierarchyPage })));
const MemberBetRecordsPage = lazy(() => import('@/pages/members/MemberBetRecordsPage').then((m) => ({ default: m.MemberBetRecordsPage })));
const TransfersPage = lazy(() => import('@/pages/transfers/TransfersPage').then((m) => ({ default: m.TransfersPage })));
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const ControlsOverviewPage = lazy(() => import('@/pages/controls/ControlsOverviewPage').then((m) => ({ default: m.ControlsOverviewPage })));
const AuditLogPage = lazy(() => import('@/pages/audit/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const SubAccountsPage = lazy(() => import('@/pages/subaccounts/SubAccountsPage').then((m) => ({ default: m.SubAccountsPage })));
const AnnouncementsPage = lazy(() => import('@/pages/announcements/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })));

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

function SuperAdminOnly({ children }: { children: ReactNode }): JSX.Element {
  const { agent } = useAdminAuthStore();
  if (agent?.role !== 'SUPER_ADMIN') return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/admin/login" replace />,
  },
  {
    path: '/admin',
    element: <Navigate to="/admin/dashboard" replace />,
  },
  // 舊路徑相容：agents / members 全導向 accounts
  { path: '/admin/agents', element: <Navigate to="/admin/accounts" replace /> },
  { path: '/admin/members', element: <Navigate to="/admin/accounts" replace /> },
  {
    element: (
      <AdminGuestGuard>
        <Outlet />
      </AdminGuestGuard>
    ),
    children: [{ path: '/admin/login', element: suspended(<AdminLoginPage />) }],
  },
  {
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
      { path: '/admin/reports', element: suspended(<ReportsPage />) },
      { path: '/admin/controls', element: suspended(<SuperAdminOnly><ControlsOverviewPage /></SuperAdminOnly>) },
      { path: '/admin/audit', element: suspended(<AuditLogPage />) },
      { path: '/admin/subaccounts', element: suspended(<SubAccountsPage />) },
      { path: '/admin/announcements', element: suspended(<SuperAdminOnly><AnnouncementsPage /></SuperAdminOnly>) },
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
