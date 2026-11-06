import 'server-only';
import { cookies, headers } from 'next/headers';

/**
 * Signing in to NinjaOne: the browser leaves for NinjaOne and comes back to
 * the callback. The API's sealed `pending` waits in a cookie only the
 * callback receives; a problem waits in another, for the Connections page
 * to show once.
 */

export const NINJAONE_CALLBACK_PATH = '/connections/ninjaone/callback';
const PENDING_COOKIE = 'dossier_ninjaone_sign_in';
const PROBLEM_COOKIE = 'dossier_ninjaone_problem';
const secure = process.env.NODE_ENV === 'production';

/**
 * Where NinjaOne sends people back, on the address they're using: what the
 * NinjaOne app has to list, exactly.
 */
export async function ninjaOneRedirectUri(): Promise<string> {
  const request = await headers();
  const first = (name: string) => request.get(name)?.split(',')[0]?.trim();
  const host = first('x-forwarded-host') ?? first('host') ?? 'localhost:3000';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = first('x-forwarded-proto') ?? (local ? 'http' : 'https');
  return `${proto}://${host}${NINJAONE_CALLBACK_PATH}`;
}

/** Keeps the API's sealed sign-in for the callback, for 10 minutes. */
export async function keepPending(pending: string): Promise<void> {
  (await cookies()).set(PENDING_COOKIE, pending, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: NINJAONE_CALLBACK_PATH,
    maxAge: 600,
  });
}

/** The waiting sign-in, if any; it's used once, so it's cleared. */
export async function takePending(): Promise<string | null> {
  const store = await cookies();
  const pending = store.get(PENDING_COOKIE)?.value ?? null;
  store.set(PENDING_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: NINJAONE_CALLBACK_PATH,
    maxAge: 0,
  });
  return pending;
}

/** Something went wrong signing in: say so on Connections, once. */
export async function keepProblem(problem: string): Promise<void> {
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

export async function forgetProblem(): Promise<void> {
  (await cookies()).set(PROBLEM_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/connections',
    maxAge: 0,
  });
}
