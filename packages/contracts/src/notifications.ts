import { z } from 'zod';
import { listOf } from './api.js';
import { eventTypeSchema, type EventType } from './events.js';

/**
 * What Dossier tells people about events, and how: a line in their feed
 * (`inApp`), an email, or both. Each person chooses per event type; anything
 * they haven't chosen follows NOTIFICATIONS' defaults.
 */

export const notificationCategorySchema = z.enum([
  'connections',
  'reports',
  'team',
  'security',
  'intelligence',
]);
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

export const NOTIFICATION_CATEGORIES: {
  id: NotificationCategory;
  name: string;
  description: string;
}[] = [
  {
    id: 'connections',
    name: 'Connections',
    description: 'When a tool stops syncing, and when it starts again.',
  },
  {
    id: 'reports',
    name: 'Weekly reports',
    description: 'Drafts to review, and reports going out to clients.',
  },
  {
    id: 'team',
    name: 'People',
    description: 'Who joins the workspace, and changes to their roles.',
  },
  {
    id: 'security',
    name: 'Your sign-in',
    description: 'Changes to how you sign in, so you can act if it wasn’t you.',
  },
  {
    id: 'intelligence',
    name: 'Intelligence',
    description: 'What Claude drafts for your clients.',
  },
];

export const notificationChannelSchema = z.enum(['inApp', 'email']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/**
 * Who hears about an event: `admins` (owners and admins), `everyone` in the
 * workspace, and `subject`, the person the event is about (its `userId`).
 */
export type NotificationAudience = 'admins' | 'everyone' | 'subject';

export type NotificationKind = {
  category: NotificationCategory;
  /** For Settings, e.g. "A connection stops syncing". */
  label: string;
  description: string;
  audience: NotificationAudience[];
  /** Whether the person who did it hears about it too. */
  notifyActor: boolean;
  defaults: Record<NotificationChannel, boolean>;
  /** Channels nobody can turn off. */
  locked: NotificationChannel[];
};

const urgent = { inApp: true, email: true };
const quiet = { inApp: true, email: false };

export const NOTIFICATIONS: Record<EventType, NotificationKind> = {
  'connection.failing': {
    category: 'connections',
    label: 'A connection stops syncing',
    description: 'What went wrong, and whether its settings need changing.',
    audience: ['admins'],
    notifyActor: false,
    defaults: urgent,
    locked: [],
  },
  'connection.recovered': {
    category: 'connections',
    label: 'A connection syncs again',
    description: 'After it had stopped.',
    audience: ['admins'],
    notifyActor: false,
    defaults: quiet,
    locked: [],
  },
  'reports.drafted': {
    category: 'reports',
    label: 'Weekly reports are drafted',
    description: 'Ready to review, with how many need a closer look.',
    audience: ['everyone'],
    notifyActor: false,
    defaults: quiet,
    locked: [],
  },
  'report.sent': {
    category: 'reports',
    label: 'A report goes to a client',
    description: 'Sent by someone else, or on schedule.',
    audience: ['everyone'],
    notifyActor: false,
    defaults: quiet,
    locked: [],
  },
  'report.delivery-failed': {
    category: 'reports',
    label: 'A report couldn’t be sent',
    description: 'It isn’t tried again by itself.',
    audience: ['everyone'],
    notifyActor: false,
    defaults: urgent,
    locked: [],
  },
  'report.no-recipients': {
    category: 'reports',
    label: 'An approved report has no one to go to',
    description: 'Its time to send came, but the client has no recipients.',
    audience: ['admins'],
    notifyActor: false,
    defaults: urgent,
    locked: [],
  },
  'member.joined': {
    category: 'team',
    label: 'Someone joins the workspace',
    description: 'When they accept an invite.',
    audience: ['admins'],
    notifyActor: false,
    defaults: quiet,
    locked: [],
  },
  'member.role-changed': {
    category: 'team',
    label: 'A role changes',
    description: 'Yours, or anyone’s if you’re an admin.',
    audience: ['admins', 'subject'],
    notifyActor: false,
    defaults: quiet,
    locked: [],
  },
  'member.removed': {
    category: 'team',
    label: 'Someone is removed',
    description: 'From the workspace, by an admin.',
    audience: ['admins'],
    notifyActor: false,
    defaults: quiet,
    locked: [],
  },
  'security.two-factor-off': {
    category: 'security',
    label: 'Two-factor sign-in is turned off',
    description: 'For your account.',
    audience: ['subject'],
    notifyActor: true,
    defaults: urgent,
    locked: ['email'],
  },
  'security.password-reset': {
    category: 'security',
    label: 'Your password is reset',
    description: 'Every other session is signed out when it is.',
    audience: ['subject'],
    notifyActor: true,
    defaults: urgent,
    locked: ['email'],
  },
  'security.recovery-code-used': {
    category: 'security',
    label: 'A recovery code is used',
    description: 'To sign in to your account in place of a code.',
    audience: ['subject'],
    notifyActor: true,
    defaults: urgent,
    locked: ['email'],
  },
  'security.locked-out': {
    category: 'security',
    label: 'Sign-in is paused after wrong passwords',
    description: 'Someone, maybe you, tried too many times.',
    audience: ['subject'],
    notifyActor: true,
    defaults: urgent,
    locked: ['email'],
  },
  'intelligence.drafted': {
    category: 'intelligence',
    label: 'New recommendations are drafted',
    description: 'For clients whose records changed.',
    audience: ['everyone'],
    notifyActor: false,
    defaults: quiet,
    locked: [],
  },
  'intelligence.failed': {
    category: 'intelligence',
    label: 'Drafting fails',
    description: 'At most once a day.',
    audience: ['admins'],
    notifyActor: false,
    defaults: urgent,
    locked: [],
  },
};

// Feed ----------------------------------------------------------------------------

/** Where a page of the feed starts, as the previous page's `older` gave it. */
const cursor = z.string().min(1).max(500);

export const notificationSchema = z.object({
  id: z.string(),
  type: eventTypeSchema,
  category: notificationCategorySchema,
  /** One line, e.g. "NinjaOne has stopped syncing". */
  title: z.string(),
  /** What happened and what to do; may be empty. */
  body: z.string(),
  /** A page in the web app that shows it or fixes it, e.g. `/connections`. */
  link: z.string().nullable(),
  at: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

/** Newest first. Pass `older` back as `before` for the next page. */
export const notificationsQuerySchema = z.object({
  before: cursor.optional(),
  unread: z.stringbool().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type NotificationsQuery = z.input<typeof notificationsQuerySchema>;

export const notificationPageSchema = listOf(notificationSchema).extend({
  older: cursor.nullable(),
});
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const notificationCountSchema = z.object({
  unread: z.number().int().min(0),
});
export type NotificationCount = z.infer<typeof notificationCountSchema>;

/** Some of your notifications by ID, or all of them. */
export const markNotificationsReadSchema = z.union([
  z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(100) }),
  z.object({ all: z.literal(true) }),
]);
export type MarkNotificationsRead = z.infer<typeof markNotificationsReadSchema>;

export const notificationReadResultSchema = z.object({
  marked: z.number().int().min(0),
});

// Preferences --------------------------------------------------------------------

/** One person's choice for one event type, as Settings shows it. */
export const notificationSettingSchema = z.object({
  type: eventTypeSchema,
  category: notificationCategorySchema,
  label: z.string(),
  description: z.string(),
  inApp: z.boolean(),
  email: z.boolean(),
  /** Channels that stay on whatever they choose. */
  locked: z.array(notificationChannelSchema),
});
export type NotificationSetting = z.infer<typeof notificationSettingSchema>;

export const notificationSettingsSchema = listOf(notificationSettingSchema);

/** Changes to some event types' channels; the rest stay as they are. */
export const notificationPreferencesUpdateSchema = z.partialRecord(
  eventTypeSchema,
  z.object({
    inApp: z.boolean().optional(),
    email: z.boolean().optional(),
  }),
);
export type NotificationPreferencesUpdate = z.infer<
  typeof notificationPreferencesUpdateSchema
>;

/** What's stored for one person: only what they've changed from the defaults. */
export type StoredNotificationPreferences = NotificationPreferencesUpdate;

/**
 * Stored preferences as saved, keeping what's still meaningful: types that
 * no longer exist and values that aren't true or false are dropped.
 */
export function readNotificationPreferences(
  value: unknown,
): StoredNotificationPreferences {
  const stored: StoredNotificationPreferences = {};
  if (typeof value !== 'object' || value === null) return stored;
  for (const [type, chosen] of Object.entries(value)) {
    if (!eventTypeSchema.safeParse(type).success) continue;
    if (typeof chosen !== 'object' || chosen === null) continue;
    const channels: { inApp?: boolean; email?: boolean } = {};
    for (const channel of notificationChannelSchema.options) {
      const on = (chosen as Record<string, unknown>)[channel];
      if (typeof on === 'boolean') channels[channel] = on;
    }
    stored[type as EventType] = channels;
  }
  return stored;
}

/** The channels someone gets an event type on, after defaults and locks. */
export function notificationChannels(
  type: EventType,
  stored: StoredNotificationPreferences,
): Record<NotificationChannel, boolean> {
  const kind = NOTIFICATIONS[type];
  const chosen = stored[type] ?? {};
  const on = (channel: NotificationChannel) =>
    kind.locked.includes(channel) ||
    (chosen[channel] ?? kind.defaults[channel]);
  return { inApp: on('inApp'), email: on('email') };
}
