import { z } from 'zod';
import { reportSummarySchema } from './reports.js';
import { citedTextSchema } from './sources.js';

/** The MSP's own account. */
export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** IANA zone used for every date and time shown to this workspace. */
  timeZone: z.string(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const contractSchema = z.object({
  plan: z.string(),
  startedOn: z.iso.date(),
  renewsOn: z.iso.date(),
  monthlyFee: z.number().nonnegative(),
  currency: z.string().length(3),
  /** What the plan covers, in the contract's own words. */
  includes: z.array(z.string()),
});
export type Contract = z.infer<typeof contractSchema>;

export const clientSchema = z.object({
  /** URL-safe slug, e.g. `harbour-dental`. */
  id: z.string(),
  name: z.string(),
  industry: z.string(),
  location: z.string(),
  seats: z.number().int().nonnegative(),
  primaryContact: z.object({ name: z.string(), role: z.string() }),
  contract: contractSchema,
});
export type Client = z.infer<typeof clientSchema>;

export const deviceSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string(),
  type: z.enum(['workstation', 'laptop', 'server', 'network']),
  os: z.string(),
  /** Who uses it, when the RMM knows. */
  assignedTo: z.string().nullable(),
  lastSeenAt: z.iso.datetime(),
  patchStatus: z.enum(['current', 'pending', 'failed']),
  sourceId: z.string(),
});
export type Device = z.infer<typeof deviceSchema>;

export const meetingSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  title: z.string(),
  occurredAt: z.iso.datetime(),
  durationMinutes: z.number().int().positive(),
  attendees: z.array(
    z.object({ name: z.string(), role: z.enum(['client', 'msp']) }),
  ),
  /** What the client said they are planning. */
  planning: z.array(citedTextSchema),
  /** What the client said they are worried about. */
  concerns: z.array(citedTextSchema),
  /** What the client asked the MSP to do. */
  askedFor: z.array(citedTextSchema),
  /** The Fathom recording itself. */
  recordingSourceId: z.string(),
});
export type Meeting = z.infer<typeof meetingSchema>;

/** Something the MSP told the client it would do. */
export const commitmentSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  /** What the client was told, in plain words. */
  statement: z.string(),
  madeAt: z.iso.datetime(),
  dueOn: z.iso.date().nullable(),
  status: z.enum(['open', 'done']),
  completedAt: z.iso.datetime().nullable(),
  sourceIds: z.array(z.string()).min(1),
});
export type Commitment = z.infer<typeof commitmentSchema>;

/** One row of the clients list: the client plus what is current there. */
export const clientListItemSchema = z.object({
  client: clientSchema,
  attention: z.object({
    total: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
  }),
  lastMeetingAt: z.iso.datetime().nullable(),
  latestReport: reportSummarySchema.nullable(),
});
export type ClientListItem = z.infer<typeof clientListItemSchema>;
