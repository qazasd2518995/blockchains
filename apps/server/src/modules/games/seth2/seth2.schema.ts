import { z } from 'zod';

export const seth2ProtocolSchema = z.object({
  type: z.enum([
    'ping',
    'connectToHall',
    'reconnect',
    'getUserInfo',
    'getMachineList',
    'getMachineInfo',
    'useMachine',
    'gameRecordList',
    'gameToolsList',
    'buyFreeGame',
  ]),
  machineId: z.coerce.number().int().min(1).max(20).optional(),
  yazhu: z.coerce.number().positive().optional(),
  isFreeModel: z.coerce.number().int().min(0).max(1).optional(),
  gameModelType: z.coerce.number().int().min(0).max(1).optional(),
});

export type Seth2ProtocolInput = z.infer<typeof seth2ProtocolSchema>;
