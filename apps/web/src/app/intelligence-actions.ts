'use server';

import {
  intelligencePreferencesSchema,
  modelIdSchema,
  type IntelligencePreferences,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { ApiError } from '@/lib/api';
import * as data from '@/lib/data';
import type { ActionResult } from './actions';

const unavailable =
  'Couldn’t save that. Check the API is running and try again.';

/** Chooses the model Dossier drafts with; null follows the default. */
export async function setIntelligenceModel(
  model: string | null,
): Promise<ActionResult> {
  const parsed = modelIdSchema.nullable().safeParse(model);
  if (!parsed.success) {
    return { ok: false, error: 'That isn’t a model Dossier offers.' };
  }
  try {
    await data.setIntelligenceModel(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && error.status === 403 && error.problem) {
      return { ok: false, error: error.problem };
    }
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}

/** What Dossier drafts, what it looks for, and what Claude may read. */
export async function setIntelligencePreferences(
  preferences: IntelligencePreferences,
): Promise<ActionResult> {
  const parsed = intelligencePreferencesSchema.safeParse(preferences);
  if (!parsed.success) {
    return { ok: false, error: 'That isn’t a valid change.' };
  }
  try {
    await data.setIntelligencePreferences(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && error.status === 403 && error.problem) {
      return { ok: false, error: error.problem };
    }
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}

/** Drafts every client's recommendations now, even where nothing changed. */
export async function draftRecommendationsNow(): Promise<ActionResult> {
  try {
    const result = await data.draftRecommendationsNow();
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  return { ok: true };
}
