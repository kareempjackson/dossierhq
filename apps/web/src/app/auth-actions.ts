'use server';

import {
  inviteAcceptSchema,
  twoFactorSignInSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  signInRequestSchema,
  signUpConfirmSchema,
  signUpRequestSchema,
  signUpResendSchema,
  type SignInResponse,
} from '@dossierhq/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as data from '@/lib/data';
import {
  SAVED_SESSION_COOKIE,
  SESSION_COOKIE,
  SUPPORT_TOKEN_PREFIX,
  safeNextPath,
} from '@/lib/session';
import { forgetSignUp, pendingSignUp, rememberSignUp } from '@/lib/sign-up';

export type SignInState = {
  error?: string;
  /** Echoed back so a failed attempt keeps the email in the field. */
  email?: string;
  /** The password was right and two-factor is on: ask for the code. */
  challenge?: string;
  /** The password was right, but the email isn't confirmed yet. */
  unconfirmed?: boolean;
};

const failures = {
  invalid: 'That email and password don’t match an account.',
  locked: 'Too many attempts. Wait a few minutes, then try again.',
  'no-workspace': 'This account isn’t part of a workspace yet.',
  suspended: 'This workspace is suspended. Contact Dossier support.',
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
  if ('emailUnconfirmed' in result) {
    return { unconfirmed: true, email: parsed.data.email };
  }

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
      suspended: { error: failures.suspended, expired: true },
      unavailable: { error: failures.unavailable },
    }[result.reason];
  }
  await keepSession(result.session);
  redirect(safeNextPath(formData.get('next')));
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

/** Stores the session token where only the server can read it. */
async function keepSession(session: SignInResponse) {
  (await cookies()).set(SESSION_COOKIE, session.token, {
    ...COOKIE_OPTIONS,
    expires: new Date(session.expiresAt),
  });
}

export type SignUpState = {
  error?: string;
  /** The field the error is about, so it can be marked. */
  field?: 'email' | 'password';
  /** Echoed back so a failed attempt keeps it (never the password). */
  email?: string;
};

/**
 * Starts a sign-up: the API emails a link to confirm the address. This
 * browser keeps a key that lets the link sign in here without the password.
 */
export async function signUp(
  _previous: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get('email') ?? '');
  const parsed = signUpRequestSchema.safeParse({
    email,
    password: formData.get('password') ?? '',
    timeZone: formData.get('timeZone') ?? '',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue?.message,
      field: issue?.path[0] === 'password' ? 'password' : 'email',
      email,
    };
  }

  const browserKey = await rememberSignUp(parsed.data.email);
  const result = await data.signUp({ ...parsed.data, browserKey });
  if (!result.ok) {
    await forgetSignUp();
    return {
      error:
        result.reason === 'limited'
          ? 'Too many sign-ups from your network, or for this email. Try again in an hour.'
          : result.reason === 'invalid'
            ? 'Check the email and password, then try again.'
            : failures.unavailable,
      email,
    };
  }
  redirect('/sign-up/check-email');
}

export type ResendState = {
  error?: string;
  /** When the newest link went, so the page can say so and wait to offer another. */
  sentAt?: number;
};

/** Sends the link again, to the email given or the one this browser signed up with. */
export async function resendSignUpLink(
  _previous: ResendState,
  formData: FormData,
): Promise<ResendState> {
  const email =
    String(formData.get('email') ?? '') || (await pendingSignUp())?.email;
  const parsed = signUpResendSchema.safeParse({ email });
  if (!parsed.success) {
    return { error: 'Sign up again to get a new link.' };
  }
  const result = await data.resendSignUp(parsed.data.email);
  if (result.ok) return { sentAt: Date.now() };
  return {
    error:
      result.reason === 'limited'
        ? 'Dossier has sent this address several links already. Wait an hour, or use the newest one.'
        : failures.unavailable,
  };
}

export type ConfirmEmailState = {
  error?: string;
  /** Opened away from the browser that signed up: ask for the password. */
  passwordRequired?: boolean;
  /** The link can't be used, so stop offering the form. */
  expired?: boolean;
  /** The email has an account by now: sign in instead. */
  taken?: boolean;
};

