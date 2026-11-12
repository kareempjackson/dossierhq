import 'server-only';
import {
  intelligenceSettingsSchema,
  type IntelligencePreferences,
  type IntelligenceSettings,
  type ModelId,
  type ProviderId,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { apiGet, apiSend } from '../api';
import { refused } from './refused';

/**
 * How Dossier drafts for the workspace, through the API: the model, the
 * keys it runs on, what it may draft, look for and read, and what it has
 * cost. Every change answers with the settings as they now stand.
 */

type Refused = { ok: false; problem: string };
type Result = { ok: true; settings: IntelligenceSettings } | Refused;

/** The model, keys, preferences and the last 30 days' spend. */
export const getIntelligence = cache((): Promise<IntelligenceSettings> =>
  apiGet('/intelligence', intelligenceSettingsSchema),
);

async function change(
  method: 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Result> {
  try {
    const settings = await apiSend(
      method,
      path,
      body,
      intelligenceSettingsSchema,
      // Keys are checked with their provider first, which can take a while.
      { timeoutMs: 30_000 },
    );
    return { ok: true, settings };
  } catch (error) {
    return refused(error);
  }
}

/** Chooses the model Dossier drafts with; null goes back to the default. */
export const chooseModel = (model: ModelId | null) =>
  change('PUT', '/intelligence', { model });

/** Keeps the workspace's own key for a provider, once the provider takes it. */
export const saveKey = (provider: ProviderId, key: string) =>
  change('PUT', `/intelligence/keys/${provider}`, { key });

/** Forgets the workspace's key for a provider. */
export const removeKey = (provider: ProviderId) =>
  change('DELETE', `/intelligence/keys/${provider}`);

/** What Dossier drafts, looks for and may read: all of it, every time. */
export const savePreferences = (preferences: IntelligencePreferences) =>
  change('PUT', '/intelligence/preferences', preferences);

/** Starts drafting every client's recommendations now; drafts follow. */
export async function draftNow(): Promise<{ ok: true } | Refused> {
  try {
    await apiSend('POST', '/intelligence/draft');
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** Starts looking for patterns across clients now; they follow. */
export async function findPatternsNow(): Promise<{ ok: true } | Refused> {
  try {
    await apiSend('POST', '/intelligence/patterns');
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}
