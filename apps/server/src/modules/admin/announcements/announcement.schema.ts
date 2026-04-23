import { z } from 'zod';

export const createAnnouncementSchema = z.object({
  content: z.string().min(1).max(500),
  kind: z.enum(['marquee', 'popup']).default('marquee'),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export const updateAnnouncementSchema = z.object({
  content: z.string().min(1).max(500).optional(),
  kind: z.enum(['marquee', 'popup']).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

export const toggleAnnouncementSchema = z.object({
  isActive: z.boolean(),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
