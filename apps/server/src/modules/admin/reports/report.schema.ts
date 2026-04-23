import { z } from 'zod';

export const reportQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  gameId: z.string().optional(),
  agentId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const agentAnalysisQuerySchema = z.object({
  rootAgentId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  gameId: z.string().optional(),
});

export const hierarchyQuerySchema = z.object({
  parentId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  gameId: z.string().optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type AgentAnalysisQuery = z.infer<typeof agentAnalysisQuerySchema>;
export type HierarchyQuery = z.infer<typeof hierarchyQuerySchema>;
