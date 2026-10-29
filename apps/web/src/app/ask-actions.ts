'use server';

import { newQuestionSchema } from '@dossierhq/contracts';
import { redirect, unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import * as data from '@/lib/data';
import type { ActionResult } from './actions';

export type AskState = {
  error?: string;
  /** What was typed, to show again after a problem. */
  question?: string;
};

const unavailable =
  'Couldn’t ask that. Check the API is running and try again.';

/** Asks Dossier, then goes to the answer, which fills in as Dossier writes it. */
export async function askDossier(
  _previous: AskState,
  formData: FormData,
): Promise<AskState> {
  const question = String(formData.get('question') ?? '');
  const parsed = newQuestionSchema.safeParse({ question });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Type a question.',
      question,
    };
  }
  let id: string;
  try {
    const result = await data.askDossier(parsed.data.question);
    if (!result.ok) return { error: result.problem, question };
    id = result.answer.id;
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable, question };
  }
  redirect(`/ask/${encodeURIComponent(id)}`);
}

/** Deletes a question and its answer, then goes back to the list. */
export async function deleteAskAnswer(id: string): Promise<ActionResult> {
  if (!z.string().min(1).safeParse(id).success) {
    return { ok: false, error: 'That isn’t a question here.' };
  }
  try {
    const result = await data.deleteAskAnswer(id);
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: 'Couldn’t delete that. Try again.' };
  }
  redirect('/ask');
}
