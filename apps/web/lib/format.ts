/**
 * Dates and counts as the screens write them. Times are always shown in the
 * workspace's time zone, never the server's or the browser's.
 */

const DAY_MS = 86_400_000;

/** "2026-11-05": the calendar day an instant falls on in a zone. */
export function dayIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(at);
}

/** "30 Oct", or "16 Nov 2025" when it isn't this year. */
export function dayMonth(at: string, timeZone: string, now: Date): string {
  const date = new Date(at);
  const sameYear =
    dayIn(date, timeZone).slice(0, 4) === dayIn(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    timeZone,
  }).format(date);
}

/**
 * A calendar day (`yyyy-mm-dd`), such as a renewal date, as "30 Oct" or
 * "16 Nov 2025". It's a day, not a moment, so no zone moves it.
 */
export function calendarDay(day: string, timeZone: string, now: Date): string {
  const sameYear = day.slice(0, 4) === dayIn(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/** "30 Oct, 14:05", for a moment worth the time of day. */
export function dayMonthTime(at: string, timeZone: string, now: Date): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(at));
  return `${dayMonth(at, timeZone, now)}, ${time}`;
}

/** "Thursday 5 November 2026, 14:05 AST", for a title attribute. */
export function fullTime(at: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(at));
}

/** "just now", "4 min ago", "3 h ago", "yesterday", "5 days ago", then the date. */
export function ago(at: string, now: Date, timeZone: string): string {
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - Date.parse(at)) / 60_000),
  );
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = daysBetween(dayIn(new Date(at), timeZone), dayIn(now, timeZone));
  if (days <= 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return dayMonth(at, timeZone, now);
}

/**
 * Whole days from today to a calendar day (`yyyy-mm-dd`) in the zone:
 * 0 today, 1 tomorrow, negative once it has passed.
 */
export function daysUntil(day: string, timeZone: string, now: Date): number {
  return daysBetween(dayIn(now, timeZone), day);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** "1 device", "3 devices". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
