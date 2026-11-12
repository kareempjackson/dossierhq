import type {
  OutboxItem,
  Report,
  ReportDeliveryStatus,
  ReportQuestion,
  ReportSettings,
  ReportSummary,
  Source,
} from '@dossierhq/contracts';
import type { CitedFile } from '@/components/ui/cited-stack';
import { citations, sendsOn, type When } from './client-views';
import { calendarDay, dayMonth, dayMonthTime } from './format';

/**
 * Reports as the Reports pages show them, from the API's answers. Pure and
 * server-side: client components import only its types.
 */

/** "Week of 9 Nov". */
const weekOf = (weekStart: string, { timeZone, now }: When) =>
  `Week of ${calendarDay(weekStart, timeZone, now)}`;

// The shell -------------------------------------------------------------------

export type QueueItem = {
  id: string;
  clientName: string;
  /** How many things Dossier wants a person to check first. */
  checks: number;
};

/** What every Reports tab shows above the sheet, and in the tabs. */
export type ReportsData = {
  /** "Week of 9 Nov" for the newest drafts; null with none to review. */
  week: string | null;
  /** "on Mondays at 09:00"; null when approved reports go by hand. */
  sends: string | null;
  /** Drafts to review, those with exceptions first. */
  queue: QueueItem[];
  /** Approved and not gone yet. */
  approvedCount: number;
  questionCount: number;
};

export function reportsData(
  {
    queue,
    outbox,
    questions,
    settings,
    names,
  }: {
    queue: ReportSummary[];
    outbox: OutboxItem[];
    questions: ReportQuestion[];
    settings: ReportSettings | null;
    names: Map<string, string>;
  },
  when: When,
): ReportsData {
  const newest = queue
    .map((report) => report.weekStart)
    .sort()
    .at(-1);
  return {
    week: newest ? weekOf(newest, when) : null,
    sends: settings ? sendsOn(settings) : null,
    queue: queue.map((report) => ({
      id: report.id,
      clientName: names.get(report.clientId) ?? 'A client',
      checks: report.exceptions.length,
    })),
    approvedCount: outbox.length,
    questionCount: questions.length,
  };
}

// One report under review -------------------------------------------------------

export type ReviewLine = {
  id: string;
  text: string;
  /** The cited files it rests on, by number. */
  cites: number[];
  /** For an answer to a saved question, the question. */
  question?: string;
  /** Dossier is still answering it; it can't be changed yet. */
  pending: boolean;
  /** Someone reworded it. */
  edited: boolean;
};

export type ReviewView = {
  id: string;
  clientId: string;
  clientName: string;
  status: 'draft' | 'approved' | 'skipped';
  /** "16 Nov, 09:00" once it has gone; it can't change after. */
  sent: string | null;
  /** "9 Nov to 15 Nov". */
  period: string;
  glance: { label: string; value: string; note?: string }[];
  sections: { kind: string; title: string; lines: ReviewLine[] }[];
  /** Why a person should read it before it goes. */
  exceptions: string[];
  /** Lines with nothing to cite are left out when it's approved. */
  uncited: number;
  cited: (CitedFile & { url: string })[];
  to: string[];
  cc: string[];
  /** When it goes, or why it won't. */
  goes: string;
  /** Why the last try to send it failed. */
  failed: string | null;
  sender: { name: string; colour: string; logo: string | null };
  /** Clients can reply to a person, not Dossier's own address. */
  replies: boolean;
};

export function reviewView(
  report: Report,
  {
    sources,
    delivery,
    settings,
    clientName,
    workspaceName,
  }: {
    /** The report's own sources and, for older reports, the live records. */
    sources: Map<string, Source>;
    delivery: ReportDeliveryStatus | null;
    settings: ReportSettings | null;
    clientName: string;
    workspaceName: string;
  },
  when: When,
): ReviewView {
  const { timeZone, now } = when;
  const { files, cite } = citations(sources, when);
  const sections = report.sections
    .filter((section) => section.lines.length > 0)
    .map((section) => ({
      kind: section.kind,
      title: section.title,
      lines: section.lines.map((line) => ({
        id: line.id,
        text: line.text,
        cites: line.sourceIds
          .map(cite)
          .filter((number): number is number => number !== null),
        question: line.question,
        pending: line.pending ?? false,
        edited: line.original !== undefined && line.original !== line.text,
      })),
    }));
  const last = delivery?.deliveries[0];
  return {
    id: report.id,
    clientId: report.clientId,
    clientName,
    status: report.status,
    sent: report.sentAt ? dayMonthTime(report.sentAt, timeZone, now) : null,
    period: `${calendarDay(report.weekStart, timeZone, now)} to ${calendarDay(report.weekEnd, timeZone, now)}`,
    glance: report.glance,
    sections,
    exceptions: report.exceptions,
    uncited: report.sections
      .flatMap((section) => section.lines)
      .filter((line) => line.sourceIds.length === 0 && !line.pending).length,
    cited: files,
    to: delivery?.to ?? [],
    cc: delivery?.cc ?? [],
    goes: goes(report, delivery, settings, when),
    failed:
      last?.outcome === 'failed' ? (last.problem ?? 'It didn’t go.') : null,
    sender: {
      name: settings?.senderName || workspaceName,
      colour: settings?.brandColour ?? '#1f2937',
      logo: settings?.logo ?? null,
    },
    replies: Boolean(settings?.replyTo),
  };
}

function goes(
  report: Report,
  delivery: ReportDeliveryStatus | null,
  settings: ReportSettings | null,
  { timeZone, now }: When,
): string {
  if (report.sentAt) {
    return `Sent ${dayMonthTime(report.sentAt, timeZone, now)}`;
  }
  if (report.status === 'skipped') return 'Skipped: it won’t go';
  if (delivery && delivery.to.length === 0) return 'Nobody to send it to yet';
  if (delivery?.sendsAt) {
    return `Goes ${dayMonthTime(delivery.sendsAt, timeZone, now)}`;
  }
  const schedule = settings && sendsOn(settings);
  if (report.status === 'draft') {
    return schedule
      ? `Goes ${schedule}, once approved`
      : 'Goes when sent, once approved';
  }
  return 'Goes when someone sends it';
}

// Approved, waiting to go ------------------------------------------------------

export type OutboxRow = {
  id: string;
  clientId: string;
  clientName: string;
  week: string;
  /** "10 Nov". */
  approved: string;
  /** "16 Nov, 09:00", "When someone sends it", or why it can't go. */
  goes: string;
  /** It has someone to go to. */
  canSend: boolean;
  /** Why the last try didn't go. */
  failed: string | null;
};

export function outboxRows(
  items: OutboxItem[],
  names: Map<string, string>,
  when: When,
): OutboxRow[] {
  const { timeZone, now } = when;
  return items.map((item) => ({
    id: item.reportId,
    clientId: item.clientId,
    clientName: names.get(item.clientId) ?? 'A client',
    week: weekOf(item.weekStart, when),
    approved: dayMonth(item.approvedAt, timeZone, now),
    goes:
      item.recipients === 0
        ? 'Nobody to send it to'
        : item.sendsAt
          ? dayMonthTime(item.sendsAt, timeZone, now)
          : 'When someone sends it',
    canSend: item.recipients > 0,
    failed: item.failed ? (item.failed.problem ?? 'It didn’t go.') : null,
  }));
}
