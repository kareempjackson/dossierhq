import 'server-only';
import { cookies, headers } from 'next/headers';

/**
 * Signing in with NinjaOne, which tickets need. The connect form sends the
 * person to NinjaOne; NinjaOne sends them back to the callback route, which
 * finishes the sign-in through the API.
 */

/** Where NinjaOne sends people back. It must be a redirect URI on their app. */
export const NINJAONE_CALLBACK_PATH = '/connections/ninjaone/callback';

/** The API's sealed sign-in details, kept only for the callback to send back. */
export const PENDING_COOKIE = 'dossier_ninjaone_sign_in';

/** Why the last sign-in didn't work, for the connections page to say once. */
export const PROBLEM_COOKIE = 'dossier_ninjaone_problem';

const secure = process.env.NODE_ENV === 'production';

/** This Dossier's callback, as the browser reaches it. */
export async function ninjaOneRedirectUri(): Promise<string> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000')
    .split(',')[0]!
    .trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = (h.get('x-forwarded-proto') ?? (local ? 'http' : 'https'))
    .split(',')[0]!
    .trim();
  return `${proto}://${host}${NINJAONE_CALLBACK_PATH}`;
}

/** Holds the sealed details for ten minutes, sent only to the callback. */
export async function keepPending(pending: string) {
  (await cookies()).set(PENDING_COOKIE, pending, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: NINJAONE_CALLBACK_PATH,
    maxAge: 10 * 60,
  });
}

/** Reads and forgets the sealed details. */
export async function takePending(): Promise<string | null> {
  const jar = await cookies();
  const pending = jar.get(PENDING_COOKIE)?.value ?? null;
  jar.set(PENDING_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: NINJAONE_CALLBACK_PATH,
    maxAge: 0,
  });
  return pending;
}

export async function keepProblem(problem: string) {
  (await cookies()).set(PROBLEM_COOKIE, problem, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/connections',
    maxAge: 60,
  });
}

export async function readProblem(): Promise<string | null> {
  return (await cookies()).get(PROBLEM_COOKIE)?.value ?? null;
}

export async function forgetProblem() {
  (await cookies()).set(PROBLEM_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/connections',
    maxAge: 0,
  });
}
