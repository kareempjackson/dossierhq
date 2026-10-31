/**
 * The httpOnly cookie that holds the staff session token. Named apart from
 * the customer app's `dossier_session`: browsers don't separate cookies by
 * port, so on localhost both apps see each other's. No server-only imports,
 * so proxy.ts can use it too.
 */
export const SESSION_COOKIE = 'dossier_staff_session';

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

/** The sign-in page, optionally saying the session ended and where to go after. */
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
