import type {
  AskAnswer,
  AskLine,
  AskStatus,
  AskSummary,
} from '@dossierhq/contracts';
import type { CitedFile } from '@/components/ui/cited-stack';
import { andList } from './client-paths';
import { citations, type When } from './client-views';
import { ago, fullTime } from './format';

/**
 * Questions and answers as the Ask pages show them, in the workspace's time
 * zone. Pure: the pages read the API and pass the results in.
 */

/** Where an answer stands, as one word for the screen. */
export type AskState = 'answering' | 'answered' | 'not-found' | 'failed';

const stateOf = (status: AskStatus, answered: boolean | null): AskState =>
  status === 'answered'
    ? answered === false
      ? 'not-found'
      : 'answered'
    : status;

export type AskRow = {
  id: string;
  question: string;
  askedBy: string;
  /** Who asked, so "Mine" can pick out the signed-in person's. */
  askedById: string | null;
  /** e.g. "4 min ago". */
  askedAt: string;
  /** The full time, for a title attribute. */
  askedAtFull: string;
  /** The clients the answer drew on, e.g. "BPI and Harbour Dental". */
  scope: string | null;
  state: AskState;
};

/** "BPI", "BPI and Acme", "BPI, Acme and 3 more". */
function scopeOf(clients: { name: string }[]): string | null {
  const names = clients.map((client) => client.name);
  if (names.length === 0) return null;
  if (names.length <= 3) return andList(names);
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

export function askRows(asks: AskSummary[], { timeZone, now }: When): AskRow[] {
  return asks.map((ask) => ({
    id: ask.id,
    question: ask.question,
    askedBy: ask.askedBy.name,
    askedById: ask.askedBy.userId,
    askedAt: ago(ask.askedAt, now, timeZone),
    askedAtFull: fullTime(ask.askedAt, timeZone),
    scope: scopeOf(ask.clients),
    state: stateOf(ask.status, ask.answered),
  }));
}

export type AnswerLine = {
  text: string;
  /** The cited files it rests on, by number. */
  cites: number[];
};

export type AnswerView = {
  id: string;
  question: string;
  state: AskState;
  askedBy: string;
  askedAt: string;
  askedAtFull: string;
  lines: AnswerLine[];
  /** The same answer in plain words for leadership; empty when none. */
  executive: AnswerLine[];
  /** The clients it drew on, to open their files. */
  clients: { id: string; name: string }[];
  /** In citation order. */
  cited: (CitedFile & { url: string })[];
  /** Why it failed, in plain words. */
  error: string | null;
};

/** The question and its answer, with the records it cites numbered. */
export function answerView(answer: AskAnswer, when: When): AnswerView {
  const { files, cite } = citations(
    new Map(answer.sources.map((source) => [source.id, source])),
    when,
  );
  const numbered = (lines: AskLine[]): AnswerLine[] =>
    lines.map((line) => ({
      text: line.text,
      cites: [
        ...new Set(
          line.sourceIds
            .map(cite)
            .filter((number): number is number => number !== null),
        ),
      ],
    }));
  const lines = numbered(answer.lines);
  const executive = numbered(answer.executiveLines);
  return {
    id: answer.id,
    question: answer.question,
    state: stateOf(answer.status, answer.answered),
    askedBy: answer.askedBy.name,
    askedAt: ago(answer.askedAt, when.now, when.timeZone),
    askedAtFull: fullTime(answer.askedAt, when.timeZone),
    lines,
    executive,
    clients: answer.clients,
    cited: files,
    error: answer.error,
  };
}
