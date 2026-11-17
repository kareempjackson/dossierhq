'use server';

import { newQuestionSchema } from '@dossierhq/contracts';
import { redirect, unstable_rethrow } from 'next/navigation';
import { askQuestion } from '@/lib/data/ask';

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
    return {
      error: 'Dossier can’t reach its server right now. Try again shortly.',
    };
  }
  redirect(`/ask/${encodeURIComponent(id)}`);
}
