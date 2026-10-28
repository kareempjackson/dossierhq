'use server';

import {
  inviteAcceptSchema,
  twoFactorSignInSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  signInRequestSchema,
  signUpRequestSchema,
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
  /** The password was right and two-factor is on: ask for the code. */
  challenge?: string;
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
  if ('challenge' in result) return { challenge: result.challenge, email };

  await keepSession(result.session);
  redirect(safeNextPath(formData.get('next')));
}

export type TwoFactorState = {
  error?: string;
  /** The challenge ran out, so sign in again rather than retrying. */
  expired?: boolean;
};

/** Finishes signing in with a code from the app, or a recovery code. */
export async function completeTwoFactor(
  _previous: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const parsed = twoFactorSignInSchema.safeParse({
    challenge: formData.get('challenge') ?? '',
    code: formData.get('code') ?? '',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return issue?.path[0] === 'challenge'
      ? { error: 'Sign in again to get a new code request.', expired: true }
      : { error: issue?.message };
  }
  const result = await data.completeTwoFactor(parsed.data);
  if (!result.ok) {
    return {
      wrong: {
        error:
          'That code didn’t match. Use the newest code from your app, or a recovery code.',
      },
      expired: {
        error: 'That took too long. Sign in again.',
        expired: true,
      },
      limited: {
        error: 'Too many wrong codes. Wait a few minutes, then try again.',
      },
      unavailable: { error: failures.unavailable },
    }[result.reason];
  }
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

const SIGN_UP_FIELDS = [
  'workspaceName',
  'timeZone',
  'name',
  'title',
  'email',
] as const;

export type SignUpState = {
  error?: string;
  /** The field the error is about, so it can be marked. */
  field?: string;
  /** The email already has an account, so offer to sign in instead. */
  taken?: boolean;
  /** Echoed back so a failed attempt keeps what was typed (never the password). */
  values?: Partial<Record<(typeof SIGN_UP_FIELDS)[number], string>>;
};

/** Creates a workspace and its owner, signs them in, and moves on to connecting tools. */
export async function signUp(
  _previous: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const values = Object.fromEntries(
    SIGN_UP_FIELDS.map((field) => [field, String(formData.get(field) ?? '')]),
  );
  const parsed = signUpRequestSchema.safeParse({
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

  const result = await data.signUp(parsed.data);
  if (!result.ok) {
    if (result.reason === 'taken') {
      return {
        error: 'An account already uses this email.',
        field: 'email',
        taken: true,
        values,
      };
    }
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

export type ResetRequestState = {
  error?: string;
  /** The link is on its way (if the address has an account). */
  sent?: boolean;
  email?: string;
};

/** Asks the API to email a reset link. Says the same whether or not the address has an account. */
export async function requestPasswordReset(
  _previous: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get('email') ?? '');
  const parsed = passwordResetRequestSchema.safeParse({ email });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, email };
  }
  const result = await data.requestPasswordReset(parsed.data);
  if (result.ok) return { sent: true, email: parsed.data.email };
  return {
    error:
      result.reason === 'limited'
        ? 'Dossier has sent this address several links already. Wait an hour, or use the newest one.'
        : result.reason === 'invalid'
          ? 'Enter a valid email address'
          : failures.unavailable,
    email,
  };
}

export type ResetPasswordState = {
  error?: string;
  /** The link can't be used, so offer a new one rather than another try. */
  expired?: boolean;
  /** Set, and two-factor is on: ask for the code. */
  challenge?: string;
};

/** Sets the new password, signs in with it, and goes home. */
export async function resetPassword(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = passwordResetConfirmSchema.safeParse({
    token: formData.get('token') ?? '',
    password: formData.get('password') ?? '',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return issue?.path[0] === 'token'
      ? { error: 'This reset link is incomplete.', expired: true }
      : { error: issue?.message };
  }
  const result = await data.resetPassword(parsed.data);
  if (!result.ok) {
    return result.reason === 'expired'
      ? {
          error: 'This link has expired or was already used.',
          expired: true,
        }
      : { error: failures.unavailable };
  }
  if ('challenge' in result) return { challenge: result.challenge };
  await keepSession(result.session);
  redirect('/');
}

export type AcceptInviteState = {
  error?: string;
  /** The field the error is about, so it can be marked. */
  field?: string;
  /** The invite can't be used any more, so stop offering the form. */
  expired?: boolean;
  /** The email already has an account, so offer to sign in instead. */
  taken?: boolean;
  /** Echoed back so a failed attempt keeps what was typed (never the password). */
  values?: { name?: string; title?: string };
};

/** Creates the account from an invite, signs in, and goes home. */
export async function acceptInvite(
  _previous: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const values = {
    name: String(formData.get('name') ?? ''),
    title: String(formData.get('title') ?? ''),
  };
  const parsed = inviteAcceptSchema.safeParse({
    ...values,
    token: formData.get('token') ?? '',
    password: formData.get('password') ?? '',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === 'token') {
      return { error: 'This invite link is incomplete.', expired: true };
    }
    return {
      error: issue?.message,
      field: String(issue?.path[0] ?? ''),
      values,
    };
  }
  const result = await data.acceptInvite(parsed.data);
  if (!result.ok) {
    if (result.reason === 'expired') {
      return {
        error: 'This invite has expired, was withdrawn, or was already used.',
        expired: true,
      };
    }
    if (result.reason === 'taken') {
      return { error: 'An account already uses this email.', taken: true };
    }
    return { error: failures.unavailable, values };
  }
  await keepSession(result.session);
  redirect('/');
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
