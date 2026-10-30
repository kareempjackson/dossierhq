import { z } from 'zod';
import { workspaceRoleSchema } from './auth.js';
import { toolSchema } from './sources.js';

/**
 * Things that happen in a workspace that someone may want to hear about.
 * The API records each one after the change it describes, and hands it to
 * whatever subscribes, such as the notifier. Each event carries what its
 * subscribers need; names are looked up when it's read, so they're current.
 */

// Connections -------------------------------------------------------------------

/** A tool that was syncing stopped. Not repeated while it stays stopped. */
const connectionFailing = z.object({
  type: z.literal('connection.failing'),
  tool: toolSchema,
  /** In plain words, e.g. "NinjaOne refused the client secret." */
  problem: z.string(),
  /** True when the fix is in its settings (credentials, permissions). */
  needsSettings: z.boolean(),
});

const connectionRecovered = z.object({
  type: z.literal('connection.recovered'),
  tool: toolSchema,
  failingSince: z.iso.datetime(),
});

// Reports -----------------------------------------------------------------------

/** Weekly reports were drafted, by hand or on schedule. */
const reportsDrafted = z.object({
  type: z.literal('reports.drafted'),
  weekStart: z.iso.date(),
  count: z.number().int().min(0),
  /** How many have exceptions a person should read before approving. */
  flagged: z.number().int().min(0),
  scheduled: z.boolean(),
});

const reportSent = z.object({
  type: z.literal('report.sent'),
  reportId: z.string(),
  clientId: z.string(),
  weekStart: z.iso.date(),
  to: z.array(z.string()),
  scheduled: z.boolean(),
});

const reportDeliveryFailed = z.object({
  type: z.literal('report.delivery-failed'),
  reportId: z.string(),
  clientId: z.string(),
  weekStart: z.iso.date(),
  problem: z.string(),
  scheduled: z.boolean(),
});

/** An approved report's time to go came, but its client has no one to send to. */
const reportNoRecipients = z.object({
  type: z.literal('report.no-recipients'),
  reportId: z.string(),
  clientId: z.string(),
  weekStart: z.iso.date(),
});

// Team ----------------------------------------------------------------------------

const memberJoined = z.object({
  type: z.literal('member.joined'),
  userId: z.string(),
  name: z.string(),
  role: workspaceRoleSchema,
});

const memberRoleChanged = z.object({
  type: z.literal('member.role-changed'),
  userId: z.string(),
  name: z.string(),
  from: workspaceRoleSchema,
  to: workspaceRoleSchema,
});

const memberRemoved = z.object({
  type: z.literal('member.removed'),
  userId: z.string(),
  name: z.string(),
});

// Security: about one person's own sign-in ---------------------------------------

const twoFactorOff = z.object({
  type: z.literal('security.two-factor-off'),
  userId: z.string(),
});

const passwordReset = z.object({
  type: z.literal('security.password-reset'),
  userId: z.string(),
});

const recoveryCodeUsed = z.object({
  type: z.literal('security.recovery-code-used'),
  userId: z.string(),
  /** Recovery codes they have left. */
  remaining: z.number().int().min(0),
});

/** Too many wrong passwords; sign-in is paused for a while. */
const lockedOut = z.object({
  type: z.literal('security.locked-out'),
  userId: z.string(),
});

// Intelligence ------------------------------------------------------------------

/** A drafting pass made new recommendations. */
const intelligenceDrafted = z.object({
  type: z.literal('intelligence.drafted'),
  /** Clients that got new drafts. */
  clients: z.number().int().min(1),
  recommendations: z.number().int().min(1),
});

/** Drafting failed for some clients in a pass. */
const intelligenceFailed = z.object({
  type: z.literal('intelligence.failed'),
  failed: z.number().int().min(1),
  /** The first failure, in plain words. */
  problem: z.string(),
});

export const domainEventSchema = z.discriminatedUnion('type', [
  connectionFailing,
  connectionRecovered,
  reportsDrafted,
  reportSent,
  reportDeliveryFailed,
  reportNoRecipients,
  memberJoined,
  memberRoleChanged,
  memberRemoved,
  twoFactorOff,
  passwordReset,
  recoveryCodeUsed,
  lockedOut,
  intelligenceDrafted,
  intelligenceFailed,
]);
export type DomainEvent = z.infer<typeof domainEventSchema>;
export type EventType = DomainEvent['type'];
/** The event of one type. */
export type EventOf<T extends EventType> = Extract<DomainEvent, { type: T }>;

export const EVENT_TYPES = domainEventSchema.options.map(
  (option) => option.shape.type.value,
) as EventType[];
export const eventTypeSchema = z.enum(
  EVENT_TYPES as [EventType, ...EventType[]],
);
