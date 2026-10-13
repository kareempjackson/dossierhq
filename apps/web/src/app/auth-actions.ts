'use server';

import { signInRequestSchema } from '@dossierhq/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as data from '@/lib/data';
import { SESSION_COOKIE, safeNextPath } from '@/lib/session';

export type SignInState = {
  error?: string;
  /** Echoed back so a failed attempt keeps the email in the field. */
  email?: string;
};

const failures = {
  invalid: 'That email and password don’t match an account.',
  locked: 'Too many attempts. Wait a few minutes, then try again.',
  'no-workspace': 'This account isn’t part of a workspace yet.',
  unavailable: 'Dossier can’t reach its server right now. Try again shortly.',
} as const;

/** Checks the credentials, stores the session in an httpOnly cookie, moves on. */
export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get('email') ?? '');
  const parsed = signInRequestSchema.safeParse({
    email,
    password: formData.get('password') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, email };
  }

  const result = await data.signIn(parsed.data);
  if (!result.ok) return { error: failures[result.reason], email };

  (await cookies()).set(SESSION_COOKIE, result.session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(result.session.expiresAt),
  });
  redirect(safeNextPath(formData.get('next')));
}

/** Ends the session on the API, clears the cookie, back to sign-in. */
export async function signOut(): Promise<void> {
  try {
    await data.signOut();
  } catch {
    // Clearing the cookie is what matters; the API session expires anyway.
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/sign-in');
}
