import { z } from 'zod';

/** What a pattern looks like at one of its clients. */
export const patternClientSchema = z.object({
  clientId: z.string(),
  /** The facts at this client, in a line. */
  detail: z.string(),
  sourceIds: z.array(z.string()).min(1),
});
export type PatternClient = z.infer<typeof patternClientSchema>;

/**
 * The same problem at several clients, or a risk building up across them,
 * as Claude found it in their records. Always two clients or more.
 */
export const patternSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Why it matters across these clients. */
  why: z.string(),
  /** What the MSP could do about it, once, for all of them. */
  suggestion: z.string(),
  clients: z.array(patternClientSchema).min(2),
  createdAt: z.iso.datetime(),
});
export type Pattern = z.infer<typeof patternSchema>;
