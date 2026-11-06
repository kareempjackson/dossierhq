import { redirect } from 'next/navigation';
import { getMe } from '@/lib/data/auth';
import { orNull } from '@/lib/data/safe';
import { toSessionMe } from '@/lib/session-me';
import { SessionSync } from './session-sync';

/**
 * Reads the session for every workspace page, inside a Suspense boundary so
 * the page around it still prerenders. No session, or one the API turned
 * down, goes to sign-in (the API client redirects); an account still
 * setting up goes to onboarding. Otherwise the browser's store learns who's
 * signed in. If the API can't be reached, the page stays up and the
 * signed-in name keeps its placeholder.
 */
export async function SessionGate() {
  const me = await getMe().catch(orNull);
  if (!me) return null;
  if (me.setup !== 'done') redirect('/onboarding');
  return <SessionSync me={toSessionMe(me)} />;
}
