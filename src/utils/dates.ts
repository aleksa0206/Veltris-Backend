// Calendar dates (due dates, project dates) are `YYYY-MM-DD` stored as UTC midnight.

const DAY_MS = 24 * 60 * 60 * 1000;

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** `YYYY-MM-DD` of a stored calendar date, as written to the activity log. */
export function isoDay(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}
