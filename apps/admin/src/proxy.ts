import { NextResponse, type NextRequest } from 'next/server';
import {
  PATH_HEADER,
  SESSION_COOKIE,
  safeNextPath,
  signInPath,
} from '@/lib/session';

/** Pages anyone can open without a staff session. */
const PUBLIC_PATHS = new Set(['/sign-in', '/invite']);

/**
 * An optimistic check on every request: no session cookie means sign in
 * first. The API still validates the session on each call; this only spares
 * a round trip and keeps signed-in staff off the sign-in page.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.searchParams.delete('_rsc');
  const path = `${url.pathname}${url.search}`;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, path);

  if (!hasSession && !PUBLIC_PATHS.has(url.pathname)) {
    return NextResponse.redirect(
      new URL(signInPath({ next: path }), request.url),
    );
  }
  // A cookie the API turned down still exists, so `expired` must get through.
  const expired = url.searchParams.get('expired') === '1';
  if (hasSession && url.pathname === '/sign-in' && !expired) {
    const next = safeNextPath(url.searchParams.get('next'));
    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
