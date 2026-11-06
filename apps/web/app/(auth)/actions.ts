'use server';

import {
  inviteAcceptSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  signInRequestSchema,
  signUpConfirmSchema,
  signUpRequestSchema,
  signUpResendSchema,
  twoFactorSignInSchema,
  type SignInResponse,
} from '@dossierhq/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as data from '@/lib/data/auth';
import { MIN_PASSWORD } from '@/lib/passwords';
import { safeNextPath } from '@/lib/safe-next-path';
import { COOKIE_OPTIONS, SESSION_COOKIE } from '@/lib/session';
import {
  forgetChallenge,
  keepChallenge,
  readChallenge,
} from '@/lib/sign-in-challenge';
import { forgetSignUp, pendingSignUp, rememberSignUp } from '@/lib/sign-up';

/**
 * Signing in and out, signing up, resetting a password and accepting an
 * invite. Each checks what it's given, asks the API, and either hands the
 * form something to say or keeps the session and moves on. The session
 * token only ever lives in an httpOnly cookie.
 */

const failures = {
  invalid: 'That email and password don’t match an account.',
  locked: 'Too many attempts. Wait a few minutes, then try again.',
  'no-workspace': 'This account isn’t part of a workspace yet.',
  suspended: 'This workspace is suspended. Contact Dossier support.',
  unavailable: 'Dossier can’t reach its server right now. Try again shortly.',
} as const;

const tooShort = (password: string) =>
  `At least ${MIN_PASSWORD} characters. This one has ${password.length}.`;

/** Stores the session token where only the server can read it. */
async function keepSession(session: SignInResponse) {
  (await cookies()).set(SESSION_COOKIE, session.token, {
    ...COOKIE_OPTIONS,
    expires: new Date(session.expiresAt),
  });
}

/** `/sign-in/two-factor`, keeping where to go after. */
function twoFactorPath(next: unknown): string {
  const target = safeNextPath(next);
  return target === '/'
    ? '/sign-in/two-factor'
    : `/sign-in/two-factor?next=${encodeURIComponent(target)}`;
}

// Signing in ------------------------------------------------------------------

export type SignInState = {
  error?: string;
  /** Put back in the field, since the form resets after each attempt. */
  email?: string;
};

/**
 * Checks the email and password. With two-factor on, the API's challenge
 * waits in a short-lived httpOnly cookie while the code page asks for the
 * code. An account whose sign-up link was never opened goes to "Check your
 * inbox", where the link can be sent again.
 */
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
  if ('challenge' in result) {
    await keepChallenge(result.challenge);
    redirect(twoFactorPath(formData.get('next')));
  }
  if ('emailUnconfirmed' in result) {
    // Keep a sign-up this browser started for this email: its key lets the
    // link sign in here without the password.
    if ((await pendingSignUp())?.email !== parsed.data.email) {
      await rememberSignUp(parsed.data.email);
    }
    redirect('/sign-up/check-email');
  }

  await forgetChallenge();
  await keepSession(result.session);
  redirect(safeNextPath(formData.get('next')));
}

export type TwoFactorState = {
  error?: string;
  /** The challenge ran out, so sign in again rather than retrying. */
  expired?: boolean;
  /** Counts attempts, so the code boxes empty after each one. */
  attempt?: number;
  /** What was typed, so a recovery code with a typo can be fixed in place. */
  code?: string;
};

/**
 * Finishes signing in with the challenge from the cookie and a code: six
 * digits from the app, or a recovery code. The same challenge can be tried
 * again after a wrong code, until it runs out.
 */
export async function completeTwoFactor(
  previous: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const code = String(formData.get('code') ?? '');
  const attempt = (previous.attempt ?? 0) + 1;
  const challenge = await readChallenge();
  if (!challenge) {
    return {
      error: 'That took too long. Sign in again.',
      expired: true,
      attempt,
      code,
    };
  }
  const parsed = twoFactorSignInSchema.safeParse({ challenge, code });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, attempt, code };
  }

  const result = await data.completeTwoFactor(parsed.data);
  if (!result.ok) {
    if (result.reason === 'expired' || result.reason === 'suspended') {
      await forgetChallenge();
    }
    return {
      attempt,
      code,
      ...{
        wrong: {
          error:
            'That code didn’t match. Use the newest code from your app, or a recovery code.',
        },
        expired: { error: 'That took too long. Sign in again.', expired: true },
        limited: {
          error: 'Too many wrong codes. Wait a few minutes, then try again.',
        },
        suspended: { error: failures.suspended, expired: true },
        unavailable: { error: failures.unavailable },
      }[result.reason],
    };
  }
  await forgetChallenge();
  await keepSession(result.session);
  redirect(safeNextPath(formData.get('next')));
}

