'use server';

import {
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  companyUpdateSchema,
  inviteCreateSchema,
  profileUpdateSchema,
  reportSettingsUpdateSchema,
  type CompanyUpdate,
  type Invite,
  type InviteCreate,
  type LogoType,
  type Onboarding,
  type ProfileUpdate,
  type ReportSettings,
} from '@dossierhq/contracts';
import { redirect, unstable_rethrow } from 'next/navigation';
import * as data from '@/lib/data';
import { safeNextPath } from '@/lib/session';
import type { ActionResult } from './actions';

/**
 * Onboarding's steps. Each checks what it's given, saves it through the API,
 * and hands back what the next step shows. Nothing refreshes the page: the
 * flow keeps its own state between steps.
 */

const unavailable = 'Couldn’t save that. Check your connection and try again.';

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

async function attempt<T>(
  run: () => Promise<({ ok: true } & T) | { ok: false; problem: string }>,
): Promise<Result<T>> {
  try {
    const result = await run();
    return result.ok ? result : { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
}

export async function saveProfile(
  profile: ProfileUpdate,
): Promise<ActionResult> {
  const parsed = profileUpdateSchema.safeParse(profile);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? unavailable };
  }
  return attempt(() => data.saveOnboardingProfile(parsed.data));
}

/** Any of the company's details; what isn't given stays as it is. */
export async function saveCompany(
  changes: CompanyUpdate,
): Promise<Result<{ onboarding: Onboarding }>> {
  const parsed = companyUpdateSchema.safeParse(changes);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? unavailable };
  }
  // As typed: the API tidies the website itself.
  return attempt(() => data.saveOnboardingCompany(changes));
}

/** Who report emails are from, and their colour; the schedule stays as it is. */
export async function saveBranding(branding: {
  senderName: string;
  replyTo: string;
  brandColour: string;
}): Promise<Result<{ settings: ReportSettings }>> {
  try {
    const current = await data.getReportSettings();
    const parsed = reportSettingsUpdateSchema.safeParse({
      ...branding,
      draftAt: current.draftAt,
      sendAt: current.sendAt,
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? unavailable,
      };
    }
    return await attempt(() => data.saveReportSettings(parsed.data));
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
}

/** Uploads the logo; the new settings carry it as a data URL. */
export async function uploadBrandLogo(
  formData: FormData,
): Promise<Result<{ settings: ReportSettings }>> {
  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose a PNG or JPEG to upload.' };
  }
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error:
        'Use a PNG or JPEG. Gmail and Outlook don’t show SVG logos in email.',
    };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, error: 'Keep the logo under 256 KB.' };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return attempt(() => data.saveLogo({ bytes, type: file.type as LogoType }));
}

export async function removeBrandLogo(): Promise<
  Result<{ settings: ReportSettings }>
> {
  return attempt(() => data.saveLogo(null));
}

export async function sendInvite(
  invite: InviteCreate,
): Promise<Result<{ invite: Invite }>> {
  const parsed = inviteCreateSchema.safeParse(invite);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? unavailable };
  }
  return attempt(() => data.inviteMember(parsed.data));
}

/** Finishes onboarding and goes on to `next`, on this site. */
export async function finishOnboarding(next: string): Promise<ActionResult> {
  const result = await attempt(() => data.finishOnboarding());
  if (!result.ok) return result;
  redirect(safeNextPath(next));
}
