import { z } from 'zod';
import { listOf } from './api.js';
import {
  emailSchema,
  inviteSchema,
  newPasswordSchema,
  workspaceRoleSchema,
} from './auth.js';
import { auditOutcomeSchema, connectorSchema } from './connectors.js';

/**
 * Dossier's own staff, who run the platform from the admin app. They aren't
 * people in a workspace: they have their own accounts, sessions and sign-in,
 * always with two-factor, and the customer app never accepts them.
 *
 * - `support`: looks at workspaces and people, and opens support views.
 * - `admin`: also suspends, restores and deletes workspaces, changes
 *   people's accounts, and manages staff.
 */
export const staffRoleSchema = z.enum(['support', 'admin']);
export type StaffRole = z.infer<typeof staffRoleSchema>;

/** True when `role` is `least` or above it. False for no role. */
export const hasStaffRole = (
  role: StaffRole | null | undefined,
  least: StaffRole,
): boolean => role != null && (least === 'support' || role === 'admin');

export const staffSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  role: staffRoleSchema,
  createdAt: z.iso.datetime(),
  /** When their access was taken away; they can't sign in after. */
  disabledAt: z.iso.datetime().nullable(),
});
export type Staff = z.infer<typeof staffSchema>;

/** Who is signed in to the admin app. */
export const staffMeSchema = z.object({
  staff: staffSchema,
  recoveryCodesLeft: z.number().int().nonnegative(),
});
export type StaffMe = z.infer<typeof staffMeSchema>;

// Signing in ----------------------------------------------------------------

/**
 * The right password always answers with a challenge, never a session:
 * staff sign in with a code too. It lasts a few minutes.
 */
export const staffChallengeSchema = z.object({ challenge: z.string() });
export type StaffChallenge = z.infer<typeof staffChallengeSchema>;

export const staffSessionSchema = z.object({
  /** Opaque. Send as `Authorization: Bearer <token>`. */
  token: z.string(),
  expiresAt: z.iso.datetime(),
  me: staffMeSchema,
});
export type StaffSession = z.infer<typeof staffSessionSchema>;

// Staff invites ---------------------------------------------------------------

export const staffInviteSchema = z.object({
  id: z.string(),
  email: z.email(),
  role: staffRoleSchema,
  /** Who sent it, by name as it was then; "Dossier" from the command line. */
  invitedBy: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type StaffInvite = z.infer<typeof staffInviteSchema>;

/** Emails a link to join the staff. Inviting the same email again replaces it. */
export const staffInviteCreateSchema = z.object({
  email: emailSchema,
  role: staffRoleSchema,
});
export type StaffInviteCreate = z.infer<typeof staffInviteCreateSchema>;

/** What the invite page shows before someone accepts. */
export const staffInvitePreviewSchema = z.object({
  email: z.email(),
  role: staffRoleSchema,
  invitedBy: z.string(),
});
export type StaffInvitePreview = z.infer<typeof staffInvitePreviewSchema>;

/**
 * A new authenticator secret for someone accepting an invite: to show as a
 * QR code, and `sealed` to send back with their first code.
 */
export const staffTwoFactorSetupSchema = z.object({
  /** Base32, for typing in by hand. */
  secret: z.string(),
  /** otpauth:// URI, for a QR code. */
  uri: z.string(),
  sealed: z.string(),
});
export type StaffTwoFactorSetup = z.infer<typeof staffTwoFactorSetupSchema>;

/**
 * Accepts an invite: makes the account with two-factor already on, and
 * signs in. `code` is the first code from the app, proving it's set up.
 */
export const staffInviteAcceptSchema = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().min(1, 'Enter your name').max(100),
  password: newPasswordSchema,
  sealed: z.string().min(1).max(2000),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your app'),
});
export type StaffInviteAccept = z.infer<typeof staffInviteAcceptSchema>;

/** The new session, and recovery codes shown this once. */
export const staffInviteAcceptedSchema = staffSessionSchema.extend({
  recoveryCodes: z.array(z.string()),
});
export type StaffInviteAccepted = z.infer<typeof staffInviteAcceptedSchema>;

/** GET /admin/staff: everyone, and invites waiting to be accepted. */
export const staffListSchema = z.object({
  data: z.array(staffSchema),
  invites: z.array(staffInviteSchema),
});
export type StaffList = z.infer<typeof staffListSchema>;

export const staffUpdateSchema = z.object({ role: staffRoleSchema });
export type StaffUpdate = z.infer<typeof staffUpdateSchema>;

// What staff did ------------------------------------------------------------

/** One thing a member of staff did, kept apart from workspaces' own logs. */
export const staffAuditEntrySchema = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  /** Who, as they were then; null when it came from the command line. */
  staff: z
    .object({ id: z.string(), name: z.string(), email: z.string() })
    .nullable(),
  what: z.string(),
  /** The workspace it concerned, if any. It may since have been deleted. */
  workspaceId: z.string().nullable(),
  /** The person in a workspace it concerned, if any. */
  userId: z.string().nullable(),
  outcome: auditOutcomeSchema,
  ip: z.string().nullable(),
});
export type StaffAuditEntry = z.infer<typeof staffAuditEntrySchema>;

const cursor = z.string().min(1).max(500);

