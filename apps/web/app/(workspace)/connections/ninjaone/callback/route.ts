import { redirect, unstable_rethrow } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { finishNinjaOneSignIn } from '@/lib/data/connectors';
import { keepProblem, takePending } from '@/lib/ninjaone-sign-in';

/**
 * Where NinjaOne sends people back after signing in:
 * /connections/ninjaone/callback, the address NinjaOne apps list. It hands the
 * code and state, with the sealed sign-in from the cookie, to the API, which
 * checks them and connects. Either way it goes back to NinjaOne's page; a
 * problem waits in a cookie to be shown there. NinjaOne's own error text is
 * never shown: anyone can put words in a URL.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const code = query.get('code');
  const state = query.get('state');
  const error = query.get('error');
  const pending = await takePending();

  let problem: string | null = null;
  if (error === 'access_denied') {
    problem = 'The NinjaOne sign-in was cancelled, so nothing changed.';
  } else if (error) {
    problem = 'NinjaOne didn’t finish the sign-in. Try signing in again.';
  } else if (!pending || !code || !state) {
    problem =
      'That NinjaOne sign-in has expired or didn’t start here. Sign in with NinjaOne again.';
  } else {
    try {
      const result = await finishNinjaOneSignIn({ pending, state, code });
      if (!result.ok) problem = result.problem;
    } catch (failure) {
      unstable_rethrow(failure);
      problem = 'Dossier can’t reach its server right now. Try again shortly.';
    }
  }

  if (problem) await keepProblem(problem);
  redirect('/connections/ninjaone');
}
