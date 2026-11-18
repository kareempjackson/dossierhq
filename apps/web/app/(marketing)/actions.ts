'use server';

import {
  productUpdatesSignupSchema,
  type ProductUpdatesSignup,
} from '@dossierhq/contracts';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import * as updates from '@/lib/data/product-updates';
import { PATH_HEADER } from '@/lib/session';

export type UpdatesState = {
  done?: boolean;
  error?: string;
  /** What they typed, to keep in the box after an error. */
  email?: string;
};

const PROBLEMS = {
  invalid: 'Enter a valid email address.',
  limited: 'Too many sign-ups from here. Try again in an hour.',
  unavailable: 'Dossier can’t reach its server right now. Try again shortly.',
} as const;

/**
 * Puts the email on the product-updates list, with the page it came from.
 * The same thanks whether it was on the list already, as the API answers.
 */
export async function subscribeToUpdates(
  _previous: UpdatesState,
  formData: FormData,
): Promise<UpdatesState> {
  const email = String(formData.get('email') ?? '');
  const checked = productUpdatesSignupSchema.safeParse({ email });
  if (!checked.success) {
    return {
      error: checked.error.issues[0]?.message ?? PROBLEMS.invalid,
      email,
    };
  }
  // The page, as the proxy saw it; one that isn't a plain path is left off.
  const path = (await headers()).get(PATH_HEADER)?.split('?')[0];
  const withPage = productUpdatesSignupSchema.safeParse({
    email,
    source: path,
  });
  const signup: ProductUpdatesSignup = withPage.success
    ? withPage.data
    : checked.data;
  try {
    const result = await updates.subscribeToUpdates(signup);
    return result.ok
      ? { done: true }
      : { error: PROBLEMS[result.reason], email };
  } catch (error) {
    unstable_rethrow(error);
    return { error: PROBLEMS.unavailable, email };
  }
}
