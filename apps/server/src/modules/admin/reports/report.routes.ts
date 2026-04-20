import type { FastifyInstance } from 'fastify';
import { ReportService } from './report.service.js';
import { reportQuerySchema, agentAnalysisQuerySchema } from './report.schema.js';

export async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new ReportService(fastify.prisma);

  fastify.get('/', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const q = reportQuerySchema.parse(req.query);
    return service.listBets(req.admin, q);
  });

  fastify.get('/agent-analysis', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const q = agentAnalysisQuerySchema.parse(req.query);
    return service.agentAnalysis(req.admin, q);
  });

  fastify.get('/hierarchy', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return service.hierarchyAnalysis(req.admin, {
      parentId: q.parentId,
      startDate: q.startDate,
      endDate: q.endDate,
      gameId: q.gameId,
    });
  });
}
