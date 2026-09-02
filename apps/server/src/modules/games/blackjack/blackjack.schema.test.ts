import { describe, expect, it } from 'vitest';
import {
  blackjackActionSchema,
  blackjackActiveQuerySchema,
  blackjackStartSchema,
} from './blackjack.schema.js';

describe('blackjack table schemas', () => {
  it('keeps legacy requests on the royal table', () => {
    expect(blackjackStartSchema.parse({ amount: 10 }).tableId).toBe('royal');
    expect(blackjackActionSchema.parse({ roundId: 'round-1' }).tableId).toBe('royal');
    expect(blackjackActiveQuerySchema.parse({}).tableId).toBe('royal');
  });

  it('accepts the independent classic table identity', () => {
    expect(blackjackStartSchema.parse({ amount: 10, tableId: 'classic' }).tableId).toBe('classic');
    expect(blackjackActionSchema.parse({ roundId: 'round-2', tableId: 'classic' }).tableId).toBe(
      'classic',
    );
    expect(blackjackActiveQuerySchema.parse({ tableId: 'classic' }).tableId).toBe('classic');
  });

  it('rejects unknown table identities', () => {
    expect(() => blackjackActiveQuerySchema.parse({ tableId: 'unknown' })).toThrow();
  });
});
