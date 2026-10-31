'use server';

import {
  recommendationUpdateSchema,
  reportQuestionCreateSchema,
  reportStatusSchema,
  type RecommendationUpdate,
  type ReportStatus,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
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
    // Refused, e.g. "Support access is read-only.": say so, in its words.
    if (error instanceof ApiError && error.status === 403 && error.problem) {
      return { ok: false, error: error.problem };
    }
    return { ok: false, error: failure };
  }
  refresh();
  return { ok: true };
}

/** Like attempt, for changes the API can refuse in words. */
async function attemptRefusable(
  change: () => Promise<{ ok: true } | { ok: false; problem: string }>,
  failure: string,
): Promise<ActionResult> {
  try {
    const result = await change();
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
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
  return attemptRefusable(
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
  return attemptRefusable(
    () => data.setReportsStatus(parsed.data.ids, parsed.data.status),
    'Couldn’t save that. Check the API is running and try again.',
  );
}

export type DraftResult =
  { ok: true; ids: string[] } | { ok: false; error: string };

/** Drafts this week's report now for one client, or with none, for all. */
export async function draftReports(clientId?: string): Promise<DraftResult> {
  const parsed = z.string().min(1).max(100).optional().safeParse(clientId);
  if (!parsed.success) return { ok: false, error: 'That isn’t a client.' };
  try {
    const result = await data.draftReports(parsed.data);
    if (!result.ok) return { ok: false, error: result.problem };
    refresh();
    return { ok: true, ids: result.reports.map((report) => report.id) };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false,
      error: 'Couldn’t draft that. Check the API is running and try again.',
    };
  }
}

/** Saves a question for reports to answer, or with an ID, changes it. */
export async function saveReportQuestion(
  id: string | null,
  input: { text: string; clientId: string | null },
): Promise<ActionResult> {
  const parsed = reportQuestionCreateSchema.safeParse(input);
  if (!parsed.success || (id !== null && !id)) {
    return {
      ok: false,
      error: parsed.error?.issues[0]?.message ?? 'That isn’t a valid change.',
    };
  }
  try {
    const result = await data.saveReportQuestion(id, parsed.data);
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false,
      error: 'Couldn’t save that. Check the API is running and try again.',
    };
  }
  refresh();
  return { ok: true };
}

export async function deleteReportQuestion(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: 'That isn’t a question.' };
  return attempt(
    () => data.deleteReportQuestion(id),
    'Couldn’t remove that. Check the API is running and try again.',
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

const meetingInput = z.object({
  meetingId: z.string().min(1).max(200),
  clientId: z.string().min(1).max(100).nullable(),
});

/** Attaches a recorded meeting to a client by hand; null undoes that. */
export async function attachMeeting(
  meetingId: string,
  clientId: string | null,
): Promise<ActionResult> {
  const parsed = meetingInput.safeParse({ meetingId, clientId });
  if (!parsed.success)
    return { ok: false, error: 'That isn’t a valid change.' };
  return attempt(
    () => data.attachMeeting(parsed.data.meetingId, parsed.data.clientId),
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
