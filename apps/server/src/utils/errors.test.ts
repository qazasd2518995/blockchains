import { describe, expect, it } from 'vitest';
import { INTERNAL_ERROR_MESSAGE, publicErrorMessage } from './errors.js';

describe('publicErrorMessage', () => {
  it('does not expose database details for server errors', () => {
    expect(
      publicErrorMessage(
        500,
        'Invalid `prisma.bet.create()` invocation: Error occurred during query execution',
      ),
    ).toBe(INTERNAL_ERROR_MESSAGE);
  });

  it('keeps actionable client error messages', () => {
    expect(publicErrorMessage(400, '無效的投注金額')).toBe('無效的投注金額');
  });
});
