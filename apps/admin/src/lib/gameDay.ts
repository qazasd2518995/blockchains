const DAY_MS = 24 * 60 * 60 * 1000;
const GAME_DAY_START_HOUR = 7;

const taipeiFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

interface TaipeiParts {
  year: string;
  month: string;
  day: string;
  hour: number;
}

export function getCurrentGameDay(now: Date = new Date()): string {
  const parts = getTaipeiParts(now);
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.hour < GAME_DAY_START_HOUR) return shiftGameDay(dateKey, -1);
  return dateKey;
}

export function shiftGameDay(gameDay: string, days: number): string {
  const anchor = new Date(`${gameDay}T12:00:00+08:00`);
  anchor.setTime(anchor.getTime() + days * DAY_MS);
  return formatTaipeiDate(anchor);
}

export function startOfGameWeek(gameDay: string): string {
  const anchor = new Date(`${gameDay}T12:00:00+08:00`);
  const day = anchor.getUTCDay() || 7;
  return shiftGameDay(gameDay, 1 - day);
}

function formatTaipeiDate(date: Date): string {
  const parts = getTaipeiParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getTaipeiParts(date: Date): TaipeiParts {
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
