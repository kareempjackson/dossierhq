import 'server-only';
import {
  intelligenceSettingsSchema,
  listOf,
  memoryStatusSchema,
  patternSchema,
  type IntelligencePreferences,
  type IntelligenceSettings,
  type MemoryStatus,
  type ModelId,
  type Pattern,
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

/**
 * Chooses the model that reads each ticket and person; null follows the
 * cheapest model from the drafting model's provider.
 */
export const chooseReadingModel = (model: ModelId | null) =>
  change('PUT', '/intelligence/reading', { model });

/** Keeps the workspace's own key for a provider, once the provider takes it. */
export const saveKey = (provider: ProviderId, key: string) =>
  change('PUT', `/intelligence/keys/${provider}`, { key });

/** Forgets the workspace's key for a provider. */
export const removeKey = (provider: ProviderId) =>
  change('DELETE', `/intelligence/keys/${provider}`);

/**
 * Sets the dollars a day the workspace's own key may spend on the work
 * Dossier does by itself; null goes back to the default.
 */
export const saveDailyBudget = (dailyBudget: number | null) =>
  change('PUT', '/intelligence/budget', { dailyBudget });

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

/**
 * The same problem at several clients, most important first. Empty while
 * patterns are off, and before Dossier has found any.
 */
export const getPatterns = cache(
  async (): Promise<Pattern[]> =>
    (await apiGet('/patterns', listOf(patternSchema))).data,
);

/** What Dossier remembers of past records, and whether it's reading more. */
export const getMemoryStatus = cache((): Promise<MemoryStatus> =>
  apiGet('/intelligence/memory', memoryStatusSchema),
);

/** Reads every past record into memory now, not after each sync. Admins. */
export async function backfillMemory(): Promise<{ ok: true } | Refused> {
  try {
    await apiSend('POST', '/intelligence/memory/backfill');
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}
