import { redirect } from 'next/navigation';
import { getMe } from '@/lib/data';
import { orNull } from '@/lib/data/safe';

/**
 * Sends someone who hasn't finished setting up their account to onboarding.
 * Renders nothing. The API refuses everything else until then anyway; this
 * gets them there before a page tries.
 */
export async function SetupGate() {
  const me = await getMe().catch(orNull);
  if (me && me.setup !== 'done') redirect('/onboarding');
  return null;
}
