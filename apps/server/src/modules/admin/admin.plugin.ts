import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../utils/errors.js';
import { adminAuthRoutes } from './auth/adminAuth.routes.js';
import { agentRoutes } from './agents/agent.routes.js';
import { memberRoutes } from './members/member.routes.js';
import { transferRoutes } from './transfers/transfer.routes.js';
import { reportRoutes } from './reports/report.routes.js';
import { controlRoutes } from './controls/controls.routes.js';
import { auditRoutes } from './audit/audit.routes.js';
import { hierarchyRoutes } from './hierarchy/hierarchy.routes.js';
import { subAccountRoutes } from './subaccounts/subaccount.routes.js';
import { announcementRoutes } from './announcements/announcement.routes.js';

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(adminAuthRoutes, { prefix: '/auth' });

  // 除 /auth 以外的 admin API 套上全域「子帳號唯讀」守門：
  // - 讀取方法（GET/HEAD/OPTIONS）放行
  // - 其他寫入方法若為 SUB_ACCOUNT 或已凍結代理 → 回 403
  await fastify.register(async (scope) => {
    scope.addHook('preHandler', async (req, reply) => {
      await fastify.authenticateAdmin(req, reply);
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
      if (req.admin?.status === 'FROZEN') {
        throw new ApiError('FORBIDDEN', 'Frozen account has read-only access');
      }
      if (req.admin?.role === 'SUB_ACCOUNT') {
        throw new ApiError('FORBIDDEN', 'Sub-account has read-only access');
      }
    });
    await scope.register(hierarchyRoutes, { prefix: '/hierarchy' });
    await scope.register(agentRoutes, { prefix: '/agents' });
    await scope.register(memberRoutes, { prefix: '/members' });
    await scope.register(transferRoutes, { prefix: '/transfers' });
    await scope.register(reportRoutes, { prefix: '/reports' });
    await scope.register(controlRoutes, { prefix: '/controls' });
    await scope.register(auditRoutes, { prefix: '/audit' });
    await scope.register(subAccountRoutes, { prefix: '/subaccounts' });
    await scope.register(announcementRoutes, { prefix: '/announcements' });
  });
}
