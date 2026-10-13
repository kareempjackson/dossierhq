'use server';

import {
  recommendationUpdateSchema,
  reportStatusSchema,
  type RecommendationUpdate,
  type ReportStatus,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import * as data from '@/lib/data';

/**
 * Server Actions behind the buttons. Each validates its input (actions are
 * public endpoints), calls the API through lib/data, then refreshes the page
 * so it shows the new state.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const ids = z.array(z.string().min(1)).min(1).max(100);

async function attempt(
  change: () => Promise<unknown>,
  failure: string,
): Promise<ActionResult> {
  try {
    await change();
  } catch (error) {
    // Let "session expired, sign in again" through.
    unstable_rethrow(error);
    return { ok: false, error: failure };
  }
  refresh();
  return { ok: true };
}

export async function setReportStatus(
  id: string,
  status: ReportStatus,
): Promise<ActionResult> {
  const input = z.object({ id: z.string().min(1), status: reportStatusSchema });
  const parsed = input.safeParse({ id, status });
  if (!parsed.success)
    return { ok: false, error: 'That isn’t a valid change.' };
  return attempt(
    () => data.setReportStatus(parsed.data.id, parsed.data.status),
    'Couldn’t save that. Check the API is running and try again.',
  );
}

export async function setReportsStatus(
  reportIds: string[],
  status: ReportStatus,
): Promise<ActionResult> {
  const input = z.object({ ids, status: reportStatusSchema });
  const parsed = input.safeParse({ ids: reportIds, status });
  if (!parsed.success)
    return { ok: false, error: 'That isn’t a valid change.' };
  return attempt(
    () => data.setReportsStatus(parsed.data.ids, parsed.data.status),
    'Couldn’t save that. Check the API is running and try again.',
  );
}

export async function updateRecommendation(
  id: string,
  update: RecommendationUpdate,
): Promise<ActionResult> {
  const parsed = recommendationUpdateSchema.safeParse(update);
  if (!parsed.success || !id) {
    return {
      ok: false,
      error: parsed.error?.issues[0]?.message ?? 'That isn’t a valid change.',
    };
  }
  return attempt(
    () => data.updateRecommendation(id, parsed.data),
    'Couldn’t save that. Check the API is running and try again.',
  );
}

/** Feeds "Recent clients". Failures are ignored: it's a convenience. */
export async function recordClientView(clientId: string): Promise<void> {
  if (!clientId) return;
  try {
    await data.recordClientView(clientId);
    refresh();
  } catch (error) {
    unstable_rethrow(error);
    // Not worth interrupting anyone over.
  }
}
