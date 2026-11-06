import 'server-only';
import {
  invitePreviewSchema,
  meSchema,
  onboardingSchema,
  passwordResetStepSchema,
  sessionsSchema,
  signInResponseSchema,
  signInStepSchema,
  signUpConfirmStepSchema,
  twoFactorEnabledSchema,
  twoFactorSetupSchema,
  twoFactorStatusSchema,
  type CompanyUpdate,
  type InviteAccept,
  type InvitePreview,
  type Me,
  type Onboarding,
  type PasswordResetConfirm,
  type PasswordResetRequest,
  type ProfileUpdate,
  type Sessions,
  type SignInRequest,
  type SignInResponse,
  type SignUpConfirm,
  type SignUpRequest,
  type TwoFactorSetup,
  type TwoFactorSignIn,
  type TwoFactorStatus,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { ApiError, apiGet, apiSend, isSuspended } from '../api';
import { refused } from './refused';

/**
 * Signing in and out, signing up, passwords, invites, two-factor and
 * onboarding, through the API. The functions behind a form never throw for
 * a 4xx: they return `{ ok: false, reason }` for the action to word. Reads
 * are de-duplicated within a request by React's cache().
 */

// Session ---------------------------------------------------------------------

/** Who is signed in, and the workspace the session acts on. */
export const getMe = cache((): Promise<Me> => apiGet('/auth/me', meSchema));

export type SignInResult =
  | { ok: true; session: SignInResponse }
  /** The password was right; now a two-factor code, with this challenge. */
  | { ok: true; challenge: string }
  /** The password was right, but the sign-up's link hasn't been opened. */
  | { ok: true; emailUnconfirmed: true }
  | {
      ok: false;
      reason:
        'invalid' | 'locked' | 'no-workspace' | 'suspended' | 'unavailable';
    };

/** Checks credentials with the API. Never throws for a wrong password. */
export async function signIn(request: SignInRequest): Promise<SignInResult> {
  try {
    const step = await apiSend(
      'POST',
      '/auth/sign-in',
      request,
      signInStepSchema,
      { session: 'none' },
    );
    if ('emailUnconfirmed' in step) return { ok: true, emailUnconfirmed: true };
    return 'challenge' in step
      ? { ok: true, challenge: step.challenge }
      : { ok: true, session: step };
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 400)
    ) {
      return { ok: false, reason: 'invalid' };
    }
    if (error instanceof ApiError && error.status === 429) {
      return { ok: false, reason: 'locked' };
    }
    if (isSuspended(error)) return { ok: false, reason: 'suspended' };
    if (error instanceof ApiError && error.status === 403) {
      return { ok: false, reason: 'no-workspace' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

export type TwoFactorResult =
  | { ok: true; session: SignInResponse }
  | {
      ok: false;
      reason: 'wrong' | 'expired' | 'limited' | 'suspended' | 'unavailable';
    };

/** Finishes a two-factor sign-in. Never throws for a 4xx. */
export async function completeTwoFactor(
  request: TwoFactorSignIn,
): Promise<TwoFactorResult> {
  try {
    const session = await apiSend(
      'POST',
      '/auth/sign-in/two-factor',
      request,
      signInResponseSchema,
      { session: 'none' },
    );
    return { ok: true, session };
  } catch (error) {
    if (isSuspended(error)) return { ok: false, reason: 'suspended' };
    if (error instanceof ApiError && error.status === 401) {
      return { ok: false, reason: 'wrong' };
    }
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, reason: 'expired' };
    }
    if (error instanceof ApiError && error.status === 429) {
      return { ok: false, reason: 'limited' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

export function signOut(): Promise<void> {
  // Never redirects: signing out of an already-expired session still has to
  // reach the cookie-clearing step in the action.
  return apiSend('POST', '/auth/sign-out', undefined, undefined, {
    session: 'best-effort',
  });
}

/** This browser's session, and how many others the user has live. */
export const getSessions = cache((): Promise<Sessions> =>
  apiGet('/auth/sessions', sessionsSchema),
);

/** Signs the user out everywhere but this browser. */
export function signOutOthers(): Promise<void> {
  return apiSend('POST', '/auth/sessions/sign-out-others');
}

// Signing up ------------------------------------------------------------------

export type SignUpResult =
  { ok: true } | { ok: false; reason: 'invalid' | 'limited' | 'unavailable' };

/**
 * Emails a link to confirm the address; the API answers the same whether or
 * not it has an account. Never throws for a 4xx.
 */
export function signUp(request: SignUpRequest): Promise<SignUpResult> {
  return sendLink('/auth/sign-up', request);
}

/** Sends the sign-up link again, if one is waiting. Never throws for a 4xx. */
export function resendSignUp(email: string): Promise<SignUpResult> {
  return sendLink('/auth/sign-up/resend', { email });
}

async function sendLink(path: string, body: unknown): Promise<SignUpResult> {
  try {
    await apiSend('POST', path, body, undefined, { session: 'none' });
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return { ok: false, reason: 'limited' };
    }
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

export type ConfirmSignUpResult =
  | { ok: true; session: SignInResponse }
  /** Opened away from the browser that signed up: ask for the password. */
  | { ok: true; passwordRequired: true }
  | {
      ok: false;
      reason:
        'expired' | 'wrong-password' | 'taken' | 'limited' | 'unavailable';
    };

/** Opens a sign-up's link. Never throws for a 4xx. */
export async function confirmSignUp(
  request: SignUpConfirm,
): Promise<ConfirmSignUpResult> {
  try {
    const step = await apiSend(
      'POST',
      '/auth/sign-up/confirm',
      request,
      signUpConfirmStepSchema,
      { session: 'none' },
    );
    return 'passwordRequired' in step
      ? { ok: true, passwordRequired: true }
      : { ok: true, session: step };
  } catch (error) {
    if (error instanceof ApiError) {
      const reason = (
        {
          400: 'expired',
          401: 'wrong-password',
          409: 'taken',
          429: 'limited',
        } as const
      )[error.status];
      if (reason) return { ok: false, reason };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

// Passwords -------------------------------------------------------------------

export type ResetRequestResult =
  { ok: true } | { ok: false; reason: 'invalid' | 'limited' | 'unavailable' };

/** Asks for a reset link by email. Never throws for a 4xx. */
export async function requestPasswordReset(
  request: PasswordResetRequest,
): Promise<ResetRequestResult> {
  try {
    await apiSend('POST', '/auth/password-reset', request, undefined, {
      session: 'none',
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return { ok: false, reason: 'limited' };
    }
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

export type ResetResult =
  | { ok: true; session: SignInResponse }
  /** Set, but two-factor is on: the code comes next, with this challenge. */
  | { ok: true; challenge: string }
  | { ok: false; reason: 'expired' | 'suspended' | 'unavailable' };

/** Sets a new password with a reset link's token. Never throws for a 4xx. */
export async function confirmPasswordReset(
  request: PasswordResetConfirm,
): Promise<ResetResult> {
  try {
    const step = await apiSend(
      'POST',
      '/auth/password-reset/confirm',
      request,
      passwordResetStepSchema,
      { session: 'none' },
    );
    return 'challenge' in step
      ? { ok: true, challenge: step.challenge }
      : { ok: true, session: step };
  } catch (error) {
    // The password was checked before sending, so a 400 is the link itself.
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, reason: 'expired' };
    }
    if (isSuspended(error)) return { ok: false, reason: 'suspended' };
    return { ok: false, reason: 'unavailable' };
  }
}

// Invites ---------------------------------------------------------------------

/** What an invite link is for; null when it can't be used. Needs no session. */
export async function previewInvite(
  token: string,
): Promise<InvitePreview | null> {
  try {
    return await apiSend(
      'POST',
      '/auth/invites/preview',
      { token },
      invitePreviewSchema,
      { session: 'none' },
    );
  } catch (error) {
    // A suspended workspace's invites can't be used until it's restored.
    if (error instanceof ApiError && error.status === 400) return null;
    if (isSuspended(error)) return null;
    throw error;
  }
}

export type AcceptInviteResult =
  | { ok: true; session: SignInResponse }
  | { ok: false; reason: 'expired' | 'taken' | 'suspended' | 'unavailable' };

/** Accepts an invite. Never throws for a 4xx. */
export async function acceptInvite(
  request: InviteAccept,
): Promise<AcceptInviteResult> {
  try {
    const session = await apiSend(
      'POST',
      '/auth/invites/accept',
      request,
      signInResponseSchema,
      { session: 'none' },
    );
    return { ok: true, session };
  } catch (error) {
    // The fields were checked before sending, so a 400 is the invite itself.
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, reason: 'expired' };
    }
    if (error instanceof ApiError && error.status === 409) {
      return { ok: false, reason: 'taken' };
    }
    if (isSuspended(error)) return { ok: false, reason: 'suspended' };
    return { ok: false, reason: 'unavailable' };
  }
}

// Two-factor ------------------------------------------------------------------

/** The signed-in person's two-factor sign-in. */
export const getTwoFactor = cache((): Promise<TwoFactorStatus> =>
  apiGet('/auth/two-factor', twoFactorStatusSchema),
);

/** A new secret for the authenticator app, and its otpauth:// URI. */
export async function setupTwoFactor(): Promise<
  { ok: true; setup: TwoFactorSetup } | { ok: false; problem: string }
> {
  try {
    return {
      ok: true,
      setup: await apiSend(
        'POST',
        '/auth/two-factor/setup',
        undefined,
        twoFactorSetupSchema,
      ),
    };
  } catch (error) {
    return refused(error);
  }
}

/** Turns it on with a code from the app; the recovery codes come back once. */
export async function enableTwoFactor(
  code: string,
): Promise<
  { ok: true; recoveryCodes: string[] } | { ok: false; problem: string }
> {
  try {
    const { recoveryCodes } = await apiSend(
      'POST',
      '/auth/two-factor/enable',
      { code },
      twoFactorEnabledSchema,
    );
    return { ok: true, recoveryCodes };
  } catch (error) {
    return refused(error);
  }
}

/** Turns it off with a code from the app or a recovery code. */
export async function disableTwoFactor(
  code: string,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend('POST', '/auth/two-factor/disable', { code });
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

// Onboarding ------------------------------------------------------------------

/** What onboarding has saved so far, to pick up from. */
export const getOnboarding = cache((): Promise<Onboarding> =>
  apiGet('/onboarding', onboardingSchema),
);

/** Your name and what you do. */
export async function saveOnboardingProfile(
  profile: ProfileUpdate,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend('PUT', '/onboarding/profile', profile, onboardingSchema);
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** Any of the company's details; the rest stay. Owners and admins only. */
export async function saveOnboardingCompany(
  changes: CompanyUpdate,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend('PUT', '/onboarding/company', changes, onboardingSchema);
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** Finishes onboarding; the API says no until two-factor is on. */
export async function finishOnboarding(): Promise<
  { ok: true; me: Me } | { ok: false; problem: string }
> {
  try {
    return {
      ok: true,
      me: await apiSend('POST', '/onboarding/finish', undefined, meSchema),
    };
  } catch (error) {
    return refused(error);
  }
}
