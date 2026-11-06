import { safeNextPath } from './safe-next-path';

/**
 * Cookie names and the sign-in URL, shared by proxy.ts, the API client and
 * the auth actions. No server-only imports, so the proxy can use it too.
 * The names are the ones the previous web app used, so sessions and
 * sign-ups started before the switch carry on.
 */

/** The httpOnly cookie that holds the API's session token. */
export const SESSION_COOKIE = 'dossier_session';

/**
 * The httpOnly cookie the browser that signs up keeps until the link is
 * opened: the key that lets the link sign in here without the password, and
 * the email, for the "check your inbox" page.
 */
export const SIGN_UP_COOKIE = 'dossier_sign_up';

/**
 * The API's two-factor challenge, between the password and the code. The
 * code and recovery-code steps are pages of their own, so it can't wait in
 * the form; it lasts as long as the API's (5 minutes).
 */
export const SIGN_IN_CHALLENGE_COOKIE = 'dossier_sign_in';

/**
 * Set by proxy.ts on every request to the page's own path, so the API client
 * can send someone whose session ended back to where they were.
 */
export const PATH_HEADER = 'x-dossier-path';

/** Every auth cookie: only the server reads them, and only over HTTPS live. */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

/**
 * The sign-in page, optionally saying the session ended and where to go
 * after. An ended session leaves its cookie in place: the API rejects it, the
 * next sign-in overwrites it, and nothing a GET request can trigger (such as
 * the router refreshing a route it keeps alive) ever clears a session.
 */
export function signInPath({
  next,
  expired = false,
}: { next?: string | null; expired?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (expired) params.set('expired', '1');
  const target = safeNextPath(next);
  if (target !== '/' && !target.startsWith('/sign-in')) {
    params.set('next', target);
  }
  const query = params.toString();
  return query ? `/sign-in?${query}` : '/sign-in';
}
