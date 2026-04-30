import { z } from 'zod';

const adminDateInputSchema = z.string().refine((value) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  return Number.isFinite(new Date(value).getTime());
}, 'Invalid date');

export const reportQuerySchema = z.object({
  startDate: adminDateInputSchema.optional(),
  endDate: adminDateInputSchema.optional(),
  gameId: z.string().optional(),
  agentId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const agentAnalysisQuerySchema = z.object({
  rootAgentId: z.string().optional(),
  startDate: adminDateInputSchema.optional(),
  endDate: adminDateInputSchema.optional(),
  gameId: z.string().optional(),
});

export const hierarchyQuerySchema = z.object({
  parentId: z.string().optional(),
  startDate: adminDateInputSchema.optional(),
  endDate: adminDateInputSchema.optional(),
  gameId: z.string().optional(),
  username: z.string().optional(),
  settlementStatus: z.enum(['settled', 'unsettled']).optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type AgentAnalysisQuery = z.infer<typeof agentAnalysisQuerySchema>;
export type HierarchyQuery = z.infer<typeof hierarchyQuerySchema>;
