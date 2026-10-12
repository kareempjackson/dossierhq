import { z } from 'zod';
import { recommendationStatusSchema } from './attention.js';
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

export const auditQuerySchema = z.object({
  clientId,
  tool: toolSchema.optional(),
});

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
