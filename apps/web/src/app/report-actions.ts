'use server';

import {
  recipientsUpdateSchema,
  reportEditSchema,
  reportSettingsUpdateSchema,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  type LogoType,
  type RecipientsUpdate,
  type ReportEdit,
  type ReportEmail,
  type ReportSettingsUpdate,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import * as data from '@/lib/data';
import type { ActionResult } from './actions';

/** Weekly reports on their way out: edits, sending, branding, recipients. */

const unavailable =
  'Couldn’t save that. Check the API is running and try again.';
const reportId = z.string().min(1).max(200);

async function attempt(
  change: () => Promise<{ ok: true } | { ok: false; problem: string }>,
  failure = unavailable,
): Promise<ActionResult> {
  try {
    const result = await change();
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    // Let "session expired, sign in again" through.
    unstable_rethrow(error);
    return { ok: false, error: failure };
  }
  refresh();
  return { ok: true };
}

const firstIssue = (error: z.ZodError) =>
  error.issues[0]?.message ?? 'Check what you entered.';

/** Rewords some of a draft's lines, or takes them out. */
export async function editReport(
  id: string,
  edit: ReportEdit,
): Promise<ActionResult> {
  const parsed = reportEditSchema.safeParse(edit);
  if (!reportId.safeParse(id).success || !parsed.success) {
    return {
      ok: false,
      error: parsed.success ? 'That isn’t a report.' : firstIssue(parsed.error),
    };
  }
  return attempt(() => data.editReport(id, parsed.data));
}

/** Sends an approved report to its client now. */
export async function sendReport(id: string): Promise<ActionResult> {
  if (!reportId.safeParse(id).success) {
    return { ok: false, error: 'That isn’t a report.' };
  }
  return attempt(
    () => data.sendReport(id),
    'Couldn’t send that. Check the API is running and try again.',
  );
}

export type PreviewResult =
  { ok: true; email: ReportEmail } | { ok: false; error: string };

/** The email a report goes out as. */
export async function previewReportEmail(id: string): Promise<PreviewResult> {
  if (!reportId.safeParse(id).success) {
    return { ok: false, error: 'That isn’t a report.' };
  }
  try {
    return { ok: true, email: await data.getReportEmail(id) };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false,
      error: 'Couldn’t show the email. Check the API is running and try again.',
    };
  }
}

export type SettingsState = {
  ok?: boolean;
  error?: string;
  /** The field the error is about. */
  field?: string;
  /** What was entered, to show again after a problem. */
  values?: Record<string, string>;
};

const SETTINGS_FIELDS = [
  'senderName',
  'replyTo',
  'brandColour',
  'draftHour',
  'sendHour',
];

/** A weekly time from its form fields, or null when the day is "off". */
function weeklyTime(formData: FormData, name: string) {
  const day = String(formData.get(`${name}Day`) ?? '');
  if (!day) return null;
  return {
    weekday: Number(day),
    hour: Number(formData.get(`${name}Hour`) ?? 0),
  };
}

/** Saves branding and the schedule, from the settings form. */
export async function saveReportSettings(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const update: ReportSettingsUpdate = {
    senderName: String(formData.get('senderName') ?? ''),
    replyTo: String(formData.get('replyTo') ?? ''),
    brandColour: String(formData.get('brandColour') ?? ''),
    draftAt: weeklyTime(formData, 'draft'),
    sendAt: weeklyTime(formData, 'send'),
  };
  const values = Object.fromEntries(
    SETTINGS_FIELDS.map((name) => [name, String(formData.get(name) ?? '')]),
  );
  const parsed = reportSettingsUpdateSchema.safeParse(update);
  if (!parsed.success) {
    return {
      error: firstIssue(parsed.error),
      field: String(parsed.error.issues[0]?.path[0] ?? ''),
      values,
    };
  }
  const result = await attempt(() => data.saveReportSettings(parsed.data));
  return result.ok ? { ok: true } : { error: result.error, values };
}

/** Uploads the logo chosen in the form. */
export async function uploadLogo(formData: FormData): Promise<ActionResult> {
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

export async function removeLogo(): Promise<ActionResult> {
  return attempt(() => data.saveLogo(null));
}

/** Replaces who a client's weekly report goes to. */
export async function saveRecipients(
  clientId: string,
  recipients: RecipientsUpdate['recipients'],
): Promise<ActionResult> {
  const parsed = recipientsUpdateSchema.safeParse({ recipients });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!reportId.safeParse(clientId).success) {
    return { ok: false, error: 'That isn’t a client.' };
  }
  return attempt(() => data.saveRecipients(clientId, parsed.data.recipients));
}
