import { z } from 'zod';
import { attentionItemSchema } from './attention.js';
import { deviceSchema, meetingPointsSchema, ticketSchema } from './clients.js';

/**
 * Someone who works at a client: an end user, in MSP terms. No connected tool
 * lists them all, so Dossier finds them in what the tools do say: who signs
 * in to each device, who raises tickets, who comes to meetings, and who the
 * primary contact is. Spellings that differ only in case, spacing,
 * punctuation or a title are one person, so NinjaOne's `RochelleKing`, a
 * ticket's "Rochelle  King" and `rochelle.king@…` meet. The MSP's own people
 * (ticket assignees, its side of meetings, members' emails) and automated
 * senders such as `noreply@…` are left out; the primary contact never is.
 */
export const endUserSchema = z.object({
  /** URL-safe, and stable while the tools spell them the same, e.g. `priyanair`. */
  id: z.string(),
  clientId: z.string(),
  /**
   * The fullest spelling any tool has, e.g. "Priya Nair" over `PriyaNair`.
   * A sign-in that is all there is gets spaced: `KiaLewis` is "Kia Lewis".
   */
  name: z.string(),
  /** Their job, when they are the client's primary contact. */
  role: z.string().nullable(),
  primaryContact: z.boolean(),
  /** When a tool has it, e.g. a ticket raised by email. */
  email: z.string().nullable(),
  /** Sign-ins NinjaOne saw on their devices, where spelled unlike their name. */
  signIns: z.array(z.string()),
  /** The devices they sign in to, by ID. */
  deviceIds: z.array(z.string()),
  tickets: z.number().int().nonnegative(),
  openTickets: z.number().int().nonnegative(),
  /** Recorded meetings and notes they were in. */
  meetings: z.number().int().nonnegative(),
  /** When they last raised a ticket or met the MSP; null if neither. */
  lastContactAt: z.iso.datetime().nullable(),
});
export type EndUser = z.infer<typeof endUserSchema>;

/** A recorded meeting or notes someone was in. */
export const endUserMeetingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('meeting'),
    id: z.string(),
    title: z.string(),
    occurredAt: z.iso.datetime(),
    /**
     * The plans, concerns and asks Dossier read from the meeting that rest on
     * this person's own words in the recording.
     */
    said: meetingPointsSchema,
  }),
  /** Notes name who was there, but not who said what. */
  z.object({
    kind: z.literal('notes'),
    id: z.string(),
    title: z.string(),
    occurredOn: z.iso.date(),
  }),
]);
export type EndUserMeeting = z.infer<typeof endUserMeetingSchema>;

/** `GET /clients/:id/users/:userId`: one person and everything about them. */
export const endUserDetailSchema = z.object({
  user: endUserSchema,
  /** Devices they sign in to, needing work first. */
  devices: z.array(deviceSchema),
  /** Tickets they raised: open first (most urgent, then latest), then closed. */
  tickets: z.array(ticketSchema),
  /** Newest first. */
  meetings: z.array(endUserMeetingSchema),
  /** What needs attention on their devices and tickets, most urgent first. */
  attention: z.array(attentionItemSchema),
});
export type EndUserDetail = z.infer<typeof endUserDetailSchema>;
