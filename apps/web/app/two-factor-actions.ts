'use server';

import { twoFactorCodeSchema } from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import QRCode from 'qrcode';
import * as data from '@/lib/data/auth';

/**
 * Turning two-factor sign-in on and off, for onboarding and Settings. Each
 * returns what the screen shows next; the flow's state lives in the
 * browser's store, not here.
 */

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';

export type TwoFactorSetupResult =
  | {
      ok: true;
      /** Base32, for typing into the app by hand. */
      secret: string;
      /** The QR code, as an SVG data URI. */
      qr: string;
    }
  | { ok: false; error: string };

/** A new secret for the authenticator app, and its QR code. */
export async function setupTwoFactor(): Promise<TwoFactorSetupResult> {
  try {
    const result = await data.setupTwoFactor();
    if (!result.ok) return { ok: false, error: result.problem };
    // Drawn here, so the otpauth:// URI never needs a script in the browser.
    const svg = await QRCode.toString(result.setup.uri, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    return {
      ok: true,
      secret: result.setup.secret,
      qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
}

/**
 * Turns it on with a code from the app; the recovery codes come back once.
 * Doesn't refresh the page, so the codes stay on screen until they're saved.
 */
export async function enableTwoFactor(
  code: string,
): Promise<
  { ok: true; recoveryCodes: string[] } | { ok: false; error: string }
> {
  const parsed = twoFactorCodeSchema.safeParse({ code });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? unavailable };
  }
  try {
    const result = await data.enableTwoFactor(parsed.data.code);
    return result.ok
      ? { ok: true, recoveryCodes: result.recoveryCodes }
      : { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
}

/**
 * Turns it off with a code from the app or a recovery code. Refreshes the
 * page: for an account that must keep it on, the next render sends them to
 * set it up again.
 */
export async function disableTwoFactor(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = twoFactorCodeSchema.safeParse({ code });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? unavailable };
  }
  try {
    const result = await data.disableTwoFactor(parsed.data.code);
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}
