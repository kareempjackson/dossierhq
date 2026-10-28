import { redirect, unstable_rethrow } from 'next/navigation';
import type { NextRequest } from 'next/server';
import * as data from '@/lib/data';
import { keepProblem, takePending } from '@/lib/ninjaone-sign-in';

/**
 * Where NinjaOne sends someone after they sign in. Finishes the sign-in with
 * the sealed details from the connect form, then goes back to Connections,
 * which shows the first sync, or says what went wrong.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const pending = await takePending();

  // NinjaOne's own error text isn't shown: anyone can put words in a URL.
  let problem: string | null = null;
  if (params.get('error') === 'access_denied') {
    problem = 'The NinjaOne sign-in was cancelled, so nothing changed.';
  } else if (params.has('error')) {
    problem = 'NinjaOne didn’t finish the sign-in. Try signing in again.';
  } else if (!pending || !code || !state) {
    problem =
      'That NinjaOne sign-in has expired or didn’t start here. Sign in with NinjaOne again.';
  } else {
    try {
      const result = await data.finishNinjaOneSignIn({ pending, state, code });
      if (!result.ok) problem = result.problem;
    } catch (error) {
      unstable_rethrow(error);
      problem = 'Dossier can’t reach its server right now. Try again shortly.';
    }
  }

  if (problem) await keepProblem(problem);
  redirect('/connections');
}
