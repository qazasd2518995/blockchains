import { describe, expect, it } from 'vitest';
import { getAdminGameDay, getAdminGameDayWindowByDay, resolveAdminGameDayRange } from './gameDay.js';

describe('admin game day', () => {
  it('rolls over at 07:00 Asia/Taipei', () => {
    expect(getAdminGameDay(new Date('2026-05-20T22:59:59.999Z'))).toBe('2026-05-20');
    expect(getAdminGameDay(new Date('2026-05-20T23:00:00.000Z'))).toBe('2026-05-21');
  });

  it('builds report windows from 07:00 to the next 07:00 Asia/Taipei', () => {
    const window = getAdminGameDayWindowByDay('2026-05-20');

    expect(window.start.toISOString()).toBe('2026-05-19T23:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-05-20T23:00:00.000Z');
  });

  it('resolves inclusive report date ranges by game day', () => {
    const range = resolveAdminGameDayRange({
      startDate: '2026-05-20',
      endDate: '2026-05-20',
    });

    expect(range.start?.toISOString()).toBe('2026-05-19T23:00:00.000Z');
    expect(range.end?.toISOString()).toBe('2026-05-20T22:59:59.999Z');
  });
});
