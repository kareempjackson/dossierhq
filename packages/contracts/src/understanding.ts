import { z } from 'zod';
import { citedTextSchema } from './sources.js';
import { executiveBriefSchema } from './styles.js';

/** What a ticket is about, broadly. */
export const TICKET_CATEGORIES = [
  'email',
  'microsoft-365',
  'accounts',
  'endpoint',
  'server',
  'network',
  'printing',
  'backup',
  'security',
  'software',
  'hardware',
  'phones',
  'other',
] as const;
export const ticketCategorySchema = z.enum(TICKET_CATEGORIES);
export type TicketCategory = z.infer<typeof ticketCategorySchema>;

export const TICKET_CATEGORY_NAMES: Record<TicketCategory, string> = {
  email: 'Email',
  'microsoft-365': 'Microsoft 365',
  accounts: 'Accounts and access',
  endpoint: 'Computers',
  server: 'Servers',
  network: 'Network',
  printing: 'Printing',
  backup: 'Backup',
  security: 'Security',
  software: 'Software',
  hardware: 'Hardware',
  phones: 'Phones',
  other: 'Other',
};

/** Where a ticket ended up. */
export const ticketOutcomeSchema = z.enum([
  'resolved',
  'workaround',
  'unresolved',
  'open',
]);
export type TicketOutcome = z.infer<typeof ticketOutcomeSchema>;

/** How the client sounds in what they wrote. */
export const ticketSentimentSchema = z.enum([
  'positive',
  'calm',
  'frustrated',
  'angry',
  'unknown',
]);
export type TicketSentiment = z.infer<typeof ticketSentimentSchema>;

/** A line Dossier read off a ticket, and whether it rests on internal notes. */
export const insightLineSchema = z.object({
  text: z.string(),
  /** It rests on the MSP's internal notes, which the client never saw. */
  internal: z.boolean(),
});
export type InsightLine = z.infer<typeof insightLineSchema>;

/**
 * What Dossier understood from a ticket's whole conversation, read once on
 * the reading model. The technical read is for the MSP's team; `executive`
 * is a status for the client's leadership, from what the client saw.
 */
export const ticketInsightSchema = z.object({
  ticketId: z.string(),
  clientId: z.string(),
  /** What happened and where it stands, in a line or two. */
  summary: z.string(),
  /** The problem, named so the same one reads the same at any client. */
  issue: z.string(),
  category: ticketCategorySchema,
  symptoms: z.array(z.string()),
  tried: z.array(insightLineSchema),
  rootCause: insightLineSchema.nullable(),
  resolution: insightLineSchema.nullable(),
  outcome: ticketOutcomeSchema,
  sentiment: ticketSentimentSchema,
  /** People named on it: the client's and the MSP's. */
  people: z.array(
    z.object({ name: z.string(), role: z.enum(['client', 'msp']) }),
  ),
  /** The client's devices it concerns. */
  deviceIds: z.array(z.string()),
  /** What's still owed, and by whom. */
  followUps: z.array(
    insightLineSchema.extend({ owner: z.enum(['msp', 'client']) }),
  ),
  executive: executiveBriefSchema.nullable(),
  /** Internal notes were read too. */
  withInternal: z.boolean(),
  readAt: z.iso.datetime(),
  model: z.string(),
});
export type TicketInsight = z.infer<typeof ticketInsightSchema>;

/** A ticket like another one, found by meaning, with how it went. */
export const similarTicketSchema = z.object({
  ticketId: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  number: z.string(),
  subject: z.string(),
  openedAt: z.iso.datetime(),
  outcome: ticketOutcomeSchema.nullable(),
  /** How it was fixed, when Dossier has read it and it was. */
  resolution: z.string().nullable(),
  sourceId: z.string().nullable(),
  /** Still in NinjaOne's sync; else only Dossier's memory has it. */
  live: z.boolean(),
  /** How alike by meaning, 0 to 1; null when found by words alone. */
  similarity: z.number().nullable(),
});
export type SimilarTicket = z.infer<typeof similarTicketSchema>;

/** `GET /tickets/:id/insight`. */
export const ticketInsightViewSchema = z.object({
  insight: ticketInsightSchema.nullable(),
  similar: z.array(similarTicketSchema),
  /** Dossier reads tickets here: tickets are shared and reading is on. */
  reading: z.boolean(),
});
export type TicketInsightView = z.infer<typeof ticketInsightViewSchema>;

/** How someone has sounded lately, across their tickets and meetings. */
export const toneTrendSchema = z.enum([
  'improving',
  'steady',
  'worsening',
  'unknown',
]);
export type ToneTrend = z.infer<typeof toneTrendSchema>;

/**
 * What Dossier read about one person at a client, from their tickets, the
 * devices they use and what they said in meetings. Every line cites the
 * records it rests on. The executive version says how IT is affecting their
 * work and what's being done, and never how they feel.
 */
export const personProfileSchema = z.object({
  clientId: z.string(),
  /** Their key, as their page's address has it. */
  personKey: z.string(),
  name: z.string(),
  summary: z.string(),
  /** Trouble that keeps coming back. */
  recurring: z.array(citedTextSchema),
  /** How their devices are doing. */
  devices: z.array(citedTextSchema),
  /** For the MSP's team only. */
  tone: z.object({ trend: toneTrendSchema, note: z.string().nullable() }),
  /** What's owed to them, or by them. */
  openLoops: z.array(citedTextSchema),
  executive: executiveBriefSchema.nullable(),
  withInternal: z.boolean(),
  readAt: z.iso.datetime(),
  model: z.string(),
});
export type PersonProfile = z.infer<typeof personProfileSchema>;

/** Whether a recurring issue is new, growing, holding or fading. */
export const themeTrendSchema = z.enum(['new', 'growing', 'steady', 'fading']);
export type ThemeTrend = z.infer<typeof themeTrendSchema>;

/**
 * Trouble that keeps coming back at a client: two tickets or more about the
 * same thing, found in what was read off them. The technical version is for
 * the MSP's team; `executive` for the client's leadership.
 */
export const clientThemeSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  title: z.string(),
  /** What keeps happening and what it has in common, in a line or two. */
  summary: z.string(),
  trend: themeTrendSchema,
  /** The tickets it rests on, two or more. */
  ticketIds: z.array(z.string()).min(2),
  /** Their sources, to cite. */
  sourceIds: z.array(z.string()).min(2),
  firstSeen: z.iso.datetime(),
  lastSeen: z.iso.datetime(),
  executive: executiveBriefSchema.nullable(),
  /** It rests on reads of internal notes: hidden while they aren't shared. */
  withInternal: z.boolean().default(false),
  createdAt: z.iso.datetime(),
});
export type ClientTheme = z.infer<typeof clientThemeSchema>;
