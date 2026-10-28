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

/** Who is signed in, and the workspace the session acts on. */
export const meSchema = z.object({
  user: userSchema,
  workspace: workspaceSchema,
  role: workspaceRoleSchema,
});
export type Me = z.infer<typeof meSchema>;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

/** A password someone is choosing, at sign-up or on a reset. */
const newPasswordSchema = z
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

/** Creates a workspace and its owner. One account per email. */
export const signUpRequestSchema = z.object({
  workspaceName: z.string().trim().min(1, 'Enter your company’s name').max(100),
  timeZone: z
    .string()
    .trim()
    .refine(isTimeZone, 'Choose a time zone from the list'),
  name: z.string().trim().min(1, 'Enter your name').max(100),
  title: z.string().trim().max(100).default(''),
  email: emailSchema,
  password: newPasswordSchema,
});
export type SignUpRequest = z.infer<typeof signUpRequestSchema>;

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
