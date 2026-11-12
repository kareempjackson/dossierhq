import 'server-only';
import {
  reportSettingsSchema,
  type LogoType,
  type ReportSettings,
  type ReportSettingsUpdate,
} from '@dossierhq/contracts';
import { apiSend, apiUpload } from '../api';
import { refused } from './refused';

/**
 * Changing how weekly reports look when they go out, and when they're
 * drafted and sent, through the API. Owners and admins only. Reading them
 * is `getReportSettings` in ./client-records.
 */

type Result =
  { ok: true; settings: ReportSettings } | { ok: false; problem: string };

async function attempt(run: () => Promise<ReportSettings>): Promise<Result> {
  try {
    return { ok: true, settings: await run() };
  } catch (error) {
    return refused(error);
  }
}

/** Everything but the logo. */
export const saveReportSettings = (update: ReportSettingsUpdate) =>
  attempt(() =>
    apiSend('PUT', '/report-settings', update, reportSettingsSchema),
  );

/** Replaces the logo with a PNG or JPEG of at most 256 KB. */
export const saveLogo = (logo: {
  bytes: Uint8Array<ArrayBuffer>;
  type: LogoType;
}) =>
  attempt(() =>
    apiUpload('PUT', '/report-settings/logo', logo, reportSettingsSchema),
  );

/** Goes back to the sender's name in the logo's place. */
export const removeLogo = () =>
  attempt(() =>
    apiSend('DELETE', '/report-settings/logo', undefined, reportSettingsSchema),
  );
