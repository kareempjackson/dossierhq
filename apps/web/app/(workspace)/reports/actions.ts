'use server';

import {
  reportEditSchema,
  reportQuestionCreateSchema,
  reportQuestionUpdateSchema,
  reportStatusSchema,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import * as data from '@/lib/data/reports';

/**
 * Weekly reports: drafting them now, approving or skipping one, rewording
 * its lines, sending it, and the questions every report answers. Each
 * checks what it's given with the API's own schema, asks the API, words
 * its no, and reads again.
 */

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';
const reportId = z.string().min(1).max(200);

export type ActionResult = { ok: true } | { ok: false; error: string };

async function attempt(
  run: () => Promise<{ ok: true } | { ok: false; problem: string }>,
): Promise<ActionResult> {
  try {
    const result = await run();
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}

export type DraftState = { error?: string; drafted?: number };

/** Drafts this week's report for every client now. */
export async function draftReportsNow(): Promise<DraftState> {
  try {
    const result = await data.draftReports();
    if (!result.ok) return { error: result.problem };
    refresh();
    return { drafted: result.drafted };
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable };
  }
}

/** Approves or skips a report, or with `draft` puts it back to review. */
export async function decideReport(
  id: string,
  status: string,
): Promise<ActionResult> {
  const parsed = reportStatusSchema.safeParse(status);
  if (!reportId.safeParse(id).success || !parsed.success) {
    return { ok: false, error: 'That isn’t a report Dossier has.' };
  }
  return attempt(() => data.setReportStatus(id, parsed.data));
}

/** Rewords some of a draft's lines and takes others out. */
export async function editReport(
  id: string,
  lines: { id: string; text: string }[],
  remove: string[],
): Promise<ActionResult> {
  const parsed = reportEditSchema.safeParse({ lines, remove });
  if (!reportId.safeParse(id).success || !parsed.success) {
    return {
      ok: false,
      error: parsed.success
        ? 'That isn’t a report Dossier has.'
        : (parsed.error.issues[0]?.message ?? 'Check the changes.'),
    };
  }
  return attempt(() => data.editReport(id, parsed.data));
}

/** Sends an approved report to its client now. */
export async function sendReport(id: string): Promise<ActionResult> {
  if (!reportId.safeParse(id).success) {
    return { ok: false, error: 'That isn’t a report Dossier has.' };
  }
  return attempt(() => data.sendReport(id));
}

/** Saves a question for reports to answer; no client asks every client. */
export async function addQuestion(
  text: string,
  clientId: string | null,
): Promise<ActionResult> {
  const parsed = reportQuestionCreateSchema.safeParse({ text, clientId });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the question.',
    };
  }
  return attempt(() => data.addQuestion(parsed.data));
}

/** Rewords a saved question. */
export async function rewordQuestion(
  id: string,
  text: string,
): Promise<ActionResult> {
  const parsed = reportQuestionUpdateSchema.safeParse({ text });
  if (!id || !parsed.success) {
    return {
      ok: false,
      error: parsed.success
        ? 'That question has gone.'
        : (parsed.error.issues[0]?.message ?? 'Check the question.'),
    };
  }
  return attempt(() => data.updateQuestion(id, parsed.data));
}

export async function removeQuestion(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: 'That question has gone.' };
  return attempt(() => data.removeQuestion(id));
}
