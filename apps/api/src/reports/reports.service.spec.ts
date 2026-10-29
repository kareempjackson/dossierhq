import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo } from '@dossierhq/fixtures';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Clock } from '../common/clock.js';
import { DATABASE } from '../database/database.module.js';
import {
  ANSWERING,
  ANSWERING_EXCEPTION,
  QuestionAnswerer,
  type Answers,
} from './question-answerer.js';
import { ReportsService } from './reports.service.js';

/** Answers every question, citing one of the client's records. */
async function answerFor(
  _workspaceId: string,
  clientId: string,
  _questions: unknown[],
  pending: { id: string; question?: string }[],
): Promise<Answers> {
  return {
    lines: pending.map((line) => ({
      id: line.id,
      question: line.question,
      text: `Answered for ${clientId}.`,
      sourceIds: [demo.sources.find((s) => s.clientId === clientId)!.id],
    })),
    exceptions: [],
  };
}
const answerer = { answer: vi.fn(answerFor) };
/** Holds the next answer back until `release` is called. */
function holdNextAnswer() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  answerer.answer.mockImplementationOnce(
    async (...args: Parameters<typeof answerFor>) => {
      await gate;
      return answerFor(...args);
    },
  );
  return release;
}
const fakeAnswerer = { provide: QuestionAnswerer, useValue: answerer };

const NOW = '2030-01-01T09:00:00.000Z';
const ws = demo.workspace.id;

