'use server';

import {
  signInRequestSchema,
  staffInviteAcceptSchema,
  twoFactorSignInSchema,
  type StaffSession,
} from '@dossierhq/contracts';
import { cookies } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import QRCode from 'qrcode';
import * as data from '@/lib/data';
import { SESSION_COOKIE, safeNextPath } from '@/lib/session';

const unavailable =
  'Dossier Admin can’t reach its server right now. Try again shortly.';

export type SignInState = {
  error?: string;
  /** Echoed back so a failed attempt keeps the email in the field. */
  email?: string;
  /** The password was right: ask for the code. */
  challenge?: string;
};

const failures = {
  invalid: 'That email and password don’t match a staff account.',
  locked: 'Too many attempts. Wait a few minutes, then try again.',
  unavailable,
} as const;

/** Checks the password, then asks for the code. */
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
  return { challenge: result.challenge, email };
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
      expired: { error: 'That took too long. Sign in again.', expired: true },
      limited: {
        error: 'Too many wrong codes. Wait a few minutes, then try again.',
      },
      unavailable: { error: unavailable },
    }[result.reason];
  }
  await keepSession(result.session);
  redirect(safeNextPath(formData.get('next')));
}

export async function signOut(): Promise<void> {
  await data.signOut().catch(() => {});
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/sign-in');
}

/** Stores the session token where only the server can read it. */
async function keepSession(session: StaffSession) {
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    // Strict: nothing on another site can make a request that carries it.
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(session.expiresAt),
  });
}

// Joining from an invite --------------------------------------------------------

export type InviteSetupResult =
  | {
      ok: true;
      /** Base32, for typing into the app by hand. */
      secret: string;
      /** The QR code, as an SVG data URI. */
      qr: string;
      /** Sent back with the first code. */
      sealed: string;
    }
  | { ok: false; error: string };

/** A new authenticator secret for the person joining, and its QR code. */
export async function setupInvite(token: string): Promise<InviteSetupResult> {
  try {
    const result = await data.setupInvite(token);
    if (!result.ok) return { ok: false, error: result.problem };
    const svg = await QRCode.toString(result.setup.uri, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    return {
      ok: true,
      secret: result.setup.secret,
      qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      sealed: result.setup.sealed,
    };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
}

export type AcceptState = {
  error?: string;
  /** Joined: the recovery codes, shown this once. */
  recoveryCodes?: string[];
};

/** Makes the account with two-factor on, signs in, and shows the recovery codes. */
export async function acceptInvite(
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const parsed = staffInviteAcceptSchema.safeParse({
    token: formData.get('token') ?? '',
    name: formData.get('name') ?? '',
    password: formData.get('password') ?? '',
    sealed: formData.get('sealed') ?? '',
    code: formData.get('code') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    const result = await data.acceptInvite(parsed.data);
    if (!result.ok) return { error: result.problem };
    await keepSession(result.accepted);
    return { recoveryCodes: result.accepted.recoveryCodes };
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable };
  }
}
