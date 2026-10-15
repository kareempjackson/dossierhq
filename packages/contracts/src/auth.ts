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

export const workspaceRoleSchema = z.enum(['owner', 'member']);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/** Who is signed in, and the workspace the session acts on. */
export const meSchema = z.object({
  user: userSchema,
  workspace: workspaceSchema,
  role: workspaceRoleSchema,
});
export type Me = z.infer<typeof meSchema>;

export const signInRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('Enter a valid email address')),
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

// First-run setup -------------------------------------------------------------

/** Whether this Dossier has no accounts yet, so /setup should be offered. */
export const setupStatusSchema = z.object({ needed: z.boolean() });
export type SetupStatus = z.infer<typeof setupStatusSchema>;

const isTimeZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/** Creates the first workspace and its owner. Only works once. */
export const setupRequestSchema = z.object({
  workspaceName: z.string().trim().min(1, 'Enter your company’s name').max(100),
  timeZone: z
    .string()
    .trim()
    .refine(isTimeZone, 'Choose a time zone from the list'),
  name: z.string().trim().min(1, 'Enter your name').max(100),
  title: z.string().trim().max(100).default(''),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('Enter a valid email address')),
  password: z
    .string()
    .min(12, 'Use at least 12 characters')
    .max(200, 'Use at most 200 characters'),
});
export type SetupRequest = z.infer<typeof setupRequestSchema>;
