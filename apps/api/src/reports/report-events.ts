import type { EventOf, ReportSummary } from '@dossierhq/contracts';

/** What a round of drafting tells people; null when nothing was drafted. */
export function draftedEvent(
  drafted: ReportSummary[],
  scheduled: boolean,
): EventOf<'reports.drafted'> | null {
  const [first] = drafted;
  if (!first) return null;
  return {
    type: 'reports.drafted',
    weekStart: first.weekStart,
    count: drafted.length,
    flagged: drafted.filter((report) => report.exceptions.length > 0).length,
    scheduled,
  };
}
