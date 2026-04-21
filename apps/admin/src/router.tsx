import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AdminShell } from '@/components/layout/AdminShell';
import { AdminGuard, AdminGuestGuard } from '@/components/layout/AdminGuard';
import { AdminLoginPage } from '@/pages/auth/AdminLoginPage';
import { AdminDashboardPage } from '@/pages/dashboard/AdminDashboardPage';
import { AgentHierarchyPage } from '@/pages/agents/AgentHierarchyPage';
import { MemberBetRecordsPage } from '@/pages/members/MemberBetRecordsPage';
import { TransfersPage } from '@/pages/transfers/TransfersPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { ControlsOverviewPage } from '@/pages/controls/ControlsOverviewPage';
import { AuditLogPage } from '@/pages/audit/AuditLogPage';

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
    children: [{ path: '/admin/login', element: <AdminLoginPage /> }],
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
      { path: '/admin/dashboard', element: <AdminDashboardPage /> },
      { path: '/admin/accounts', element: <AgentHierarchyPage /> },
      { path: '/admin/members/:id/bets', element: <MemberBetRecordsPage /> },
      { path: '/admin/transfers', element: <TransfersPage /> },
      { path: '/admin/reports', element: <ReportsPage /> },
      { path: '/admin/controls', element: <ControlsOverviewPage /> },
      { path: '/admin/audit', element: <AuditLogPage /> },
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
