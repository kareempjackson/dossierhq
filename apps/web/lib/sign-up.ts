import 'server-only';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { COOKIE_OPTIONS, SIGN_UP_COOKIE } from './session';

/** As long as the link works. */
const SIGN_UP_HOURS = 24;

const pendingSchema = z.object({ key: z.string(), email: z.string() });
export type PendingSignUp = z.infer<typeof pendingSchema>;

/**
 * Remembers a sign-up in this browser: a new random key, which lets the
 * link sign in here without the password, and the email. Returns the key.
 */
export async function rememberSignUp(email: string): Promise<string> {
  const key = randomBytes(32).toString('base64url');
  const value = Buffer.from(JSON.stringify({ key, email })).toString(
    'base64url',
  );
  (await cookies()).set(SIGN_UP_COOKIE, value, {
    ...COOKIE_OPTIONS,
    maxAge: SIGN_UP_HOURS * 3600,
  });
  return key;
}

/**
 * The sign-up this browser made, or null: the address to show on "Check
 * your inbox", and the key that lets the link sign in here.
 */
export async function pendingSignUp(): Promise<PendingSignUp | null> {
  const value = (await cookies()).get(SIGN_UP_COOKIE)?.value;
  if (!value) return null;
  try {
    return pendingSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString()),
    );
  } catch {
    return null;
  }
}

/** Once the link is opened, the key has done its job. */
export async function forgetSignUp(): Promise<void> {
  (await cookies()).delete(SIGN_UP_COOKIE);
}
