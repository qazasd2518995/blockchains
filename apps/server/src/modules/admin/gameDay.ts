const GAME_DAY_START_HOUR = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const taipeiFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

interface TaipeiDateParts {
  year: string;
  month: string;
  day: string;
  hour: number;
}

export function getAdminGameDay(now: Date = new Date()): string {
  const parts = getTaipeiDateParts(now);
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.hour < GAME_DAY_START_HOUR) return shiftAdminGameDay(dateKey, -1);
  return dateKey;
}

export function getAdminGameDayWindow(now: Date = new Date()): {
  gameDay: string;
  start: Date;
  end: Date;
} {
  return getAdminGameDayWindowByDay(getAdminGameDay(now));
}

export function getAdminGameDayWindowByDay(gameDay: string): {
  gameDay: string;
  start: Date;
  end: Date;
} {
  const start = new Date(`${gameDay}T07:00:00+08:00`);
  const end = new Date(start.getTime() + DAY_MS);
  return { gameDay, start, end };
}

export function resolveAdminGameDayRange(input: {
  startDate?: string;
  endDate?: string;
}): {
  startGameDay?: string;
  endGameDay?: string;
  start?: Date;
  end?: Date;
} {
  const startGameDay = resolveDateInputToTaipeiDay(input.startDate);
  const endGameDay = resolveDateInputToTaipeiDay(input.endDate);

  const start = startGameDay ? getAdminGameDayWindowByDay(startGameDay).start : undefined;
  const endWindow = endGameDay ? getAdminGameDayWindowByDay(endGameDay) : undefined;
  const end = endWindow ? new Date(endWindow.end.getTime() - 1) : undefined;

  return { startGameDay, endGameDay, start, end };
}

export function getTaipeiDateKey(date: Date): string {
  const parts = getTaipeiDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function shiftAdminGameDay(gameDay: string, days: number): string {
  const anchor = new Date(`${gameDay}T12:00:00+08:00`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return getTaipeiDateKey(anchor);
}

function resolveDateInputToTaipeiDay(input?: string): string | undefined {
  if (!input) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return undefined;
  return getTaipeiDateKey(date);
}

function getTaipeiDateParts(date: Date): TaipeiDateParts {
  const values: Partial<Record<'year' | 'month' | 'day' | 'hour', string>> = {};
  for (const part of taipeiFormatter.formatToParts(date)) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day' || part.type === 'hour') {
      values[part.type] = part.value;
    }
  }
  return {
    year: values.year ?? '1970',
    month: values.month ?? '01',
    day: values.day ?? '01',
    hour: Number.parseInt(values.hour ?? '0', 10),
  };
}
