import { z } from 'zod';
import { sourceSchema } from './sources.js';

export const reportStatusSchema = z.enum(['draft', 'approved', 'skipped']);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

/** One line of a report. An empty `sourceIds` is left out on approval. */
export const reportLineSchema = z.object({
  id: z.string(),
  text: z.string(),
  sourceIds: z.array(z.string()),
  /** For an answer to a saved question, the question, shown before it. */
  question: z.string().optional(),
  /** True while Dossier is still answering the question. */
  pending: z.boolean().optional(),
});
export type ReportLine = z.infer<typeof reportLineSchema>;

export const reportSectionKindSchema = z.enum([
  'needs-attention',
  'recommended',
  'summary',
  'questions',
  'devices',
  'alerts',
  'tickets',
  'changes',
  'next-week',
]);
export type ReportSectionKind = z.infer<typeof reportSectionKindSchema>;

export const reportSectionSchema = z.object({
  kind: reportSectionKindSchema,
  title: z.string(),
  lines: z.array(reportLineSchema),
});
export type ReportSection = z.infer<typeof reportSectionSchema>;

/** What list views need: no report body. */
export const reportSummarySchema = z.object({
  id: z.string(),
  clientId: z.string(),
  weekStart: z.iso.date(),
  weekEnd: z.iso.date(),
  status: reportStatusSchema,
  generatedAt: z.iso.datetime(),
  /** Why a person should read it before it goes out. Empty means clean. */
  exceptions: z.array(z.string()),
  approvedAt: z.iso.datetime().nullable(),
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
