import {
  intelligenceSettingsSchema,
  reportSchema,
  type Report,
} from '@dossierhq/contracts';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { DEMO_EMAIL, DEMO_PASSWORD, demo } from '@dossierhq/fixtures';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DATABASE } from '../src/database/database.module.js';
import {
  INTELLIGENCE_MODEL,
  type IntelligenceModel,
  type ModelRequest,
} from '../src/intelligence/model.js';

const REPORT = 'harbour-dental-2026-w41';
const USAGE = {
  inputTokens: 1_000,
  outputTokens: 300,
  cacheReadTokens: 0,
  cacheWriteTokens: 9_000,
};

/**
 * Answers the first question citing the client's first record and a handle
 * that doesn't exist, and can't answer the second. Anything else gets nothing.
 */
function fakeClaude() {
  const requests: ModelRequest<unknown>[] = [];
  const model: IntelligenceModel = {
    async generate<T>(req: ModelRequest<T>) {
      requests.push(req as ModelRequest<unknown>);
      const handle = /\[(S\d+)/.exec(req.context)?.[1] ?? 'S1';
      const data = req.task.includes('Questions:')
        ? {
            answers: [
              {
                question: 'Q1',
                answered: true,
                answer: 'Two reception PCs still run Windows 10.',
                sources: [handle, 'S999'],
              },
              {
                question: 'Q2',
                answered: false,
                answer: 'Dossier has no imaging backup records.',
                sources: [],
              },
            ],
          }
        : { recommendations: [] };
      return { data: data as T, usage: USAGE, model: req.model };
    },
  };
  return { model, requests };
}

async function boot(model: IntelligenceModel | null) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATABASE)
    .useValue(createMemoryAdapter(demo))
    .overrideProvider(INTELLIGENCE_MODEL)
    .useValue(model)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  const { body } = await request(app.getHttpServer())
    .post('/auth/sign-in')
    .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
    .expect(200);
  const auth = (r: request.Test) =>
    r.set('Authorization', `Bearer ${body.token}`);
  const api = request(app.getHttpServer());
  return {
    app,
    get: (url: string) => auth(api.get(url)),
    post: (url: string) => auth(api.post(url)),
  };
}

type Api = Awaited<ReturnType<typeof boot>>;

/** Saves the two questions and drafts Harbour Dental's report. */
async function draftWithQuestions(api: Api) {
  await api
    .post('/report-questions')
    .send({ text: 'Is anyone still on Windows 10?' })
    .expect(201);
  await api
    .post('/report-questions')
    .send({ text: 'Did the imaging backups run?', clientId: 'harbour-dental' })
    .expect(201);
  await api.post('/reports').send({ clientId: 'harbour-dental' }).expect(201);
}

const questionsOf = (report: Report) =>
  report.sections.find((s) => s.kind === 'questions')!.lines;

/** Reads the report until its questions are answered. */
async function answered(api: Api): Promise<Report> {
  for (let i = 0; i < 200; i++) {
    const report = reportSchema.parse(
      (await api.get(`/reports/${REPORT}`).expect(200)).body,
    );
    if (!questionsOf(report).some((line) => line.pending)) return report;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('The questions were never answered');
}

describe('Report questions (e2e)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('answers saved questions from the client’s records, citing them', async () => {
    const claude = fakeClaude();
    const api = await boot(claude.model);
    app = api.app;
    await draftWithQuestions(api);

    const report = await answered(api);
    const [first, second] = questionsOf(report);
    expect(first).toMatchObject({
      question: 'Is anyone still on Windows 10?',
      text: 'Two reception PCs still run Windows 10.',
    });
    // The made-up handle is dropped; the real one maps to a stored record.
    expect(first!.sourceIds).toHaveLength(1);
    const [cited] = first!.sourceIds;
    expect(demo.sources.map((s) => s.id)).toContain(cited);
    expect(report.sources.map((s) => s.id)).toContain(cited);
    expect(second).toMatchObject({
      question: 'Did the imaging backups run?',
      text: 'Dossier has no imaging backup records.',
      sourceIds: [],
    });
    expect(report.exceptions).toContain(
      '1 question couldn’t be answered from the records',
    );
    expect(report.exceptions).not.toContain(
      'Dossier is still answering your questions',
    );

    const asked = claude.requests.find((req) =>
      req.task.includes('Questions:'),
    )!;
    expect(asked.context).toContain('<client_records>');
    expect(asked.task).toContain('Q1: Is anyone still on Windows 10?');
    expect(asked.task).toContain('Q2: Did the imaging backups run?');

    const settings = intelligenceSettingsSchema.parse(
      (await api.get('/intelligence').expect(200)).body,
    );
    expect(settings.spend).toContainEqual(
      expect.objectContaining({ kind: 'reports', runs: 1 }),
    );
  });

  it('says why each question wasn’t answered when Claude is off', async () => {
    const api = await boot(null);
    app = api.app;
    await draftWithQuestions(api);

    const report = await answered(api);
    expect(questionsOf(report).map((l) => [l.text, l.sourceIds])).toEqual([
      [
        'Not answered: answering with Claude is off. Set ANTHROPIC_API_KEY on the API to turn it on.',
        [],
      ],
      [
        'Not answered: answering with Claude is off. Set ANTHROPIC_API_KEY on the API to turn it on.',
        [],
      ],
    ]);
    expect(report.exceptions).toContain(
      'Your questions weren’t answered: answering with Claude is off. Set ANTHROPIC_API_KEY on the API to turn it on',
    );
  });
});
