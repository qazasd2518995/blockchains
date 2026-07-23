import { describe, expect, it } from 'vitest';
import { manualDetectionControlSchema } from './controls.schema.js';

const baseInput = {
  scope: 'ALL' as const,
  controlMode: 'lifecycle_path' as const,
  controlPercentage: 50,
  lineFreezeThreshold: '50000',
};

describe('manualDetectionControlSchema generated lifecycle paths', () => {
  it('accepts a generated path with up to 100 fine-grained stages', () => {
    const lifecycleSteps = Array.from({ length: 99 }, (_, index) => 99 - index).concat(0);
    const result = manualDetectionControlSchema.parse({ ...baseInput, lifecycleSteps });

    expect(result.lifecycleSteps).toHaveLength(100);
    expect(result.lifecycleSteps?.at(-1)).toBe(0);
  });

  it('requires generated paths to finish at zero', () => {
    const result = manualDetectionControlSchema.safeParse({
      ...baseInput,
      lifecycleSteps: [95, 97, 90],
    });

    expect(result.success).toBe(false);
  });

  it('continues to accept the existing preset-template input', () => {
    const result = manualDetectionControlSchema.parse({
      ...baseInput,
      lifecycleTemplateKeys: ['FIVE_NO_RECOVERY'],
    });

    expect(result.lifecycleTemplateKeys).toEqual(['FIVE_NO_RECOVERY']);
  });
});
