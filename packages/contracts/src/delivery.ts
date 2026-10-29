import { z } from 'zod';

/** A time each week, in the workspace's time zone. `weekday` 1 is Monday. */
export const weeklyTimeSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  hour: z.number().int().min(0).max(23),
});
export type WeeklyTime = z.infer<typeof weeklyTimeSchema>;

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** "Friday at 16:00". */
export const weeklyTimeLabel = ({ weekday, hour }: WeeklyTime) =>
  `${WEEKDAY_NAMES[weekday - 1]} at ${String(hour).padStart(2, '0')}:00`;

/** Logos go inside each email, so they're kept small. */
export const LOGO_MAX_BYTES = 256 * 1024;
/** What every email client shows. SVG isn't: Gmail and Outlook drop it. */
export const LOGO_TYPES = ['image/png', 'image/jpeg'] as const;
export const logoTypeSchema = z.enum(LOGO_TYPES);
export type LogoType = z.infer<typeof logoTypeSchema>;

export const DEFAULT_BRAND_COLOUR = '#1f2937';

/** How weekly reports look when they go out, and when they're drafted and sent. */
export const reportSettingsSchema = z.object({
  /** Who the email says it's from. Empty uses the workspace's name. */
  senderName: z.string(),
  /** Where clients' replies go; null sends them to Dossier's own address. */
  replyTo: z.email().nullable(),
  /** `#rrggbb`, for the email's header and links. */
  brandColour: z.string().regex(/^#[0-9a-f]{6}$/),
  /** The logo as a `data:` URL, or null for the sender's name in its place. */
  logo: z.string().nullable(),
  /** When Dossier drafts every client's report; null drafts on request only. */
  draftAt: weeklyTimeSchema.nullable(),
  /**
   * When approved reports go out; one approved after that goes at once.
   * Null sends only when someone presses Send.
   */
  sendAt: weeklyTimeSchema.nullable(),
});
export type ReportSettings = z.infer<typeof reportSettingsSchema>;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

export const reportSettingsUpdateSchema = z.object({
  senderName: z
    .string()
    .trim()
    .max(100, 'Keep the sender’s name under 100 characters'),
  replyTo: z
    .union([z.literal(''), email])
    .nullable()
    .transform((value) => value || null),
  brandColour: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^#[0-9a-f]{6}$/, 'Choose a colour like #1f6feb'),
  draftAt: weeklyTimeSchema.nullable(),
  sendAt: weeklyTimeSchema.nullable(),
});
export type ReportSettingsUpdate = z.input<typeof reportSettingsUpdateSchema>;

/** Someone a client's weekly report goes to. */
export const recipientSchema = z.object({
  name: z.string(),
  email: z.email(),
  /** Copied in (cc) rather than addressed. */
  copy: z.boolean(),
});
export type Recipient = z.infer<typeof recipientSchema>;

export const RECIPIENTS_MAX = 20;

/** Replaces a client's recipients, in the order given. */
export const recipientsUpdateSchema = z.object({
  recipients: z
    .array(
      z.object({
        name: z.string().trim().max(100, 'Keep names under 100 characters'),
        email,
        copy: z.boolean().default(false),
      }),
    )
    .max(RECIPIENTS_MAX, `Add at most ${RECIPIENTS_MAX} people`)
    .refine(
      (recipients) =>
        new Set(recipients.map((r) => r.email)).size === recipients.length,
      { message: 'Each address can be on the list once' },
    )
    .refine(
      (recipients) =>
        recipients.length === 0 || recipients.some((r) => !r.copy),
      { message: 'Address the report to someone, not only copies' },
    ),
});
export type RecipientsUpdate = z.input<typeof recipientsUpdateSchema>;

/** One time Dossier sent a report, or tried to. */
export const reportDeliverySchema = z.object({
  id: z.string(),
  reportId: z.string(),
  clientId: z.string(),
  at: z.iso.datetime(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  outcome: z.enum(['sent', 'failed']),
  /** Why it didn't go, in words a person can act on. */
  problem: z.string().nullable(),
  /** Who pressed Send; null when it went on schedule. */
  sentBy: z
    .object({ userId: z.string().nullable(), name: z.string() })
    .nullable(),
});
export type ReportDelivery = z.infer<typeof reportDeliverySchema>;

/** The email a report goes out as, to look at before it does. */
export const reportEmailSchema = z.object({
  from: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  replyTo: z.string().nullable(),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
});
export type ReportEmail = z.infer<typeof reportEmailSchema>;

/** Where one report stands on its way to the client. */
export const reportDeliveryStatusSchema = z.object({
  /** Who it goes to, as the client's recipients stand now. */
  to: z.array(z.string()),
  cc: z.array(z.string()),
  /** The workspace's sending time; null when reports go when someone sends them. */
  sendAt: weeklyTimeSchema.nullable(),
  /**
   * When this report goes out on schedule. Null unless it's approved and
   * waiting: when it has gone, has no recipients, failed before (someone
   * sends it again), or was approved before sending was turned on.
   */
  sendsAt: z.iso.datetime().nullable(),
  /** Every try, newest first. */
  deliveries: z.array(reportDeliverySchema),
});
export type ReportDeliveryStatus = z.infer<typeof reportDeliveryStatusSchema>;

/** An approved report that hasn't gone to its client yet. */
export const outboxItemSchema = z.object({
  reportId: z.string(),
  clientId: z.string(),
  weekStart: z.iso.date(),
  approvedAt: z.iso.datetime(),
  /** As in ReportDeliveryStatus. */
  sendsAt: z.iso.datetime().nullable(),
  recipients: z.number().int(),
  /** The last try, if it failed. */
  failed: reportDeliverySchema.nullable(),
});
export type OutboxItem = z.infer<typeof outboxItemSchema>;
