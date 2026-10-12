/** ISO 8601 week number of a calendar date such as `2026-10-05` (41). */
export function isoWeek(date: string): number {
  const day = new Date(`${date}T00:00:00Z`);
  // Thursday of this week decides the year the week belongs to.
  day.setUTCDate(day.getUTCDate() + 3 - ((day.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(
    firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7),
  );
  return (
    1 + Math.round((day.getTime() - firstThursday.getTime()) / 604_800_000)
  );
}