/** Opens the link: creates the account, signs in, and starts onboarding. */
export async function confirmEmail(
  previous: ConfirmEmailState,
  formData: FormData,
): Promise<ConfirmEmailState> {
  const password = String(formData.get('password') ?? '');
  const parsed = signUpConfirmSchema.safeParse({
    token: formData.get('token') ?? '',
    browserKey: (await pendingSignUp())?.key,
    password: password || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return issue?.path[0] === 'token'
      ? { error: 'This link is incomplete.', expired: true }
      : { error: issue?.message, passwordRequired: true };
  }
  const result = await data.confirmSignUp(parsed.data);
  if (!result.ok) {
    return {
      expired: {
        error: 'This link has expired or was already used.',
        expired: true,
      },
      'wrong-password': {
        error: 'That isn’t the password you chose when you signed up.',
        passwordRequired: true,
      },
      taken: { error: 'An account already uses this email.', taken: true },
      limited: {
        error: failures.locked,
        passwordRequired: previous.passwordRequired,
      },
      unavailable: {
        error: failures.unavailable,
        passwordRequired: previous.passwordRequired,
      },
    }[result.reason];
  }
  if ('passwordRequired' in result) return { passwordRequired: true };
  await keepSession(result.session);
  await forgetSignUp();
  redirect('/onboarding');
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
      : result.reason === 'suspended'
        ? { error: failures.suspended, expired: true }
        : { error: failures.unavailable };
  }
  if ('challenge' in result) return { challenge: result.challenge };
  await keepSession(result.session);
  redirect('/');
}

export type AcceptInviteState = {
  error?: string;
  /** The invite can't be used any more, so stop offering the form. */
  expired?: boolean;
  /** The email already has an account, so offer to sign in instead. */
  taken?: boolean;
};

/** Creates the account from an invite, signs in, and starts onboarding. */
export async function acceptInvite(
  _previous: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const parsed = inviteAcceptSchema.safeParse({
    token: formData.get('token') ?? '',
    password: formData.get('password') ?? '',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === 'token') {
      return { error: 'This invite link is incomplete.', expired: true };
    }
    return { error: issue?.message };
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
    if (result.reason === 'suspended') {
      return { error: failures.suspended, expired: true };
    }
    return { error: failures.unavailable };
  }
  await keepSession(result.session);
  redirect('/onboarding');
}

/**
 * Ends the session on the API, clears the cookie, back to sign-in. In a
 * support view, ends the view instead.
 */
export async function signOut(): Promise<void> {
  const store = await cookies();
  if (store.get(SESSION_COOKIE)?.value.startsWith(SUPPORT_TOKEN_PREFIX)) {
    return endSupportView();
  }
  try {
    await data.signOut();
  } catch {
    // Clearing the cookie is what matters; the API session expires anyway.
  }
  store.delete(SESSION_COOKIE);
  redirect('/sign-in');
}

// Support views -----------------------------------------------------------------

export type SupportState = { error?: string };

/**
 * Opens a support link from Dossier Admin, from a button rather than on
 * page load, so a link checker can't use it up. Whatever session this
 * browser had waits aside until the view ends.
 */
export async function redeemSupport(
  _previous: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const token = String(formData.get('token') ?? '');
  if (!token) return { error: 'This support link is incomplete.' };
  const result = await data.redeemSupport(token);
  if (!result.ok) {
    return {
      error:
        result.reason === 'expired'
          ? 'This link has expired or was already used. Open a new one from Dossier Admin.'
          : failures.unavailable,
    };
  }
  const store = await cookies();
  const own = store.get(SESSION_COOKIE)?.value;
  if (own && !own.startsWith(SUPPORT_TOKEN_PREFIX)) {
    store.set(SAVED_SESSION_COOKIE, own, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  store.set(SESSION_COOKIE, result.session.token, {
    ...COOKIE_OPTIONS,
    expires: new Date(result.session.expiresAt),
  });
  redirect('/');
}

/** Ends the support view, and brings back this browser's own session, if any. */
export async function endSupportView(): Promise<void> {
  try {
    await data.signOut();
  } catch {
    // The view ends on its own anyway.
  }
  const store = await cookies();
  const saved = store.get(SAVED_SESSION_COOKIE)?.value;
  store.delete(SAVED_SESSION_COOKIE);
  if (saved) {
    store.set(SESSION_COOKIE, saved, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect('/');
  }
  store.delete(SESSION_COOKIE);
  redirect('/support/ended');
}
