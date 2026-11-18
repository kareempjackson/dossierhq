'use server';

import { newQuestionSchema } from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { redirect, RedirectType, unstable_rethrow } from 'next/navigation';
import { askQuestion, deleteQuestion as deleteAsked } from '@/lib/data/ask';

const unreachable =
  'Dossier can’t reach its server right now. Try again shortly.';

export type AskState = { error?: string };

/**
 * Asks Dossier the `question`, then goes to its answer's page (/ask/[id]),
 * where the answer appears once Dossier has read the records.
 */
export async function ask(
  _state: AskState,
  formData: FormData,
): Promise<AskState> {
  const parsed = newQuestionSchema.safeParse({
    question: formData.get('question') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Type a question' };
  }
  let id: string;
  try {
    const result = await askQuestion(parsed.data.question);
    if (!result.ok) return { error: result.problem };
    id = result.id;
  } catch (error) {
    unstable_rethrow(error);
    return { error: unreachable };
  }
  redirect(`/ask/${encodeURIComponent(id)}`);
}

export type DeleteQuestionResult = { ok: true } | { ok: false; error: string };

/**
 * Deletes a question and its answer, for everyone here. From the answer's
 * own page (`leave`), goes back to /ask, replacing the page in history so
 * Back can't return to it; elsewhere, reads the page again.
 */
export async function deleteQuestion(
  id: string,
  leave = false,
): Promise<DeleteQuestionResult> {
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'That question has already gone.' };
  }
  try {
    const result = await deleteAsked(id);
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unreachable };
  }
  if (leave) redirect('/ask', RedirectType.replace);
  refresh();
  return { ok: true };
}
