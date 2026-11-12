'use server';

import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import * as data from '@/lib/data/intelligence';
import type { SwitchGroup } from '@/lib/settings-views';

/**
 * The Intelligence page: what Dossier drafts, looks for and may read, and
 * asking it to draft or look across clients now. Owners and admins only;
 * the API words the no for anyone else.
 */

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';

export type ActionResult = { ok: true } | { ok: false; error: string };

const GROUPS: SwitchGroup[] = ['outputs', 'topics', 'records'];

/**
 * Turns one switch on or off. The API takes every switch at once, along
 * with the default writing style, so this reads them as they stand first
 * and changes only the one.
 */
export async function setIntelligenceSwitch(
  group: string,
  id: string,
  on: boolean,
): Promise<ActionResult> {
  if (!GROUPS.includes(group as SwitchGroup) || typeof on !== 'boolean') {
    return { ok: false, error: 'That isn’t a switch Dossier has.' };
  }
  try {
    const { preferences } = await data.getIntelligence();
    const switches: Record<string, boolean> = preferences[group as SwitchGroup];
    if (!Object.hasOwn(switches, id)) {
      return { ok: false, error: 'That isn’t a switch Dossier has.' };
    }
    const result = await data.savePreferences({
      ...preferences,
      [group]: { ...switches, [id]: on },
    });
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}

export type StartState = { error?: string; started?: boolean };

/** Drafts every client's recommendations now, even where nothing changed. */
export async function draftRecommendationsNow(): Promise<StartState> {
  return start(data.draftNow);
}

/** Looks for the same problem across clients now. */
export async function lookForPatterns(): Promise<StartState> {
  return start(data.findPatternsNow);
}

async function start(
  run: () => Promise<{ ok: true } | { ok: false; problem: string }>,
): Promise<StartState> {
  try {
    const result = await run();
    return result.ok ? { started: true } : { error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable };
  }
}
