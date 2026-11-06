'use server';

import {
  companyUpdateSchema,
  profileUpdateSchema,
  toolSchema,
} from '@dossierhq/contracts';
import { redirect, unstable_rethrow } from 'next/navigation';
import * as data from '@/lib/data/auth';
import { safeNextPath } from '@/lib/safe-next-path';

/**
 * Onboarding: the workspace (owners) or your name (invitees), then
 * two-factor sign-in, then finishing. The API won't finish an account
 * without two-factor on.
 */

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';

export type SetUpState = { error?: string };

/** Where the second step goes after finishing. */
function twoFactorStep(next: string): string {
  return next === '/'
    ? '/onboarding/two-factor'
    : `/onboarding/two-factor?next=${encodeURIComponent(next)}`;
}

/**
 * Saves the workspace's name, time zone and first tool, then on to
 * two-factor sign-in. Finishing goes to the tool's connect page, or home
 * for `later`.
 */
export async function saveSetUp(
  _previous: SetUpState,
  formData: FormData,
): Promise<SetUpState> {
  const name = String(formData.get('name') ?? '');
  if (!name.trim()) return { error: 'Give your workspace a name.' };
  const tool = toolSchema.safeParse(formData.get('tool'));
  const parsed = companyUpdateSchema.safeParse({
    name,
    timeZone: formData.get('timeZone') ?? '',
    tools: tool.success ? [tool.data] : [],
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  try {
    const { name: cleanName, timeZone, tools } = parsed.data;
    const result = await data.saveOnboardingCompany({
      name: cleanName,
      timeZone,
      tools,
    });
    if (!result.ok) return { error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable };
  }
  redirect(twoFactorStep(tool.success ? `/connections/${tool.data}` : '/'));
}

/** Someone who was invited: their name, then on to two-factor sign-in. */
export async function saveName(
  _previous: SetUpState,
  formData: FormData,
): Promise<SetUpState> {
  const parsed = profileUpdateSchema.safeParse({
    name: formData.get('name') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  try {
    const result = await data.saveOnboardingProfile(parsed.data);
    if (!result.ok) return { error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable };
  }
  redirect(twoFactorStep('/'));
}

/** Finishes onboarding and goes on to `next`, on this site. */
export async function finishOnboarding(
  next: string,
): Promise<{ error?: string }> {
  try {
    const result = await data.finishOnboarding();
    if (!result.ok) return { error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable };
  }
  redirect(safeNextPath(next));
}
