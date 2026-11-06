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

/**
 * Whose side someone on a ticket is on: the client's people, the MSP's,
 * anyone else (a vendor, a partner), or a system that sends mail by itself.
 */
export const ticketSideSchema = z.enum([
  'client',
  'msp',
  'outside',
  'automated',
]);
export type TicketSide = z.infer<typeof ticketSideSchema>;

/**
 * Something written on a ticket: its description, a reply or note after, or
 * one email of the conversation a ticket was raised with. A ticket raised by
 * email carries the whole email thread; each message in it is an entry, the
 * first of them the description.
 */
export const ticketEntrySchema = z.object({
  /**
   * The tool's ID for it; an email in a thread adds its place, oldest first,
   * e.g. `28104:2`. Null on entries read before Dossier kept IDs.
   */
  id: z.string().nullable().default(null),
  at: z.iso.datetime(),
  /**
   * Who wrote it, when the tool or the email says. A reply sent from a shared
   * mailbox is the technician who signed it, when one did.
   */
  author: z.string().nullable(),
  /** Their email address, when the entry says. */
  email: z.string().nullable().default(null),
  side: ticketSideSchema.nullable().default(null),
  /**
   * The shared mailbox it was written from or came in through, e.g.
   * `itsupport@harbourdental.co.uk`; null when it came straight from them.
   */
  via: z.string().nullable().default(null),
  kind: z.enum(['description', 'comment', 'email']),
  /** False for the technicians' internal notes, which the client never sees. */
  public: z.boolean(),
  /** Who an email went to and who was copied on it, by name. */
  to: z.array(z.string()).default([]),
  cc: z.array(z.string()).default([]),
  /**
   * Plain text with its paragraphs, without quoted email history or email
   * headers, and with secrets redacted. Anything that quotes it puts it on
   * one line.
   */
  text: z.string(),
});
export type TicketEntry = z.infer<typeof ticketEntrySchema>;

/**
 * Someone on a ticket, as Dossier read its conversation: who started it, and
 * everyone who took part — wrote on it, was written to or copied, or worked
 * it in the tool.
 */
export const ticketPersonSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  side: ticketSideSchema,
  role: z.enum(['reporter', 'involved']),
  /**
   * How Dossier knows: they sent one of its emails, were sent or copied on
   * one, wrote an entry in the tool, changed it in the tool, are assigned to
   * it, or are the tool's requester.
   */
  via: z.enum([
    'email',
    'recipient',
    'author',
    'activity',
    'assignee',
    'requester',
  ]),
  /** Known only from the technicians' internal notes. */
  internal: z.boolean(),
});
export type TicketPerson = z.infer<typeof ticketPersonSchema>;

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
  /**
   * Who raised it. When a shared mailbox forwarded it, the person whose email
   * started the conversation, as Dossier read it; until then, the tool's.
   */
  requester: z.string().nullable(),
  /** The technician working it, when the tool says. */
  assignedTo: z.string().nullable(),
  openedAt: z.iso.datetime(),
  /** When it last changed; `openedAt` when the tool doesn't say. */
  updatedAt: z.iso.datetime(),
  sourceId: z.string(),
  /**
   * Everything written on it, oldest first. Lists of tickets leave these out;
   * one ticket's read has them all.
   */
  entries: z.array(ticketEntrySchema).default([]),
  /** The `updatedAt` the entries were read at; null until they're read. */
  entriesAsOf: z.iso.datetime().nullable().default(null),
  /** Every entry was read: nothing older is only in the tool. */
  entriesComplete: z.boolean().default(false),
  /** Which reading of the entries this is; they're read again when it moves on. */
  entriesVersion: z.number().int().nonnegative().default(0),
  /** Everyone on it, whoever started it first; empty until it's read. */
  people: z.array(ticketPersonSchema).default([]),
  /**
   * The number of the ticket a technician merged this one into, e.g. a
   * reply that came in as its own ticket; null when it stands alone.
   */
  mergedInto: z.string().nullable().default(null),
});
export type Ticket = z.infer<typeof ticketSchema>;

/**
 * How Dossier reads a ticket's log now: 2 splits email threads into their
 * messages and reads the people off them. A ticket whose `entriesVersion` is
 * behind is read again by the next syncs, and nothing reads its entries with
 * a model until then, so no ticket is read twice.
 */
export const TICKET_ENTRIES_VERSION = 2;

/** The person who started it, as Dossier read the conversation. */
export const ticketReporter = (
  ticket: Pick<Ticket, 'people'>,
): TicketPerson | null =>
  ticket.people.find((person) => person.role === 'reporter') ?? null;

/**
 * Who worked it: the assigned technician first, then the MSP's people who
 * wrote on it or moved it along, by name. Someone at the MSP who asked for
 * the work, rather than did it, isn't one.
 */
export function ticketTechnicians(
  ticket: Pick<Ticket, 'assignedTo' | 'people'>,
): string[] {
  const names = [
    ...(ticket.assignedTo ? [ticket.assignedTo] : []),
    ...ticket.people
      .filter((person) => person.side === 'msp' && person.role === 'involved')
      .map((person) => person.name),
  ];
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** What a client said in a meeting, as Dossier read it from the record. */
export const meetingPointsSchema = z.object({
  /** What the client said they are planning. */
  planning: z.array(citedTextSchema),
  /** What the client said they are worried about. */
  concerns: z.array(citedTextSchema),
  /** What the client asked the MSP to do. */
  askedFor: z.array(citedTextSchema),
  /** When Claude last read the meeting; null until it has. */
  readAt: z.iso.datetime().nullable(),
});
export type MeetingPoints = z.infer<typeof meetingPointsSchema>;

export const meetingSchema = meetingPointsSchema.extend({
  id: z.string(),
  clientId: z.string(),
  title: z.string(),
  occurredAt: z.iso.datetime(),
  durationMinutes: z.number().int().positive(),
  attendees: z.array(
    z.object({ name: z.string(), role: z.enum(['client', 'msp']) }),
  ),
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

/** One turn of a recorded meeting: who spoke, when, and what they said. */
export const transcriptTurnSchema = z.object({
  /** From the start of the recording, `hh:mm:ss`. */
  at: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  speaker: z.string(),
  email: z.string().nullable(),
  /** The client's side or the MSP's; null when Dossier can't tell. */
  role: z.enum(['client', 'msp']).nullable(),
  /** Their words, secrets redacted. */
  text: z.string(),
});
export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>;

/** What was said in a recorded meeting with a client, turn by turn. */
export const meetingTranscriptSchema = z.object({
  meetingId: z.string(),
  clientId: z.string(),
  recordingId: z.string(),
  title: z.string(),
  occurredAt: z.iso.datetime(),
  /** The recording, to link moments to. */
  url: z.url(),
  recordingSourceId: z.string(),
  turns: z.array(transcriptTurnSchema),
});
export type MeetingTranscript = z.infer<typeof meetingTranscriptSchema>;
