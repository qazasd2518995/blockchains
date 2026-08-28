import { describe, expect, it } from 'vitest';
import { createAgentSchema } from './agent.schema.js';

const baseAgent = {
  parentId: 'root',
  username: 'jinbaobao_exception_2',
  password: 'Password123',
  level: 1,
};

describe('createAgentSchema control exclusion', () => {
  it('accepts an explicit control-excluded line flag', () => {
    expect(
      createAgentSchema.parse({
        ...baseAgent,
        excludeFromControlSettlement: true,
      }).excludeFromControlSettlement,
    ).toBe(true);
  });

  it('does not coerce string values into the privileged flag', () => {
    expect(() =>
      createAgentSchema.parse({
        ...baseAgent,
        excludeFromControlSettlement: 'true',
      }),
    ).toThrow();
  });
});
