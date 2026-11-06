import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/safe-next-path';
import { PATH_HEADER, SESSION_COOKIE, signInPath } from '@/lib/session';

/** Where signed-out visitors to the home page land, served at `/` itself. */
const LANDING = '/welcome';

/** Pages anyone can open without a session. */
const PUBLIC_PATHS = new Set([
  LANDING,
  '/brand',
  '/sign-in',
  '/sign-in/two-factor',
  '/sign-in/recovery-code',
  '/sign-up',
  '/sign-up/check-email',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/invite',
]);

/**
 * An optimistic check on every request: no session cookie means the landing
 * page at `/`, and sign in first everywhere else. The API still checks the
 * session on every call, and every action and page that needs one asks the
 * API; this only spares a round trip and keeps signed-in people off the
 * landing and sign-in pages.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.searchParams.delete('_rsc');
  const path = `${url.pathname}${url.search}`;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, path);

  if (!hasSession) {
    if (url.pathname === '/') {
      const landing = request.nextUrl.clone();
      landing.pathname = LANDING;
      return NextResponse.rewrite(landing, { request: { headers } });
    }
    if (!PUBLIC_PATHS.has(url.pathname)) {
      return NextResponse.redirect(
        new URL(signInPath({ next: path }), request.url),
      );
    }
  }

  if (hasSession && url.pathname === LANDING) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  // A cookie the API turned down still exists, so `expired` must get through.
  // Sign-up is never redirected from here, cookie or not: a stale cookie looks
  // like a live one, and signing up replaces it anyway.
  const expired = url.searchParams.get('expired') === '1';
  if (hasSession && url.pathname === '/sign-in' && !expired) {
    const next = safeNextPath(url.searchParams.get('next'));
    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except Next's own assets and files from public/.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|pdf|ttf|otf|woff2?|txt|xml)$).*)',
  ],
};
