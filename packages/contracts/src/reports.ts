import { z } from 'zod';
import { sourceSchema } from './sources.js';

export const reportStatusSchema = z.enum(['draft', 'approved', 'skipped']);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

/**
 * Who a report is written for. An executive's is the brief: how the week
 * went and what it means for the business, in plain words. A technician's
 * is the detail: alerts, devices, ticket numbers and statuses. A client's
 * next report is written for whoever its last one was.
 */
export const reportAudienceSchema = z.enum(['executive', 'technician']);
export type ReportAudience = z.infer<typeof reportAudienceSchema>;

/** One line of a report. An empty `sourceIds` is left out on approval. */
export const reportLineSchema = z.object({
  id: z.string(),
  text: z.string(),
  sourceIds: z.array(z.string()),
  /** For an answer to a saved question, the question, shown before it. */
  question: z.string().optional(),
  /** True while Dossier is still answering the question. */
  pending: z.boolean().optional(),
  /** The wording Dossier drafted, kept once someone edits the line. */
  original: z.string().optional(),
});
export type ReportLine = z.infer<typeof reportLineSchema>;

export const reportSectionKindSchema = z.enum([
  // The brief, for the client's leadership.
  'brief',
  'from-you',
  'done',
  'watching',
  'coming-up',
  // The details, for whoever looks after IT there.
  'questions',
  'devices',
  'alerts',
  'tickets',
  // Reports drafted before the brief came first, kept as they were.
  'needs-attention',
  'recommended',
  'summary',
  'changes',
  'next-week',
]);
export type ReportSectionKind = z.infer<typeof reportSectionKindSchema>;

/**
 * Which part of the report a section is in: the brief a leader can stop
 * after, or the details below it. Only reports drafted with both, before
 * each was written for one reader, have parts.
 */
export const reportPartSchema = z.enum(['brief', 'details']);
export type ReportPart = z.infer<typeof reportPartSchema>;

export const reportSectionSchema = z.object({
  kind: reportSectionKindSchema,
  title: z.string(),
  part: reportPartSchema.optional(),
  lines: z.array(reportLineSchema),
});
export type ReportSection = z.infer<typeof reportSectionSchema>;

/** Sections the at-a-glance figures come after, when they lead the report. */
const BEFORE_GLANCE = new Set<ReportSectionKind>(['brief', 'from-you']);

/**
 * Where the at-a-glance figures go among the sections a report shows: after
 * the week in brief and what's needed from the client, or first in reports
 * drafted before those.
 */
export function glanceAt(sections: { kind: ReportSectionKind }[]): number {
  let at = 0;
  while (at < sections.length && BEFORE_GLANCE.has(sections[at]!.kind)) at++;
  return at;
}

/**
 * Where the details start among the sections a report shows, to mark them
 * off from the brief; null when there's no brief above them to mark them
 * off from.
 */
export function detailsAt(
  sections: { part?: ReportPart | undefined }[],
): number | null {
  const at = sections.findIndex((section) => section.part === 'details');
  return at > 0 ? at : null;
}

/** What list views need: no report body. */
export const reportSummarySchema = z.object({
  id: z.string(),
  clientId: z.string(),
  weekStart: z.iso.date(),
  weekEnd: z.iso.date(),
  status: reportStatusSchema,
  /** Executive for reports drafted before there was a choice. */
  audience: reportAudienceSchema.default('executive'),
  generatedAt: z.iso.datetime(),
  /** Why a person should read it before it goes out. Empty means clean. */
  exceptions: z.array(z.string()),
  approvedAt: z.iso.datetime().nullable(),
  /** When someone last changed its lines; null while it's as drafted. */
  editedAt: z.iso.datetime().nullable(),
  /** When it went to the client. A sent report stays as it went out. */
  sentAt: z.iso.datetime().nullable(),
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;

export const reportSchema = reportSummarySchema.extend({
  title: z.string(),
  /** The at-a-glance strip, e.g. `{ label: 'Devices', value: '42' }`. */
  glance: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      note: z.string().optional(),
    }),
  ),
  sections: z.array(reportSectionSchema),
  /**
   * The records the report cites, as they stood when it was drafted, so its
   * citations hold after a sync changes or drops them. Citations missing here
   * are to records Dossier still holds.
   */
  sources: z.array(sourceSchema),
});
export type Report = z.infer<typeof reportSchema>;

/**
 * A question the MSP wants weekly reports to answer, such as "Is anyone
 * still on Windows 10?". Dossier answers it from the client's records.
 */
export const reportQuestionSchema = z.object({
  id: z.string(),
  /** Null asks it in every client's report. */
  clientId: z.string().nullable(),
  text: z.string(),
  createdAt: z.iso.datetime(),
});
export type ReportQuestion = z.infer<typeof reportQuestionSchema>;
