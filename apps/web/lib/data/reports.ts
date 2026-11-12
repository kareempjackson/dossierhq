import 'server-only';
import {
  reportDeliverySchema,
  listOf,
  outboxItemSchema,
  reportDeliveryStatusSchema,
  reportEmailSchema,
  reportQuestionSchema,
  reportSchema,
  reportSummarySchema,
  type OutboxItem,
  type Report,
  type ReportDeliveryStatus,
  type ReportEdit,
  type ReportEmail,
  type ReportQuestion,
  type ReportQuestionCreate,
  type ReportQuestionUpdate,
  type ReportStatus,
  type ReportSummary,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { ApiError, apiGet, apiSend } from '../api';
import { refused } from './refused';

/**
 * Weekly reports through the API: the drafts to review, what's approved
 * and waiting to go, the questions every report answers, and one report
 * with where it stands on its way to the client. Changes never throw for
 * the API's no; they return it in words.
 */

type Refused = { ok: false; problem: string };
type Done = { ok: true } | Refused;

const path = (id: string) => `/reports/${encodeURIComponent(id)}`;

async function attempt(run: () => Promise<unknown>): Promise<Done> {
  try {
    await run();
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

// Reading ---------------------------------------------------------------------

/** Drafts waiting for someone to read them: those with exceptions first. */
export const getReportQueue = cache(
  async (): Promise<ReportSummary[]> =>
    (await apiGet('/reports/queue', listOf(reportSummarySchema))).data,
);

/** Approved in the last two weeks and not gone yet. */
export const getOutbox = cache(
  async (): Promise<OutboxItem[]> =>
    (await apiGet('/reports/outbox', listOf(outboxItemSchema))).data,
);

/** The questions every report answers, oldest first. */
export const getReportQuestions = cache(
  async (): Promise<ReportQuestion[]> =>
    (await apiGet('/report-questions', listOf(reportQuestionSchema))).data,
);

/** One report, whole; null when the workspace has no such report. */
export const getReport = cache(async (id: string): Promise<Report | null> => {
  try {
    return await apiGet(path(id), reportSchema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});

/** Who it goes to, when, and every try so far. */
export const getReportDelivery = cache(
  (id: string): Promise<ReportDeliveryStatus> =>
    apiGet(`${path(id)}/delivery`, reportDeliveryStatusSchema),
);

/**
 * The email it goes out as, as it stands now: the sender, recipients and
 * branding of the moment, without the lines that wouldn't go.
 */
export const getReportEmail = (id: string): Promise<ReportEmail> =>
  apiGet(`${path(id)}/email`, reportEmailSchema);

// Changing --------------------------------------------------------------------

/** Drafts this week's report for every client now; returns how many. */
export async function draftReports(): Promise<
  { ok: true; drafted: number } | Refused
> {
  try {
    const { data } = await apiSend(
      'POST',
      '/reports',
      {},
      listOf(reportSummarySchema),
      // Every client's records are read for it.
      { timeoutMs: 60_000 },
    );
    return { ok: true, drafted: data.length };
  } catch (error) {
    return refused(error);
  }
}

/** Approves, skips, or puts back to draft one report someone has read. */
export const setReportStatus = (id: string, status: ReportStatus) =>
  attempt(() => apiSend('PATCH', path(id), { status }, reportSummarySchema));

/** Rewords some of a draft's lines and takes others out. */
export const editReport = (id: string, edit: ReportEdit) =>
  attempt(() => apiSend('PATCH', path(id), edit, reportSchema));

/** Sends an approved report to its client now. */
export const sendReport = (id: string) =>
  attempt(() =>
    apiSend('POST', `${path(id)}/send`, undefined, reportDeliverySchema, {
      timeoutMs: 30_000,
    }),
  );

export const addQuestion = (question: ReportQuestionCreate) =>
  attempt(() =>
    apiSend('POST', '/report-questions', question, reportQuestionSchema),
  );

export const updateQuestion = (id: string, changes: ReportQuestionUpdate) =>
  attempt(() =>
    apiSend(
      'PATCH',
      `/report-questions/${encodeURIComponent(id)}`,
      changes,
      reportQuestionSchema,
    ),
  );

export const removeQuestion = (id: string) =>
  attempt(() =>
    apiSend('DELETE', `/report-questions/${encodeURIComponent(id)}`),
  );
