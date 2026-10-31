// Dates for staff, who may be anywhere: shown in UTC, and said so.

const LOCALE = 'en-GB';

/** "9 Oct, 02:14" in UTC. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** "9 Oct 2026, 02:14 UTC": exact, for titles. */
export function formatTimestamp(iso: string): string {
  return `${new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(new Date(iso))} UTC`;
}

/** "30 Sept 2026" in UTC. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** A time as a <time> element: the short form, with the exact one on hover. */
export function When({ iso, date = false }: { iso: string; date?: boolean }) {
  return (
    <time dateTime={iso} title={formatTimestamp(iso)}>
      {date ? formatDate(iso) : formatDateTime(iso)}
    </time>
  );
}
