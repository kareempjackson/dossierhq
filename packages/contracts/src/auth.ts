import { z } from 'zod';
import { workspaceSchema } from './clients.js';

export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  /** What they do at the MSP, e.g. "Service manager". */
  title: z.string(),
});
export type User = z.infer<typeof userSchema>;

/**
 * - `owner`: everything an admin can do; every workspace keeps at least one.
 * - `admin`: also manages connections, people, delivery and the audit log.
 * - `technician`: reviews reports and recommendations, syncs, adds notes.
 */
export const workspaceRoleSchema = z.enum(['owner', 'admin', 'technician']);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

const ROLE_RANK: Record<WorkspaceRole, number> = {
  technician: 0,
  admin: 1,
  owner: 2,
};

/** True when `role` is `least` or above it. False for no role. */
export const hasRole = (
  role: WorkspaceRole | null | undefined,
  least: WorkspaceRole,
): boolean => role != null && ROLE_RANK[role] >= ROLE_RANK[least];

/**
 * What's left before someone can use Dossier:
 * - `onboarding`: they haven't finished it yet;
 * - `two-factor`: they must keep two-factor on, and turned it off;
 * - `done`: nothing. Until then the API answers only what onboarding needs.
 */
export const accountSetupSchema = z.enum(['done', 'onboarding', 'two-factor']);
export type AccountSetupState = z.infer<typeof accountSetupSchema>;

/** Who is signed in, and the workspace the session acts on. */
export const meSchema = z.object({
  user: userSchema,
  workspace: workspaceSchema,
  role: workspaceRoleSchema,
  setup: accountSetupSchema,
  /**
   * Set when this is a member of Dossier's staff in a read-only support
   * view, acting as `user` (an owner). Absent or null otherwise.
   */
  support: z
    .object({ staffName: z.string(), endsAt: z.iso.datetime() })
    .nullable()
    .optional(),
});
export type Me = z.infer<typeof meSchema>;

/** An email address, as typed: trimmed and lowercased. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

/** A password someone is choosing, at sign-up or on a reset. */
export const newPasswordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200, 'Use at most 200 characters');

export const signInRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(200),
});
export type SignInRequest = z.infer<typeof signInRequestSchema>;

export const signInResponseSchema = z.object({
  /** Opaque session token. Send as `Authorization: Bearer <token>`. */
  token: z.string(),
  expiresAt: z.iso.datetime(),
  me: meSchema,
});
export type SignInResponse = z.infer<typeof signInResponseSchema>;

// Sign-up ---------------------------------------------------------------------

const isTimeZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/** An IANA time zone, such as "Europe/London". */
export const timeZoneSchema = z
  .string()
  .trim()
  .refine(isTimeZone, 'Choose a time zone from the list');

/** A random key the browser that signed up keeps, so its link needs no password there. */
const browserKeySchema = z.string().min(32).max(200);

/**
 * Starts a sign-up: emails a link to confirm the address. There's no account
 * until it's opened. Always 202, whether or not the email has an account.
 */
export const signUpRequestSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  /** The browser's, for the new workspace; anything unknown is UTC. */
  timeZone: timeZoneSchema.catch('UTC'),
  browserKey: browserKeySchema.optional(),
});
export type SignUpRequest = z.input<typeof signUpRequestSchema>;

/** Sends the link again, if a sign-up for this email is waiting. Always 202. */
export const signUpResendSchema = z.object({ email: emailSchema });
export type SignUpResend = z.infer<typeof signUpResendSchema>;

/**
 * Opens the link: creates the account and its workspace, and signs in. Away
 * from the browser that signed up, the password is needed too.
 */
export const signUpConfirmSchema = z.object({
  token: z.string().min(1).max(200),
  browserKey: browserKeySchema.optional(),
  password: z.string().min(1, 'Enter your password').max(200).optional(),
});
export type SignUpConfirm = z.infer<typeof signUpConfirmSchema>;

/** The link was opened elsewhere: send it again with the password. */
export const passwordRequiredSchema = z.object({
  passwordRequired: z.literal(true),
});

/** What opening the link answers: a session, or a request for the password. */
export const signUpConfirmStepSchema = z.union([
  signInResponseSchema,
  passwordRequiredSchema,
]);
export type SignUpConfirmStep = z.infer<typeof signUpConfirmStepSchema>;

// Password reset --------------------------------------------------------------

/** Emails a reset link if the address has an account. Always 202. */
export const passwordResetRequestSchema = z.object({ email: emailSchema });
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

/** Sets a new password with the token from the link, then signs in. */
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1).max(200),
  password: newPasswordSchema,
});
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;

// People ----------------------------------------------------------------------

/** Someone in the workspace, and what they may do there. */
export const memberSchema = userSchema.extend({ role: workspaceRoleSchema });
export type Member = z.infer<typeof memberSchema>;

/** What an invite can make someone; an owner can make them owner after. */
export const inviteRoleSchema = z.enum(['admin', 'technician']);
export type InviteRole = z.infer<typeof inviteRoleSchema>;

