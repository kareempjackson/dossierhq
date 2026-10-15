'use server';

import {
  setupRequestSchema,
  signInRequestSchema,
  type SignInResponse,
} from '@dossierhq/contracts';
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

  await keepSession(result.session);
  redirect(safeNextPath(formData.get('next')));
}

/** Stores the session token where only the server can read it. */
async function keepSession(session: SignInResponse) {
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(session.expiresAt),
  });
}

const SETUP_FIELDS = [
  'workspaceName',
  'timeZone',
  'name',
  'title',
  'email',
] as const;

export type SetUpState = {
  error?: string;
  /** The field the error is about, so it can be marked. */
  field?: string;
  /** Echoed back so a failed attempt keeps what was typed (never the password). */
  values?: Partial<Record<(typeof SETUP_FIELDS)[number], string>>;
};

/** First run: creates the workspace and its owner, signs them in, and moves on to connecting tools. */
export async function setUp(
  _previous: SetUpState,
  formData: FormData,
): Promise<SetUpState> {
  const values = Object.fromEntries(
    SETUP_FIELDS.map((field) => [field, String(formData.get(field) ?? '')]),
  );
  const parsed = setupRequestSchema.safeParse({
    ...values,
    password: formData.get('password') ?? '',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue?.message,
      field: String(issue?.path[0] ?? ''),
      values,
    };
  }

  const result = await data.setUp(parsed.data);
  if (!result.ok) {
    if (result.reason === 'taken') redirect('/sign-in');
    return {
      error:
        result.reason === 'invalid'
          ? 'Check the details and try again.'
          : failures.unavailable,
      values,
    };
  }
  await keepSession(result.session);
  redirect('/connections');
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
