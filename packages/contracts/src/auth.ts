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