/** An invite that hasn't been accepted yet. */
export const inviteSchema = z.object({
  id: z.string(),
  email: z.email(),
  role: inviteRoleSchema,
  /** Who sent it, by name as it was then. */
  invitedBy: z.string(),
  createdAt: z.iso.datetime(),
  /** After this the link no longer works; send a new invite. */
  expiresAt: z.iso.datetime(),
});
export type Invite = z.infer<typeof inviteSchema>;

/** Emails someone a link to join. Inviting the same email again replaces it. */
export const inviteCreateSchema = z.object({
  email: emailSchema,
  role: inviteRoleSchema,
});
export type InviteCreate = z.infer<typeof inviteCreateSchema>;

export const memberUpdateSchema = z.object({ role: workspaceRoleSchema });
export type MemberUpdate = z.infer<typeof memberUpdateSchema>;

/** An invite link's token. */
export const inviteTokenSchema = z.object({
  token: z.string().min(1).max(200),
});
export type InviteToken = z.infer<typeof inviteTokenSchema>;

/** What the invite page shows before someone accepts. */
export const invitePreviewSchema = z.object({
  workspaceName: z.string(),
  email: z.email(),
  role: inviteRoleSchema,
  invitedBy: z.string(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/**
 * Accepts an invite: makes the account, joins the workspace, signs in.
 * Onboarding asks for the name and title when they're left out.
 */
export const inviteAcceptSchema = inviteTokenSchema.extend({
  name: z.string().trim().max(100).default(''),
  title: z.string().trim().max(100).default(''),
  password: newPasswordSchema,
});
export type InviteAccept = z.input<typeof inviteAcceptSchema>;

// Sessions --------------------------------------------------------------------

/** GET /auth/sessions: this browser's session, and the user's others. */
export const sessionsSchema = z.object({
  current: z.object({
    createdAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  }),
  /** Other live sessions: other browsers or devices. */
  others: z.number().int().nonnegative(),
  /** When one of the others was last used; null when there are none. */
  othersLastSeenAt: z.iso.datetime().nullable(),
  /** A session ends after this many hours unused, or at `expiresAt`. */
  idleHours: z.number().int().positive(),
});
export type Sessions = z.infer<typeof sessionsSchema>;

// Two-factor sign-in --------------------------------------------------------

/**
 * Sign-in when the password is right but two-factor is on: no session yet,
 * a challenge to send back with a code. It lasts a few minutes.
 */
export const twoFactorChallengeSchema = z.object({
  twoFactorRequired: z.literal(true),
  challenge: z.string(),
});
export type TwoFactorChallenge = z.infer<typeof twoFactorChallengeSchema>;

/**
 * Sign-in with the right password for a sign-up whose link hasn't been
 * opened: there's no account until it is.
 */
export const emailUnconfirmedSchema = z.object({
  emailUnconfirmed: z.literal(true),
});

/** What sign-in answers: a session, a challenge, or "confirm your email". */
export const signInStepSchema = z.union([
  signInResponseSchema,
  twoFactorChallengeSchema,
  emailUnconfirmedSchema,
]);
export type SignInStep = z.infer<typeof signInStepSchema>;

/** What a password reset answers: a session, or a challenge. */
export const passwordResetStepSchema = z.union([
  signInResponseSchema,
  twoFactorChallengeSchema,
]);
export type PasswordResetStep = z.infer<typeof passwordResetStepSchema>;

/** A code from the authenticator app, or a recovery code. */
const twoFactorCode = z
  .string()
  .trim()
  .min(6, 'Enter the 6-digit code from your app, or a recovery code')
  .max(40);

export const twoFactorSignInSchema = z.object({
  challenge: z.string().min(1).max(2000),
  code: twoFactorCode,
});
export type TwoFactorSignIn = z.infer<typeof twoFactorSignInSchema>;

export const twoFactorCodeSchema = z.object({ code: twoFactorCode });
export type TwoFactorCode = z.infer<typeof twoFactorCodeSchema>;

/** GET /auth/two-factor. */
export const twoFactorStatusSchema = z.object({
  /** False until the API has CONNECTOR_SECRET_KEY, which seals the secret. */
  available: z.boolean(),
  enabled: z.boolean(),
  /** They must keep it on: turning it off sends them to set it up again. */
  required: z.boolean(),
  recoveryCodesLeft: z.number().int().nonnegative(),
});
export type TwoFactorStatus = z.infer<typeof twoFactorStatusSchema>;

/** POST /auth/two-factor/setup: what to put in the authenticator app. */
export const twoFactorSetupSchema = z.object({
  /** Base32, for typing in by hand. */
  secret: z.string(),
  /** otpauth:// URI, for a QR code. */
  uri: z.string(),
});
export type TwoFactorSetup = z.infer<typeof twoFactorSetupSchema>;

/** POST /auth/two-factor/enable: recovery codes, shown this once. */
export const twoFactorEnabledSchema = z.object({
  recoveryCodes: z.array(z.string()),
});
export type TwoFactorEnabled = z.infer<typeof twoFactorEnabledSchema>;
