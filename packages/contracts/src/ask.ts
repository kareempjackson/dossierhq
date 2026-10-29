import { z } from 'zod';
import { sourceSchema } from './sources.js';

/** The longest question the Ask box takes. */
export const QUESTION_MAX_LENGTH = 500;

/** `POST /ask`. */
export const newQuestionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, 'Type a question')
    .max(QUESTION_MAX_LENGTH, 'Keep the question under 500 characters'),
});
export type NewQuestion = z.input<typeof newQuestionSchema>;

/** Answering while Dossier reads; then answered, or failed. */
export const askStatusSchema = z.enum(['answering', 'answered', 'failed']);
export type AskStatus = z.infer<typeof askStatusSchema>;

/** One paragraph of an answer, with the records it rests on. */
export const askLineSchema = z.object({
  text: z.string(),
  sourceIds: z.array(z.string()),
});
export type AskLine = z.infer<typeof askLineSchema>;

/** A question someone asked, without its answer: what history lists. */
export const askSummarySchema = z.object({
  id: z.string(),
  question: z.string(),
  status: askStatusSchema,
  /** False when the records didn't show the answer; null until answered. */
  answered: z.boolean().nullable(),
  /** Who asked, as they were then. */
  askedBy: z.object({ userId: z.string().nullable(), name: z.string() }),
  /**
   * The clients whose records the answer drew on: read in full, or cited
   * from a search. Named as they were then.
   */
  clients: z.array(z.object({ id: z.string(), name: z.string() })),
  askedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});
export type AskSummary = z.infer<typeof askSummarySchema>;

/** `GET /ask/:id`: the question and its answer. */
export const askAnswerSchema = askSummarySchema.extend({
  lines: z.array(askLineSchema),
  /**
   * The records the answer cites, as they stood when it was written, so a
   * shared answer keeps its citations after syncs change them.
   */
  sources: z.array(sourceSchema),
  /** The model that answered; null until one did. */
  model: z.string().nullable(),
  /** US dollars; null until it finished. */
  cost: z.number().nonnegative().nullable(),
  /** Why it failed, in plain words. */
  error: z.string().nullable(),
});
export type AskAnswer = z.infer<typeof askAnswerSchema>;

/** `GET /ask`: newest first. `mine` keeps only the signed-in person's. */
export const askHistoryQuerySchema = z.object({
  mine: z.stringbool().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AskHistoryQuery = z.input<typeof askHistoryQuerySchema>;
