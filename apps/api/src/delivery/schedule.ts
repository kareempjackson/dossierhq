import type { WeeklyTime } from '@dossierhq/contracts';
import { addDays, weekOf } from '../reports/drafter.js';

/** The instant it is `hour`:00 on `date` (`YYYY-MM-DD`) in `timeZone`. */
export function zonedInstant(
  date: string,
  hour: number,
  timeZone: string,
): string {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const wanted = Date.UTC(year, month - 1, day, hour);
  // The offset depends on the instant, so settle it in two steps; a clock
  // change between the guess and the answer moves it once more.
  let instant = wanted - offsetAt(wanted, timeZone);
  instant = wanted - offsetAt(instant, timeZone);
  return new Date(instant).toISOString();
}

/** How far ahead of UTC `timeZone` is at `instant`, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return local - (instant - (instant % 1000));
}

/**
 * When `at` falls in the Monday-to-Sunday week that holds `instant`, in the
 * workspace's time zone.
 */
export function inWeekOf(
  instant: string,
  at: WeeklyTime,
  timeZone: string,
): string {
  const { start } = weekOf(instant, timeZone);
  return zonedInstant(addDays(start, at.weekday - 1), at.hour, timeZone);
}

/**
 * When a report approved at `approvedAt` goes out: at that week's sending
 * time, or at once if that has passed.
 */
export function sendsAt(
  approvedAt: string,
  at: WeeklyTime,
  timeZone: string,
): string {
  const scheduled = inWeekOf(approvedAt, at, timeZone);
  return Date.parse(scheduled) > Date.parse(approvedAt)
    ? scheduled
    : new Date(approvedAt).toISOString();
}

/** True once `instant` has come, as of `now`. */
export const reached = (instant: string, now: string) =>
  Date.parse(instant) <= Date.parse(now);
