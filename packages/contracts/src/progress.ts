import { z } from 'zod';

/** Work a page can wait on: tool syncs, reading past records, one answer. */
export const PROGRESS_WATCHES = ['tools', 'memory', 'ask'] as const;
export const progressWatchSchema = z.enum(PROGRESS_WATCHES);
export type ProgressWatch = z.infer<typeof progressWatchSchema>;

export const progressQuerySchema = z.object({
  watch: progressWatchSchema,
  /** The answer, for `ask`. */
  id: z.string().min(1).max(200).optional(),
});

/**
 * Where that work stands, small enough to ask every few seconds. A page
 * draws itself again when `stamp` differs from the last one it saw, or when
 * `busy` is false while it still shows the work as under way.
 */
export const progressSchema = z.object({
  busy: z.boolean(),
  stamp: z.string(),
});
export type Progress = z.infer<typeof progressSchema>;
