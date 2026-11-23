import { z } from 'zod';
import { clientListItemSchema } from './clients.js';

/** A report the command palette jumps to. */
export const shellReportSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  weekStart: z.iso.date(),
});
export type ShellReport = z.infer<typeof shellReportSchema>;

/**
 * What the chrome around every page shows, in one answer: the bell's count,
 * and what the command palette jumps to.
 */
export const shellSchema = z.object({
  /** The signed-in person's unread notifications. */
  unread: z.number().int().nonnegative(),
  /** Every client with what's current there, most urgent first. */
  clients: z.array(clientListItemSchema),
  /** Drafts to review, then reports approved and not sent yet. */
  reports: z.array(shellReportSchema),
});
export type Shell = z.infer<typeof shellSchema>;
