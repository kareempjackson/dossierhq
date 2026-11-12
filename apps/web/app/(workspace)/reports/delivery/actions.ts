'use server';

import {
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  reportSettingsUpdateSchema,
  type LogoType,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import * as data from '@/lib/data/delivery';

/**
 * Saving how weekly reports look and when they go: the form's fields, then
 * the logo (a new one, or taking it away), which the API keeps apart.
 */

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';

export type DeliveryState = {
  saved?: boolean;
  error?: string;
  /** The field the error is about, to mark it. */
  field?: string;
};

/** A day and an hour each week from `<name>Day` and `<name>Hour`; no day is off. */
function weeklyTime(formData: FormData, name: 'draft' | 'send') {
  const day = String(formData.get(`${name}Day`) ?? '');
  if (!day) return null;
  return {
    weekday: Number(day),
    hour: Number(formData.get(`${name}Hour`) ?? ''),
  };
}

const isLogoType = (type: string): type is LogoType =>
  (LOGO_TYPES as readonly string[]).includes(type);

export async function saveDelivery(
  _previous: DeliveryState,
  formData: FormData,
): Promise<DeliveryState> {
  const parsed = reportSettingsUpdateSchema.safeParse({
    senderName: String(formData.get('senderName') ?? ''),
    replyTo: String(formData.get('replyTo') ?? ''),
    brandColour: String(formData.get('brandColour') ?? ''),
    draftAt: weeklyTime(formData, 'draft'),
    sendAt: weeklyTime(formData, 'send'),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? '');
    return {
      field,
      error:
        field === 'draftAt' || field === 'sendAt'
          ? 'Choose a day and an hour.'
          : (issue?.message ?? 'Check the settings and try again.'),
    };
  }

  // The logo is checked before anything is saved.
  const file = formData.get('logo');
  const logo = file instanceof File && file.size > 0 ? file : null;
  if (logo && !isLogoType(logo.type)) {
    return {
      field: 'logo',
      error: 'Use a PNG or JPEG. Gmail and Outlook don’t show SVG logos.',
    };
  }
  if (logo && logo.size > LOGO_MAX_BYTES) {
    return { field: 'logo', error: 'Keep the logo under 256 KB.' };
  }
  const removing = !logo && formData.get('removeLogo') === '1';

  try {
    const saved = await data.saveReportSettings(parsed.data);
    if (!saved.ok) return { error: saved.problem };
    if (logo || removing) {
      const changed = logo
        ? await data.saveLogo({
            bytes: new Uint8Array(await logo.arrayBuffer()),
            type: logo.type as LogoType,
          })
        : await data.removeLogo();
      if (!changed.ok) {
        // The rest was saved; show it, and why the logo wasn't.
        refresh();
        return {
          field: 'logo',
          error: `Saved, except the logo: ${changed.problem}`,
        };
      }
    }
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable };
  }
  refresh();
  return { saved: true };
}
