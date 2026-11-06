import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE_OPTIONS, SIGN_IN_CHALLENGE_COOKIE } from './session';

/** The API's challenge lasts 5 minutes; so does the cookie. */
const CHALLENGE_SECONDS = 5 * 60;

/**
 * Keeps the API's two-factor challenge between the password and the code.
 * It's sealed by the API and only good with a code, but it still stays out
 * of the URL and away from scripts.
 */
export async function keepChallenge(challenge: string): Promise<void> {
  (await cookies()).set(SIGN_IN_CHALLENGE_COOKIE, challenge, {
    ...COOKIE_OPTIONS,
    maxAge: CHALLENGE_SECONDS,
  });
}

/** The challenge waiting for a code, or null when there's none (or it ran out). */
export async function readChallenge(): Promise<string | null> {
  return (await cookies()).get(SIGN_IN_CHALLENGE_COOKIE)?.value || null;
}

export async function forgetChallenge(): Promise<void> {
  (await cookies()).delete(SIGN_IN_CHALLENGE_COOKIE);
}
