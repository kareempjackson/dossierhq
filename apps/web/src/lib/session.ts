/**
 * The httpOnly cookie that holds the API session token. Shared by proxy.ts,
 * the API client and the sign-in actions; no server-only imports, so the
 * proxy can use it too.
 */
export const SESSION_COOKIE = 'dossier_session';

/**
 * While a member of Dossier's staff is in a support view, their own session
 * (if this browser had one) waits here, to come back when the view ends.
 */
export const SAVED_SESSION_COOKIE = 'dossier_session_saved';

/** Support views' tokens start with this. */
export const SUPPORT_TOKEN_PREFIX = 'sup.';

/**
 * The httpOnly cookie the browser that signs up keeps until the link is
 * opened: the key that lets the link sign in here without the password, and
 * the email, for the "check your inbox" page.
 */
export const SIGN_UP_COOKIE = 'dossier_sign_up';

/**
 * Set by proxy.ts on every request to the page's own path, so the API client
 * can send someone whose session ended back to where they were.
 */
export const PATH_HEADER = 'x-dossier-path';

/** Only same-site paths, so `?next=` can't send people elsewhere. */
export function safeNextPath(value: unknown): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\')
    ? value
    : '/';
}

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
