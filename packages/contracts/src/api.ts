import { z } from 'zod';
import { recommendationStatusSchema } from './attention.js';
import { auditEntrySchema, auditKindSchema } from './connectors.js';
import { reportStatusSchema } from './reports.js';
import { toolSchema } from './sources.js';

/**
 * Request and response shapes of the HTTP API. The API validates requests with
 * these; the web app parses responses with them.
 */

/** Lists come wrapped, so pagination or totals can be added later. */
export const listOf = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item) });
export type List<T> = { data: T[] };

export const clockSchema = z.object({ now: z.iso.datetime() });
export type Clock = z.infer<typeof clockSchema>;

const clientId = z.string().min(1).max(100).optional();

// Queries -------------------------------------------------------------------

export const clientScopedQuerySchema = z.object({ clientId });

export const recentClientsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const recommendationsQuerySchema = z.object({
  clientId,
  status: recommendationStatusSchema.optional(),
});

export const reportsQuerySchema = z.object({
  clientId,
  status: reportStatusSchema.optional(),
});

/** Where a page starts, as a previous page's `older` or `newer` gave it. */
const cursor = z.string().min(1).max(500);

/** Newest first. `before` turns to older entries, `after` to newer ones. */
export const auditQuerySchema = z
  .object({
    clientId,
    kind: auditKindSchema.optional(),
    tool: toolSchema.optional(),
    before: cursor.optional(),
    after: cursor.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((query) => !(query.before && query.after), {
    message: 'Pass before or after, not both',
  });
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditCountsQuerySchema = z.object({ clientId });

/** `?ids=a,b,c`, at most 200. */
export const sourcesQuerySchema = z.object({
  ids: z
    .string()
    .transform((value) => [
      ...new Set(
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(z.string()).min(1).max(200)),
});

// Responses -----------------------------------------------------------------

/**
 * One page of the audit log, newest first. Pass `older` back as `before`, or
 * `newer` as `after`, to turn the page; each is null at that end of the log.
 */
export const auditPageSchema = listOf(auditEntrySchema).extend({
  newer: cursor.nullable(),
  older: cursor.nullable(),
});
export type AuditPage = z.infer<typeof auditPageSchema>;

// Commands ------------------------------------------------------------------

export const reportStatusUpdateSchema = z.object({
  status: reportStatusSchema,
});
export type ReportStatusUpdate = z.infer<typeof reportStatusUpdateSchema>;

export const bulkReportStatusUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  status: reportStatusSchema,
});
export type BulkReportStatusUpdate = z.infer<
  typeof bulkReportStatusUpdateSchema
>;

/**
 * Drafts this week's report for one client, or with no client for all. No
 * body at all means all.
 */
export const reportDraftRequestSchema = z.object({ clientId }).default({});
export type ReportDraftRequest = z.infer<typeof reportDraftRequestSchema>;

const questionText = z
  .string()
  .trim()
  .min(1, 'Write a question')
  .max(500, 'Keep the question under 500 characters');
const questionClient = z.string().min(1).max(100).nullable();

/** Saves a question for reports to answer; no client asks every client. */
export const reportQuestionCreateSchema = z.object({
  text: questionText,
  clientId: questionClient.default(null),
});
export type ReportQuestionCreate = z.infer<typeof reportQuestionCreateSchema>;

export const reportQuestionUpdateSchema = z
  .object({
    text: questionText.optional(),
    clientId: questionClient.optional(),
  })
  .refine(
    (update) => update.text !== undefined || update.clientId !== undefined,
    { message: 'Provide the question or who it’s for' },
  );
export type ReportQuestionUpdate = z.infer<typeof reportQuestionUpdateSchema>;

/** Attaches a recorded meeting to a client by hand. */
export const meetingAttachmentSchema = z.object({
  clientId: z.string().min(1).max(100),
});
export type MeetingAttachment = z.infer<typeof meetingAttachmentSchema>;

export const recommendationUpdateSchema = z
  .object({
    status: recommendationStatusSchema.optional(),
    title: z.string().trim().min(1, 'Title is required').max(200).optional(),
    reason: z.string().trim().min(1, 'Reason is required').max(1000).optional(),
  })
  .refine(
    (update) =>
      update.status !== undefined ||
      update.title !== undefined ||
      update.reason !== undefined,
    { message: 'Provide at least one field to update' },
  );
export type RecommendationUpdate = z.infer<typeof recommendationUpdateSchema>;
