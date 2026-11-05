import { z } from 'zod';
import { executiveBriefSchema } from './styles.js';

export const attentionKindSchema = z.enum([
  'alert',
  'risk',
  'commitment',
  'connection',
]);
export type AttentionKind = z.infer<typeof attentionKindSchema>;

export const urgencySchema = z.enum(['critical', 'high', 'normal']);
export type Urgency = z.infer<typeof urgencySchema>;

/** Something at a client that needs a person to look at it, and why. */
export const attentionItemSchema = z.object({
  id: z.string(),
  /** Null for workspace-wide items, such as a failing connector. */
  clientId: z.string().nullable(),
  kind: attentionKindSchema,
  urgency: urgencySchema,
  /** The issue, in one line. */
  title: z.string(),
  raisedAt: z.iso.datetime(),
  sourceIds: z.array(z.string()).min(1),
});
export type AttentionItem = z.infer<typeof attentionItemSchema>;

export const recommendationStatusSchema = z.enum([
  'draft',
  'accepted',
  'dismissed',
]);
export type RecommendationStatus = z.infer<typeof recommendationStatusSchema>;

/** A suggested action Dossier drafted from what it read. */
export const recommendationSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  status: recommendationStatusSchema,
  title: z.string(),
  /** Why, in one line. */
  reason: z.string(),
  /** Steps a technician would take to do it, in order; may be empty. */
  suggestedActions: z.array(z.string()),
  /** What could go wrong doing it, and how to back out. Technical. */
  risk: z.string().nullable().default(null),
  /** How to confirm it worked. Technical. */
  verification: z.string().nullable().default(null),
  /**
   * The same recommendation for the client's leadership. Null until one is
   * written, or when Dossier dropped one that leaned on internal notes.
   */
  executive: executiveBriefSchema.nullable().default(null),
  /** The technical version was edited after the executive one was written. */
  executiveStale: z.boolean().default(false),
  createdAt: z.iso.datetime(),
  /** When it was accepted or dismissed; null while it is a draft. */
  decidedAt: z.iso.datetime().nullable(),
  sourceIds: z.array(z.string()).min(1),
});
export type Recommendation = z.infer<typeof recommendationSchema>;