describe('ReportsService', () => {
  let service: ReportsService;
  let db: ReturnType<typeof createMemoryAdapter>;
  const linesOf = async (id: string) =>
    (await db.reports.get(ws, id))!.sections.flatMap((s) => s.lines);

  beforeEach(async () => {
    db = createMemoryAdapter(demo);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: DATABASE, useValue: db },
        { provide: Clock, useValue: { now: () => NOW } },
        fakeAnswerer,
      ],
    }).compile();
    service = moduleRef.get(ReportsService);
  });

  it('queues drafts with exceptions before clean ones', async () => {
    const queue = await service.queue(ws);
    const firstClean = queue.findIndex((r) => r.exceptions.length === 0);
    expect(queue).toHaveLength(14);
    expect(firstClean).toBe(4);
    expect(queue.every((r) => r.status === 'draft')).toBe(true);
  });

  it('stamps approvals with the clock and drops them from the queue', async () => {
    const report = await service.setOneStatus(
      ws,
      'harbour-dental-2026-w41',
      'approved',
    );
    expect(report).toMatchObject({ status: 'approved', approvedAt: NOW });
    await expect(service.queue(ws)).resolves.toHaveLength(13);
  });

  it('throws NotFoundException for unknown reports', async () => {
    await expect(
      service.setOneStatus(ws, 'no-such-report', 'approved'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.edit(ws, 'no-such-report', { remove: ['line'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('approves in bulk only reports with nothing to check', async () => {
    const clean = ['fenwick-rowe-2026-w41', 'copperleaf-studio-2026-w41'];
    const flagged = 'harbour-dental-2026-w41';
    const refused = await service
      .setStatus(ws, [...clean, flagged], 'approved')
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(UnprocessableEntityException);
    expect(
      (refused as UnprocessableEntityException).getResponse(),
    ).toMatchObject({ ids: [flagged] });
    // Even on its own, in bulk.
    await expect(
      service.setStatus(ws, [flagged], 'approved'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(service.queue(ws)).resolves.toHaveLength(14);

    await expect(service.setStatus(ws, clean, 'approved')).resolves.toEqual([
      expect.objectContaining({ id: clean[0], status: 'approved' }),
      expect.objectContaining({ id: clean[1], status: 'approved' }),
    ]);
    // Read on its own page, a flagged one can be approved.
    await expect(
      service.setOneStatus(ws, flagged, 'approved'),
    ).resolves.toMatchObject({ status: 'approved' });
  });

  it('leaves out lines with no source on approval', async () => {
    const id = 'cedar-street-clinic-2026-w41';
    const before = await linesOf(id);
    expect(before.some((l) => l.sourceIds.length === 0)).toBe(true);
    await service.setOneStatus(ws, id, 'approved');
    await expect(linesOf(id)).resolves.toEqual(
      before.filter((l) => l.sourceIds.length > 0),
    );
  });

  it('keeps a sent report as it went out', async () => {
    const id = 'fenwick-rowe-2026-w41';
    const [line] = await linesOf(id);
    await service.setOneStatus(ws, id, 'approved');
    await db.reports.markSent(ws, id, NOW);
    for (const attempt of [
      service.setOneStatus(ws, id, 'draft'),
      service.setStatus(ws, [id, 'copperleaf-studio-2026-w41'], 'skipped'),
      service.edit(ws, id, { lines: [{ id: line!.id, text: 'Changed.' }] }),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    }
    await expect(db.reports.get(ws, id)).resolves.toMatchObject({
      status: 'approved',
      sentAt: NOW,
    });
  });

  it('rewords and removes a draft’s lines, keeping what Dossier wrote', async () => {
    const id = 'fenwick-rowe-2026-w41';
    const [first, second] = await linesOf(id);
    const edited = await service.edit(ws, id, {
      lines: [{ id: first!.id, text: 'Reworded.' }],
      remove: [second!.id],
    });
    expect(edited.editedAt).toBe(NOW);
    const after = edited.sections.flatMap((s) => s.lines);
    expect(after.find((l) => l.id === first!.id)).toEqual({
      ...first,
      text: 'Reworded.',
      original: first!.text,
    });
    expect(after.some((l) => l.id === second!.id)).toBe(false);
    await expect(db.reports.get(ws, id)).resolves.toEqual(edited);

    // Rewording again keeps Dossier's wording; putting it back forgets it.
    await service.edit(ws, id, { lines: [{ id: first!.id, text: 'Again.' }] });
    expect((await linesOf(id)).find((l) => l.id === first!.id)).toMatchObject({
      text: 'Again.',
      original: first!.text,
    });
    await service.edit(ws, id, {
      lines: [{ id: first!.id, text: first!.text }],
    });
    expect((await linesOf(id)).find((l) => l.id === first!.id)).toStrictEqual(
      first,
    );

    await expect(
      service.edit(ws, id, { remove: [second!.id] }),
    ).rejects.toBeInstanceOf(ConflictException);
    await service.setOneStatus(ws, id, 'approved');
    await expect(
      service.edit(ws, id, { lines: [{ id: first!.id, text: 'Late.' }] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ReportsService drafting', () => {
  // Friday of week 41, which the demo has drafts for.
  const FRIDAY = '2026-10-09T15:40:00.000Z';
  let service: ReportsService;
  let db: ReturnType<typeof createMemoryAdapter>;

  beforeEach(async () => {
    db = createMemoryAdapter(demo);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: DATABASE, useValue: db },
        { provide: Clock, useValue: { now: () => FRIDAY } },
        fakeAnswerer,
      ],
    }).compile();
    service = moduleRef.get(ReportsService);
  });

  it('redrafts a client’s week in place, keeping what it cites', async () => {
    const [summary] = await service.draft(ws, 'harbour-dental');
    expect(summary).toMatchObject({
      id: 'harbour-dental-2026-w41',
      weekStart: '2026-10-05',
      weekEnd: '2026-10-11',
      status: 'draft',
      generatedAt: FRIDAY,
    });
    expect(summary!.exceptions).toContain(
      'File server backups have failed three nights running',
    );

    const report = (await db.reports.get(ws, summary!.id))!;
    const cited = new Set(
      report.sections.flatMap((s) => s.lines.flatMap((l) => l.sourceIds)),
    );
    expect(cited.size).toBeGreaterThan(0);
    expect(report.sources.map((s) => s.id).sort()).toEqual([...cited].sort());
    // The rest of the week is untouched.
    await expect(service.queue(ws)).resolves.toHaveLength(14);
  });

  it('keeps an approved report as it went out', async () => {
    await service.setOneStatus(ws, 'harbour-dental-2026-w41', 'approved');
    await expect(service.draft(ws, 'harbour-dental')).rejects.toBeInstanceOf(
      ConflictException,
    );
    const all = await service.draft(ws);
    expect(all.map((r) => r.clientId)).not.toContain('harbour-dental');
    expect(all).toHaveLength(13);
  });

  it('drafts every client, leaving edited drafts for one client at a time', async () => {
    const id = 'harbour-dental-2026-w41';
    const [line] = (await db.reports.get(ws, id))!.sections.flatMap(
      (s) => s.lines,
    );
    await service.edit(ws, id, { lines: [{ id: line!.id, text: 'Ours.' }] });
    const all = await service.draft(ws);
    expect(all.map((r) => r.id)).not.toContain(id);
    expect(all).toHaveLength(13);

    const [one] = await service.draft(ws, 'harbour-dental');
    expect(one).toMatchObject({ id, editedAt: null });
  });

  it('drafts every client, leaving skipped reports for one client at a time', async () => {
    await service.setOneStatus(ws, 'marlow-freight-2026-w41', 'skipped');
    const all = await service.draft(ws);
    expect(all).toHaveLength(13);
    expect(all.every((r) => r.generatedAt === FRIDAY)).toBe(true);
    await expect(
      db.reports.get(ws, 'marlow-freight-2026-w41'),
    ).resolves.toMatchObject({ status: 'skipped' });

    const [one] = await service.draft(ws, 'marlow-freight');
    expect(one).toMatchObject({
      id: 'marlow-freight-2026-w41',
      status: 'draft',
    });
  });

  it('starts a new week with new reports', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: DATABASE, useValue: db },
        { provide: Clock, useValue: { now: () => '2026-10-13T08:00:00.000Z' } },
        fakeAnswerer,
      ],
    }).compile();
    const [report] = await moduleRef
      .get(ReportsService)
      .draft(ws, 'harbour-dental');
    expect(report).toMatchObject({
      id: 'harbour-dental-2026-10-12',
      weekStart: '2026-10-12',
    });
    await expect(
      db.reports.listSummaries(ws, { clientId: 'harbour-dental' }),
    ).resolves.toHaveLength(5);
  });

  it('throws NotFoundException for unknown clients', async () => {
    await expect(service.draft(ws, 'no-such-client')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('saved questions', () => {
    const question = (id: string, clientId: string | null, text: string) => ({
      id,
      clientId,
      text,
      createdAt: FRIDAY,
    });
    const questionsOf = async (id: string) =>
      (await db.reports.get(ws, id))!.sections.find(
        (s) => s.kind === 'questions',
      )!.lines;

    beforeEach(async () => {
      answerer.answer.mockClear();
      await db.reportQuestions.create(
        ws,
        question('q-all', null, 'Is anyone still on Windows 10?'),
      );
      await db.reportQuestions.create(
        ws,
        question('q-hd', 'harbour-dental', 'Did the imaging backups run?'),
      );
    });

    it('drafts at once with the questions pending, then puts the answers in', async () => {
      const [summary] = await service.draft(ws, 'harbour-dental');
      expect(summary!.exceptions).toContain(ANSWERING_EXCEPTION);
      const pending = await questionsOf(summary!.id);
      expect(pending.map((l) => [l.question, l.text, l.pending])).toEqual([
        ['Is anyone still on Windows 10?', ANSWERING, true],
        ['Did the imaging backups run?', ANSWERING, true],
      ]);

      await service.answered(ws);
      expect(answerer.answer).toHaveBeenCalledTimes(1);
      const report = (await db.reports.get(ws, summary!.id))!;
      expect(report.exceptions).not.toContain(ANSWERING_EXCEPTION);
      const answered = await questionsOf(summary!.id);
      expect(answered.map((l) => [l.text, l.pending])).toEqual([
        ['Answered for harbour-dental.', undefined],
        ['Answered for harbour-dental.', undefined],
      ]);
      // The answers' records are kept with the report like the rest.
      const cited = answered[0]!.sourceIds[0]!;
      expect(report.sources.map((s) => s.id)).toContain(cited);
    });

    it('asks each client only its own questions and everyone’s', async () => {
      await service.draft(ws);
      await service.answered(ws);
      const asked = new Map(
        answerer.answer.mock.calls.map(([, clientId, questions]) => [
          clientId,
          (questions as { id: string }[]).map((q) => q.id),
        ]),
      );
      expect(asked.size).toBe(demo.clients.length);
      expect(asked.get('harbour-dental')).toEqual(['q-all', 'q-hd']);
      expect(asked.get('marlow-freight')).toEqual(['q-all']);
    });

    it('won’t approve a report while it’s being answered, and leaves a skipped one be', async () => {
      const release = holdNextAnswer();
      const [summary] = await service.draft(ws, 'harbour-dental');
      await expect(
        service.setOneStatus(ws, summary!.id, 'approved'),
      ).rejects.toBeInstanceOf(ConflictException);
      const [pending] = await questionsOf(summary!.id);
      await expect(
        service.edit(ws, summary!.id, {
          lines: [{ id: pending!.id, text: 'Yes.' }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      await service.setOneStatus(ws, summary!.id, 'skipped');
      release();
      await service.answered(ws);
      expect((await questionsOf(summary!.id)).every((l) => l.pending)).toBe(
        true,
      );
    });

    it('keeps late answers off a redraft', async () => {
      const release = holdNextAnswer();
      const [first] = await service.draft(ws, 'harbour-dental');
      await service.draft(ws, 'harbour-dental');
      const redrafted = (await questionsOf(first!.id))[0]!.id;
      release();
      await service.answered(ws);
      const lines = await questionsOf(first!.id);
      expect(lines[0]!.id).toBe(redrafted);
      expect(lines.every((l) => !l.pending)).toBe(true);
    });

    it('asks nothing when there are no questions', async () => {
      await db.reportQuestions.remove(ws, 'q-all');
      await db.reportQuestions.remove(ws, 'q-hd');
      const [summary] = await service.draft(ws, 'fenwick-rowe');
      await service.answered(ws);
      expect(answerer.answer).not.toHaveBeenCalled();
      expect(summary!.exceptions).not.toContain(ANSWERING_EXCEPTION);
      expect(await questionsOf(summary!.id)).toEqual([]);
    });
  });
});
