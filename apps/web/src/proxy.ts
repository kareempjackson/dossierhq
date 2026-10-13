import { NextResponse, type NextRequest } from 'next/server';
import {
  PATH_HEADER,
  SESSION_COOKIE,
  safeNextPath,
  signInPath,
} from '@/lib/session';

/**
 * An optimistic check on every request: no session cookie means sign in first.
 * The API still validates the session on each call; this only spares a round
 * trip and keeps signed-in people off the sign-in page.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.searchParams.delete('_rsc');
  const path = `${url.pathname}${url.search}`;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isSignIn = url.pathname === '/sign-in';

  if (!hasSession && !isSignIn) {
    return NextResponse.redirect(
      new URL(signInPath({ next: path }), request.url),
    );
  }
  // A cookie the API turned down still exists, so `expired` must get through.
  const expired = url.searchParams.get('expired') === '1';
  if (hasSession && isSignIn && !expired) {
    const next = safeNextPath(url.searchParams.get('next'));
    return NextResponse.redirect(new URL(next, request.url));
  }

  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, path);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except Next's own assets and the app icon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