/**
 * Ends the session on the API, clears the cookie, and goes back to sign-in.
 * Clearing the cookie is what matters: the API session ends on its own.
 */
export async function signOut(): Promise<void> {
  try {
    await data.signOut();
  } catch {
    // Already ended, or the API can't be reached.
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/sign-in');
}

// Signing up ------------------------------------------------------------------

export type SignUpState = {
  error?: string;
  /** Which field the error is about; none for errors about the whole form. */
  field?: 'email' | 'password';
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
  const password = String(formData.get('password') ?? '');
  if (password.length < MIN_PASSWORD) {
    return { field: 'password', error: tooShort(password), email };
  }
  const parsed = signUpRequestSchema.safeParse({
    email,
    password,
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
  /** When the last link went, to wait a little before the next. */
  sentAt?: number;
};

/** Sends the link again, to the address this browser signed up with. */
export async function resendSignUpLink(): Promise<ResendState> {
  const parsed = signUpResendSchema.safeParse({
    email: (await pendingSignUp())?.email,
  });
  if (!parsed.success) return { error: 'Sign up again to get a new link.' };
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

/**
 * Opens the emailed link: creates the account and workspace, signs in, and
 * starts setting up. Only ever from a button, never on page load, so a mail
 * scanner opening the link can't use it up.
 */
export async function confirmEmail(
  previous: ConfirmEmailState,
  formData: FormData,
): Promise<ConfirmEmailState> {
  const password = String(formData.get('password') ?? '');
  const pending = await pendingSignUp();
  const parsed = signUpConfirmSchema.safeParse({
    token: formData.get('token') ?? '',
    browserKey: pending?.key,
    password: password || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === 'token') {
      if (pending) redirect('/sign-up/check-email?link=incomplete');
      return { error: 'This link is incomplete.', expired: true };
    }
    return { error: issue?.message, passwordRequired: true };
  }

  const result = await data.confirmSignUp(parsed.data);
  if (!result.ok) {
    if (result.reason === 'expired' && pending) {
      redirect('/sign-up/check-email?link=expired');
    }
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

// Passwords -------------------------------------------------------------------

export type ResetRequestState = {
  error?: string;
  email?: string;
  /** Shown for any address, so the page never says whether an account exists. */
  sent?: boolean;
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
  /** The link was used, ran out or is incomplete: get a new one. */
  expired?: boolean;
};

/**
 * Sets the new password and signs in with it. With two-factor on, the code
 * comes next, on the sign-in code page.
 */
export async function resetPassword(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const password = String(formData.get('password') ?? '');
  if (password.length < MIN_PASSWORD) return { error: tooShort(password) };
  const parsed = passwordResetConfirmSchema.safeParse({
    token: formData.get('token') ?? '',
    password,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return issue?.path[0] === 'token'
      ? { error: 'This reset link is incomplete.', expired: true }
      : { error: issue?.message };
  }

  const result = await data.confirmPasswordReset(parsed.data);
  if (!result.ok) {
    return result.reason === 'expired'
      ? { error: 'This link has expired or was already used.', expired: true }
      : result.reason === 'suspended'
        ? { error: failures.suspended, expired: true }
        : { error: failures.unavailable };
  }
  if ('challenge' in result) {
    await keepChallenge(result.challenge);
    redirect('/sign-in/two-factor');
  }
  await keepSession(result.session);
  redirect('/');
}

// Invites ---------------------------------------------------------------------

export type AcceptInviteState = {
  error?: string;
  /** The email already has an account: sign in instead. */
  taken?: boolean;
};

/**
 * Creates the account from an invite and signs in, then onboarding asks for
 * a name and two-factor sign-in.
 */
export async function acceptInvite(
  _previous: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const password = String(formData.get('password') ?? '');
  if (password.length < MIN_PASSWORD) return { error: tooShort(password) };
  const parsed = inviteAcceptSchema.safeParse({
    token: formData.get('token') ?? '',
    password,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return issue?.path[0] === 'token'
      ? {
          error:
            'This invite link is incomplete. Open it from the email again.',
        }
      : { error: issue?.message };
  }

  const result = await data.acceptInvite(parsed.data);
  if (!result.ok) {
    return {
      expired: {
        error:
          'This invite has expired, was withdrawn, or was already used. Ask for a new one.',
      },
      taken: { error: 'An account already uses this email.', taken: true },
      suspended: { error: failures.suspended },
      unavailable: { error: failures.unavailable },
    }[result.reason];
  }
  await keepSession(result.session);
  redirect('/onboarding');
}
