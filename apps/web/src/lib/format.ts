// Date, time and number formatting. One locale for the whole app; times are
// shown in the workspace's time zone, which callers pass in.

const LOCALE = 'en-GB';

/** "9 Oct, 02:14" */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}

/** "9 Oct 2026, 02:14": exact, for source lines and records. */
export function formatTimestamp(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}

/** "30 Sept 2026" for a timestamp. */
export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso));
}

/** "02:14" */
export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}

/** "30 Sep" for a timestamp. */
export function formatDayMonth(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(iso));
}

/** "Friday 9 October" */
export function formatLongDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(new Date(iso));
}

/** The calendar date at `iso` where the workspace is, as `YYYY-MM-DD`. */
export function calendarDateIn(iso: string, timeZone: string): string {
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** "31 Oct 2026" for a calendar date such as `2026-10-31`. */
export function formatCalendarDate(date: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "just now", "6 min ago", "3 h ago", "2 days ago", then the date. */
export function formatRelative(
  iso: string,
  now: string,
  timeZone: string,
): string {
  const minutes = Math.round(
    (new Date(now).getTime() - new Date(iso).getTime()) / 60_000,
  );
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
  return formatDayMonth(iso, timeZone);
}

/** "£1,840" */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Anthropic's prices and what drafting cost, in US dollars: "$4.00",
 * "$0.125", and down to "$0.0042" for less than a cent.
 */
export function formatDollars(amount: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: amount > 0 && amount < 0.01 ? 4 : 3,
  }).format(amount);
}

/** "1 thing", "2 things" */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Marlow Freight and Harbour Dental" */
export function formatList(items: string[]): string {
  return new Intl.ListFormat(LOCALE, { type: 'conjunction' }).format(items);
}

/** "5 to 11 Oct 2026", or "28 Sept to 4 Oct 2026" across months. */
export function formatDateRange(start: string, end: string): string {
  const [startText, endText] = [start, end].map(formatCalendarDate);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const startShort = sameMonth
    ? String(Number(start.slice(8)))
    : startText!.replace(/ \d{4}$/, '');
  return `${startShort} to ${endText}`;
}

/** Whole days from `now` until a calendar date; negative when past. */
export function daysUntil(date: string, now: string): number {
  const end = new Date(`${date}T00:00:00Z`).getTime();
  const start = new Date(`${now.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

/** "today", "yesterday", "24 days ago" */
export function formatDaysAgo(iso: string, now: string): string {
  const days = -daysUntil(iso.slice(0, 10), now);
  if (days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
