import type { ReportQuestion } from '@dossierhq/contracts';
import { IntelligenceFailure } from '../intelligence/intelligence.service.js';
import {
  ANSWERING,
  pendingLines,
  QuestionAnswerer,
} from './question-answerer.js';

const WEEK = { start: '2026-10-26', end: '2026-11-01' };
const questions: ReportQuestion[] = [
  {
    id: 'q1',
    clientId: null,
    text: 'Is anyone still on Windows 10?',
    createdAt: '2026-10-01T09:00:00.000Z',
  },
  {
    id: 'q2',
    clientId: 'acme',
    text: 'Did the backups run?',
    createdAt: '2026-10-02T09:00:00.000Z',
  },
];
const pending = pendingLines(questions, 'abc');

const pack = {
  clientId: 'acme',
  text: '<client_records>…</client_records>',
  hash: 'hash-1',
  sourceIds: (handles: string[]) =>
    handles.flatMap((h) =>
      h === 'S1' ? ['src-pc1'] : h === 'S2' ? ['src-pc2'] : [],
    ),
};

function answererWith(
  run: (...args: unknown[]) => Promise<unknown>,
  { off = null as string | null, found = true } = {},
) {
  const intelligence = { off: vi.fn(async () => off), run: vi.fn(run) };
  const packs = { forClient: vi.fn(async () => (found ? pack : null)) };
  return {
    answerer: new QuestionAnswerer(intelligence as never, packs as never),
    intelligence,
  };
}

const answer = (answerer: QuestionAnswerer) =>
  answerer.answer('ws', 'acme', questions, pending, WEEK, '2026-10-28');

describe('QuestionAnswerer', () => {
  it('starts with every question pending', () => {
    expect(pending).toEqual([
      {
        id: 'question-abc-1',
        question: 'Is anyone still on Windows 10?',
        text: ANSWERING,
        sourceIds: [],
        pending: true,
      },
      {
        id: 'question-abc-2',
        question: 'Did the backups run?',
        text: ANSWERING,
        sourceIds: [],
        pending: true,
      },
    ]);
  });

  it('answers each question in order, citing the records behind it', async () => {
    const { answerer, intelligence } = answererWith(async () => ({
      answers: [
        {
          question: 'Q2',
          answered: false,
          answer: 'Dossier has no backup records for this client.',
          sources: [],
        },
        {
          question: 'Q1',
          answered: true,
          answer: 'Yes: PC1 and PC2 run Windows 10 Pro.',
          sources: ['S1', 'S2', 'S9'],
        },
      ],
    }));

    await expect(answer(answerer)).resolves.toEqual({
      lines: [
        {
          id: 'question-abc-1',
          question: 'Is anyone still on Windows 10?',
          text: 'Yes: PC1 and PC2 run Windows 10 Pro.',
          sourceIds: ['src-pc1', 'src-pc2'],
        },
        {
          id: 'question-abc-2',
          question: 'Did the backups run?',
          text: 'Dossier has no backup records for this client.',
          sourceIds: [],
        },
      ],
      exceptions: ['1 question couldn’t be answered from the records'],
    });

    const [, request] = intelligence.run.mock.calls[0] as [
      string,
      { kind: string; clientId: string; inputHash: string; task: string },
    ];
    expect(request).toMatchObject({
      kind: 'reports',
      clientId: 'acme',
      inputHash: 'hash-1',
    });
    expect(request.task).toContain('covers 2026-10-26 to 2026-11-01');
    expect(request.task).toContain('Q1: Is anyone still on Windows 10?');
    expect(request.task).toContain('Q2: Did the backups run?');
  });

  it('counts an answer with nothing to cite, or a missing one, as unanswered', async () => {
    const { answerer } = answererWith(async () => ({
      answers: [
        {
          question: 'Q1',
          answered: true,
          answer: 'Probably.',
          sources: ['S7'],
        },
      ],
    }));
    const { lines, exceptions } = await answer(answerer);
    expect(lines.map((l) => [l.text, l.sourceIds])).toEqual([
      ['Probably.', []],
      ['Dossier couldn’t answer this from the records.', []],
    ]);
    expect(exceptions).toEqual([
      '2 questions couldn’t be answered from the records',
    ]);
  });

  it('says why when drafting is off, the model refuses, or the client is gone', async () => {
    const off = answererWith(async () => ({}), {
      off: 'Drafting is off. Add your OpenAI API key in Settings to draft with GPT-6.1 Sol.',
    });
    const offAnswers = await answer(off.answerer);
    expect(off.intelligence.run).not.toHaveBeenCalled();
    expect(offAnswers.lines[0]).toEqual({
      id: 'question-abc-1',
      question: 'Is anyone still on Windows 10?',
      text: 'Not answered: Drafting is off. Add your OpenAI API key in Settings to draft with GPT-6.1 Sol.',
      sourceIds: [],
    });
    expect(offAnswers.exceptions).toEqual([
      'Your questions weren’t answered: Drafting is off. Add your OpenAI API key in Settings to draft with GPT-6.1 Sol',
    ]);

    const refused = answererWith(async () => {
      throw new IntelligenceFailure('refused', 'Claude declined to answer.');
    });
    await expect(answer(refused.answerer)).resolves.toMatchObject({
      exceptions: [
        'Your questions weren’t answered: Claude declined to answer',
      ],
    });

    const gone = answererWith(async () => ({}), { found: false });
    await expect(answer(gone.answerer)).resolves.toMatchObject({
      exceptions: [
        'Your questions weren’t answered: the client is no longer in Dossier',
      ],
    });
  });
});
