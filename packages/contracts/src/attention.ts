import { z } from 'zod';

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

/** A suggested action Dossier drafted from what it read. */
export const recommendationSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  status: z.enum(['draft', 'accepted', 'dismissed']),
  title: z.string(),
  /** Why, in one line. */
  reason: z.string(),
  createdAt: z.iso.datetime(),
  sourceIds: z.array(z.string()).min(1),
});
export type Recommendation = z.infer<typeof recommendationSchema>;
