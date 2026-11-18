import 'server-only';
import {
  askAnswerSchema,
  askSummarySchema,
  listOf,
  type AskAnswer,
  type AskSummary,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { ApiError, apiGet, apiSend, withQuery } from '../api';
import { refused } from './refused';

/**
 * The Ask box through the API: questions anyone in the workspace asked,
 * each answered from the records with the ones it rests on. Asking returns
 * at once, while Dossier is still answering.
 */

/** Asks; the answer comes later, on GET /ask/:id. */
export async function askQuestion(
  question: string,
): Promise<{ ok: true; id: string } | { ok: false; problem: string }> {
  try {
    const asked = await apiSend('POST', '/ask', { question }, askAnswerSchema);
    return { ok: true, id: asked.id };
  } catch (error) {
    return refused(error);
  }
}

/**
 * Deletes a question and its answer, for everyone here. The API lets the
 * person who asked, or an admin, do it. One that's already gone counts as
 * deleted.
 */
export async function deleteQuestion(
  id: string,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend('DELETE', `/ask/${encodeURIComponent(id)}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { ok: true };
    return refused(error);
  }
}

/** Newest first; `mine` keeps only the signed-in person's. */
export const getAskHistory = cache(
  async (mine: boolean): Promise<AskSummary[]> =>
    (
      await apiGet(
        withQuery('/ask', { mine: mine ? 'true' : undefined, limit: 50 }),
        listOf(askSummarySchema),
      )
    ).data,
);

/** One question and its answer; null when there's no such question. */
export const getAnswer = cache(
  async (id: string): Promise<AskAnswer | null> => {
    try {
      return await apiGet(`/ask/${encodeURIComponent(id)}`, askAnswerSchema);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
);
