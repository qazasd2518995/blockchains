import { z } from 'zod';
import { SETH2_RATIO_VALUES, SETH2_STAKE_VALUES } from '@bg/shared';

const operationId = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const machineId = z.coerce.number().int().min(1).max(4000);
const machinePage = z.coerce.number().int().min(1).max(8);
const money = z.coerce.number().finite().positive();
const sourceStake = z.coerce.number().int().min(1).max(10);
const sourceRatio = z.coerce
  .number()
  .refine(
    (value) => (SETH2_RATIO_VALUES as readonly number[]).includes(value),
    'Unsupported Seth 2 ratio',
  );

const protocolRead = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('connectToHall') }),
  z.object({ type: z.literal('reconnect') }),
  z.object({ type: z.literal('getUserInfo') }),
  z.object({ type: z.literal('getMachineList'), page: machinePage.default(1) }),
  z.object({ type: z.literal('getMachineInfo'), machineId }),
  z.object({ type: z.literal('gameRecordList') }),
  z.object({
    type: z.literal('useMachine'),
    machineId,
    isFreeModel: z.coerce.number().int().min(0).max(1).default(0),
  }),
]);

const protocolMoney = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('gameToolsList'),
    machineId,
    yazhu: money,
    operationId,
    isFreeModel: z.coerce.number().int().min(0).max(1).default(0),
    gameModelType: z.coerce.number().int().min(0).max(1).optional(),
  }),
  z.object({
    type: z.literal('buyFreeGame'),
    machineId,
    yazhu: money,
    operationId,
    isFreeModel: z.coerce.number().int().min(0).max(1).default(0),
    gameModelType: z.coerce.number().int().min(0).max(1).optional(),
  }),
]);

export const seth2ProtocolSchema = z.union([protocolRead, protocolMoney]);
export type Seth2ProtocolInput = z.infer<typeof seth2ProtocolSchema>;

const sourceReadData = z.record(z.unknown()).default({});
const paidSpinData = z
  .object({
    action: z.literal('spin').optional(),
    stakeValue: sourceStake,
    ratioValue: sourceRatio,
    machineId,
    operationId,
  })
  .passthrough();
const buyFeatureData = z
  .object({
    action: z.literal('buyFeature'),
    featureIndex: z.coerce.number().int().min(0).max(2),
    stakeValue: sourceStake,
    ratioValue: sourceRatio,
    machineId,
    operationId,
  })
  .passthrough();
const replayData = z
  .object({
    spinId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
    machineId: machineId.optional(),
  })
  .passthrough();
const tableIdentifier = z
  .object({
    machineId: machineId.optional(),
    roomId: machineId.optional(),
    number: machineId.optional(),
  })
  .passthrough()
  .refine(
    (value) =>
      value.machineId !== undefined || value.roomId !== undefined || value.number !== undefined,
    'Missing table identifier',
  );
const soundsSettings = z
  .object({
    background: z.boolean().optional(),
    backgroundVolume: z.number().min(0).max(1).optional(),
    effect: z.boolean().optional(),
    effectVolume: z.number().min(0).max(1).optional(),
  })
  .strict();
const settingsData = z.union([
  z
    .object({
      advancedSettings: z
        .object({
          sounds: soundsSettings.optional(),
          notify: z.boolean().optional(),
          turbo: z.boolean().optional(),
        })
        .strict()
        .optional(),
      autoPlay: z.record(z.unknown()).optional(),
      stakeIndex: z.coerce.number().int().min(0).max(9).optional(),
      ratioIndex: z.coerce.number().int().min(0).max(11).optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, 'Empty settings update'),
  z.object({
    type: z.literal('game'),
    data: z
      .object({
        turbo: z.boolean().optional(),
        notify: z.boolean().optional(),
        stopOnJackpot: z.boolean().optional(),
        backgroundVolume: z.coerce.number().min(0).max(1).optional(),
        effectVolume: z.coerce.number().min(0).max(1).optional(),
        stakeIndex: z.coerce
          .number()
          .int()
          .min(0)
          .max(SETH2_STAKE_VALUES.length - 1)
          .optional(),
        ratioIndex: z.coerce
          .number()
          .int()
          .min(0)
          .max(SETH2_RATIO_VALUES.length - 1)
          .optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, 'Empty game settings update'),
  }),
]);

export const seth2SourceSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('initial'), data: sourceReadData }),
  z.object({ event: z.literal('spin'), data: z.union([buyFeatureData, replayData, paidSpinData]) }),
  z.object({
    event: z.literal('collectFeatureSequence'),
    data: z
      .object({
        sequenceId: z
          .string()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z0-9_-]+$/),
      })
      .passthrough(),
  }),
  z.object({
    event: z.literal('closeSpin'),
    data: z
      .object({
        spinId: z
          .string()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z0-9_-]+$/),
      })
      .passthrough(),
  }),
  z.object({
    event: z.literal('updateSettings'),
    data: z.object({ settings: settingsData }).passthrough(),
  }),
  z.object({ event: z.literal('getBetRecords'), data: sourceReadData }),
  z.object({ event: z.literal('getUserReport'), data: sourceReadData }),
  z.object({
    event: z.literal('getSlotTables'),
    data: z.object({ page: machinePage.default(1), machineId: machineId.optional() }).passthrough(),
  }),
  z.object({
    event: z.literal('getSlotTableDetail'),
    data: tableIdentifier,
  }),
  z.object({
    event: z.literal('updateSlotTable'),
    data: z.union([tableIdentifier, z.object({ table: tableIdentifier }).passthrough()]),
  }),
  z.object({ event: z.literal('lockSlotTable'), data: sourceReadData }),
]);

export type Seth2SourceInput = z.infer<typeof seth2SourceSchema>;
