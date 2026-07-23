import { GameId } from '@bg/shared';
import { describe, expect, it } from 'vitest';
import { createAgentSchema } from './agents/agent.schema.js';
import { createMemberSchema } from './members/member.schema.js';

describe('betting limit request schemas', () => {
  it('accepts multiple authorized ranges per game when creating an agent', () => {
    const result = createAgentSchema.safeParse({
      parentId: 'parent-1',
      username: 'child_agent',
      password: 'password123',
      level: 2,
      bettingLimits: {
        [GameId.DICE]: ['range_100_10000', 'range_1000_10000'],
      },
    });

    expect(result.success).toBe(true);
  });

  it('keeps member betting limits single-select', () => {
    const result = createMemberSchema.safeParse({
      agentId: 'agent-1',
      username: 'member_1',
      password: 'password123',
      bettingLimits: {
        [GameId.DICE]: ['range_100_10000', 'range_1000_10000'],
      },
    });

    expect(result.success).toBe(false);
  });
});