/** Newest first. `before` turns to older entries, `after` to newer ones. */
export const staffAuditQuerySchema = z
  .object({
    workspaceId: z.string().min(1).max(100).optional(),
    before: cursor.optional(),
    after: cursor.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((query) => !(query.before && query.after), {
    message: 'Pass before or after, not both',
  });
export type StaffAuditQuery = z.infer<typeof staffAuditQuerySchema>;

/** A page of it, turned like the audit log's. */
export const staffAuditPageSchema = listOf(staffAuditEntrySchema).extend({
  newer: cursor.nullable(),
  older: cursor.nullable(),
});
export type StaffAuditPage = z.infer<typeof staffAuditPageSchema>;

// Workspaces and people ---------------------------------------------------------

/** A workspace as staff see it in a list: who runs it, its size, and health. */
export const workspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  timeZone: z.string(),
  createdAt: z.iso.datetime(),
  /** Set while staff have suspended it, with why. */
  suspension: z.object({ at: z.iso.datetime(), reason: z.string() }).nullable(),
  /** Its first owner. */
  owner: z.object({ name: z.string(), email: z.string() }).nullable(),
  members: z.number().int().nonnegative(),
  clients: z.number().int().nonnegative(),
  connectors: z.number().int().nonnegative(),
  failingConnectors: z.number().int().nonnegative(),
  /** When anyone in it was last signed in and using it. */
  lastActiveAt: z.iso.datetime().nullable(),
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const WORKSPACE_PAGE_SIZE = 50;

export const workspacesQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type WorkspacesQuery = z.infer<typeof workspacesQuerySchema>;

export const workspacePageSchema = listOf(workspaceSummarySchema).extend({
  /** How many match, across every page. */
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type WorkspacePage = z.infer<typeof workspacePageSchema>;

/** Someone with a Dossier account, as staff see them. */
export const platformPersonSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  title: z.string(),
  createdAt: z.iso.datetime(),
  /** Their workspace and role there; null for an account in none. */
  workspace: z.object({ id: z.string(), name: z.string() }).nullable(),
  role: workspaceRoleSchema.nullable(),
  twoFactor: z.boolean(),
  lastSeenAt: z.iso.datetime().nullable(),
  /** Browsers they're signed in on now. */
  sessions: z.number().int().nonnegative(),
});
export type PlatformPerson = z.infer<typeof platformPersonSchema>;

export const peopleQuerySchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(200),
});
export type PeopleQuery = z.infer<typeof peopleQuerySchema>;

/** One workspace in full, for its page in the admin app. */
export const workspaceDetailSchema = z.object({
  workspace: workspaceSummarySchema,
  members: z.array(platformPersonSchema),
  invites: z.array(inviteSchema),
  connectors: z.array(connectorSchema),
  reports: z.object({
    draft: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    sent: z.number().int().nonnegative(),
  }),
});
export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>;

export const workspaceSuspendSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Say why, for the record')
    .max(500, 'Keep it under 500 characters'),
});
export type WorkspaceSuspend = z.infer<typeof workspaceSuspendSchema>;

/** Deleting needs the workspace's name typed out, exactly. */
export const workspaceDeleteSchema = z.object({
  confirmName: z.string().max(200),
});
export type WorkspaceDelete = z.infer<typeof workspaceDeleteSchema>;

// Support views -----------------------------------------------------------------

/** How long a support view can last, in minutes. */
export const SUPPORT_MINUTES = [15, 30, 60] as const;

/** A member of staff's read-only view of a workspace, as its owner sees it. */
export const supportGrantSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  /** As it was when the view was opened. */
  workspaceName: z.string(),
  staff: z.object({ name: z.string(), email: z.string() }),
  reason: z.string(),
  createdAt: z.iso.datetime(),
  /** The view ends then, if nobody ends it sooner. */
  expiresAt: z.iso.datetime(),
  /** When the link was opened; null until it is. */
  openedAt: z.iso.datetime().nullable(),
  endedAt: z.iso.datetime().nullable(),
  /** Who or what ended it, in words. */
  endedBy: z.string().nullable(),
});
export type SupportGrant = z.infer<typeof supportGrantSchema>;

export const supportOpenSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Say why: the workspace’s owners see it in their audit log')
    .max(500, 'Keep it under 500 characters'),
  minutes: z.coerce
    .number()
    .refine(
      (minutes) => (SUPPORT_MINUTES as readonly number[]).includes(minutes),
      'Choose 15, 30 or 60 minutes',
    ),
});
export type SupportOpen = z.infer<typeof supportOpenSchema>;

/** The new view, and the one-time link that opens it in the customer app. */
export const supportOpenedSchema = z.object({
  grant: supportGrantSchema,
  /** Works once, for two minutes. */
  url: z.url(),
});
export type SupportOpened = z.infer<typeof supportOpenedSchema>;

/** Opening the link in the customer app: its token, swapped for a session. */
export const supportRedeemSchema = z.object({
  token: z.string().min(1).max(200),
});
export type SupportRedeem = z.infer<typeof supportRedeemSchema>;

export const supportSessionSchema = z.object({
  /** Send as `Authorization: Bearer <token>`, like any session. */
  token: z.string(),
  expiresAt: z.iso.datetime(),
});
export type SupportSession = z.infer<typeof supportSessionSchema>;
