import { z } from 'zod';
import { urgencySchema } from './attention.js';
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

/**
 * A client of the MSP. Clients come from the tools: NinjaOne organisations and
 * Hudu companies create them, and matching names join them up. Details no
 * connected tool knows are null.
 */
export const clientSchema = z.object({
  /** URL-safe slug, e.g. `harbour-dental`. */
  id: z.string(),
  name: z.string(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  seats: z.number().int().nonnegative().nullable(),
  primaryContact: z.object({ name: z.string(), role: z.string() }).nullable(),
  contract: contractSchema.nullable(),
  /** Email and web domains, used to match meetings, e.g. `harbourdental.co.uk`. */
  domains: z.array(z.string()),
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

/** A helpdesk ticket for a client, as the ticketing tool has it. */
export const ticketSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  /** The ticket's number in its tool, e.g. `4821`. */
  number: z.string(),
  subject: z.string(),
  /** The tool's name for where it's at, e.g. "Open" or "Waiting on client". */
  status: z.string(),
  /** False once it is resolved or closed. */
  open: z.boolean(),
  /** The tool's priority and severity, as one urgency. */
  urgency: urgencySchema,
  /** Who raised it, when the tool says. */
  requester: z.string().nullable(),
  /** The technician working it, when the tool says. */
  assignedTo: z.string().nullable(),
  openedAt: z.iso.datetime(),
  /** When it last changed; `openedAt` when the tool doesn't say. */
  updatedAt: z.iso.datetime(),
  sourceId: z.string(),
});
export type Ticket = z.infer<typeof ticketSchema>;

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

/**
 * A recorded meeting the last Fathom sync couldn't match to a client, for
 * someone to attach to the right one by hand.
 */
export const unattachedMeetingSchema = z.object({
  /** The ID the meeting takes once it's attached. */
  id: z.string(),
  title: z.string(),
  occurredAt: z.iso.datetime(),
  durationMinutes: z.number().int().positive(),
  /** Everyone invited, by name or email. */
  attendees: z.array(z.string()),
  /** The outside invitees' email domains, e.g. `harbourdental.co.uk`. */
  domains: z.array(z.string()),
  /** The recording, in Fathom. */
  url: z.string(),
});
export type UnattachedMeeting = z.infer<typeof unattachedMeetingSchema>;

/** Meetings to attach, and the ones already attached by hand. */
export const meetingAttachmentsSchema = z.object({
  /** Newest first. */
  unattached: z.array(unattachedMeetingSchema),
  /** Meeting ID → the client it was attached to by hand. */
  attached: z.record(z.string(), z.string()),
});
export type MeetingAttachments = z.infer<typeof meetingAttachmentsSchema>;

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
