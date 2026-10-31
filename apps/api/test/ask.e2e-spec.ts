import {
  askAnswerSchema,
  askSummarySchema,
  connectorSchema,
  intelligenceSettingsSchema,
  listOf,
  type AskAnswer,
} from '@dossierhq/contracts';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HTTP_OPTIONS } from '../src/integrations/sync.service.js';
import {
  INTELLIGENCE_MODEL,
  type IntelligenceModel,
  type ModelRequest,
  type ToolLoopRequest,
} from '../src/intelligence/model.js';
import { INTELLIGENCE_OPTIONS } from '../src/intelligence/scheduler.js';
import { CREDENTIALS, fakeTools } from './fake-tools.js';
import { signUpWorkspace } from './accounts.js';

const USAGE = {
  inputTokens: 3_000,
  outputTokens: 600,
  cacheReadTokens: 12_000,
  cacheWriteTokens: 9_000,
};

/**
 * Drafts nothing; answers questions by calling the real tools, as Claude
 * would: reads the first client in the directory twice, searches, then cites
 * a handle it was given and one it made up. Holds answers while `hold` is set.
 */
function fakeClaude() {
  const asked: ToolLoopRequest<unknown>[] = [];
  const looked: {
    records: string;
    again: string;
    unknown: string;
    found: string;
  }[] = [];
  let hold: Promise<void> | null = null;
  const model: IntelligenceModel = {
    async generate<T>(req: ModelRequest<T>) {
      return {
        data: {
          recommendations: [],
          planning: [],
          concerns: [],
          askedFor: [],
        } as T,
        usage: USAGE,
        model: req.model,
      };
    },
    async answer<T>(req: ToolLoopRequest<T>) {
      asked.push(req as ToolLoopRequest<unknown>);
      if (hold) await hold;
      const tool = (name: string) => req.tools.find((t) => t.name === name)!;
      const id = /^- ([^:]+): /m.exec(req.context)![1]!;
      const records = await tool('client_records').run({ client_id: id });
      const again = await tool('client_records').run({ client_id: id });
      const unknown = await tool('client_records').run({ client_id: 'nope' });
      const found = await tool('search_records').run({
        query: 'ransomware',
        kinds: [],
      });
      looked.push({ records, again, unknown, found });
      const handle = /\[(S\d+)/.exec(records)![1]!;
      const searched = /\[(S\d+)/.exec(found)?.[1];
      return {
        data: {
          answered: true,
          paragraphs: [
            { text: `Start with ${id}.`, sources: [handle, 'S999'] },
            { text: 'Nothing backs this one.', sources: [] },
            ...(searched
              ? [{ text: 'Ransomware was blocked.', sources: [searched] }]
              : []),
          ],
        } as T,
        usage: USAGE,
        model: req.model,
      };
    },
  };
  return {
    model,
    asked,
    looked,
    holdAnswers() {
      let release!: () => void;
      hold = new Promise((resolve) => (release = resolve));
      return () => {
        hold = null;
        release();
      };
    },
  };
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  for (let i = 0; i < 200; i++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Gave up waiting');
}

describe('Ask Dossier (e2e)', () => {
  const claude = fakeClaude();
  let app: Awaited<ReturnType<typeof boot>>['app'];
  let as: Awaited<ReturnType<typeof boot>>['as'];
  let signUp: Awaited<ReturnType<typeof boot>>['signUp'];

  async function boot() {
    const tools = fakeTools();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HTTP_OPTIONS)
      .useValue({ fetch: tools.fetch, sleep: async () => {} })
      .overrideProvider(INTELLIGENCE_MODEL)
      .useValue(claude.model)
      .overrideProvider(INTELLIGENCE_OPTIONS)
      .useValue({ settleMs: 0, concurrency: 2 })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const api = request(app.getHttpServer());
    const signUp = async (workspaceName: string, email: string) => {
      const body = await signUpWorkspace(app, {
        workspaceName,
        timeZone: 'Europe/London',
        name: 'Sam Okafor',
        email,
        password: 'correct horse battery',
      });
      const auth = (r: request.Test) =>
        r.set('Authorization', `Bearer ${body.token}`);
      return {
        get: (url: string) => auth(api.get(url)),
        put: (url: string) => auth(api.put(url)),
        post: (url: string) => auth(api.post(url)),
        delete: (url: string) => auth(api.delete(url)),
      };
    };
    return {
      app,
      signUp,
      as: await signUp('Larkspur IT', 'sam@larkspur.example'),
    };
  }

  const answered = (id: string) =>
    until(
      async () =>
        askAnswerSchema.parse((await as.get(`/ask/${id}`).expect(200)).body),
      (answer) => answer.status !== 'answering',
    );

  beforeAll(async () => {
    ({ app, as, signUp } = await boot());
    await as.put('/connectors/ninjaone').send(CREDENTIALS.ninjaone).expect(200);
    await until(
      async () =>
        listOf(connectorSchema).parse((await as.get('/connectors')).body).data,
      (connectors) => connectors.every((c) => c.status !== 'syncing'),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers in the background, citing only records it was given', async () => {
    const { body } = await as
      .post('/ask')
      .send({ question: '  Which client should we look at first?  ' })
      .expect(202);
    const asked = askAnswerSchema.parse(body);
    expect(asked).toMatchObject({
      question: 'Which client should we look at first?',
      status: 'answering',
      askedBy: { name: 'Sam Okafor' },
    });

    const answer = await answered(asked.id);
    expect(answer.status).toBe('answered');
    expect(answer.answered).toBe(true);
    // The made-up handle and the uncited paragraph are dropped.
    expect(answer.lines.map((l) => l.text)).toEqual([
      expect.stringMatching(/^Start with /),
      'Ransomware was blocked.',
    ]);
    for (const line of answer.lines) expect(line.sourceIds).toHaveLength(1);
    // Every citation is kept as it stood, for shared links.
    expect(answer.sources.map((s) => s.id).sort()).toEqual(
      [...new Set(answer.lines.flatMap((l) => l.sourceIds))].sort(),
    );
    expect(answer.clients.length).toBeGreaterThan(0);
    expect(answer.model).toBeTruthy();
    expect(answer.cost).toBeGreaterThan(0);

    // The tools: a pack, no second read of it, no unknown clients, a search.
    const [looked] = claude.looked;
    expect(looked!.records).toContain('<client_records>');
    expect(looked!.again).toMatch(/already read/);
    expect(looked!.unknown).toMatch(/no client with the ID "nope"/);
    expect(looked!.found).toContain('<search_results>');
    expect(looked!.found).toMatch(/Ransomware/i);
    // Handles run on from the pack into the search, so none means two things.
    const numbers = (text: string) =>
      [...text.matchAll(/S(\d+)/g)].map((m) => Number(m[1]));
    const inPack = new Set(numbers(looked!.records));
    const highest = Math.max(...inPack);
    for (const n of numbers(looked!.found)) {
      if (!inPack.has(n)) expect(n).toBeGreaterThan(highest);
    }

    // The directory names every client, and nothing in it can be cited.
    const [request] = claude.asked;
    expect(request!.context).toContain('<client_directory>');
    expect(request!.context).not.toMatch(/\[S\d+/);
    expect(request!.task).toContain('Which client should we look at first?');

    const spend = intelligenceSettingsSchema.parse(
      (await as.get('/intelligence').expect(200)).body,
    ).spend;
    expect(spend.find((s) => s.kind === 'ask')?.runs).toBe(1);
  });

  it('keeps questions for everyone in the workspace, newest first', async () => {
    const { body } = await as
      .post('/ask')
      .send({ question: 'What did clients ask for lately?' })
      .expect(202);
    await answered(body.id);
    const history = listOf(askSummarySchema).parse(
      (await as.get('/ask').expect(200)).body,
    ).data;
    expect(history.map((a) => a.question)).toEqual([
      'What did clients ask for lately?',
      'Which client should we look at first?',
    ]);
    const mine = listOf(askSummarySchema).parse(
      (await as.get('/ask?mine=true&limit=1').expect(200)).body,
    ).data;
    expect(mine).toHaveLength(1);
    expect(mine[0]!.id).toBe(body.id);
    await as.get('/ask?limit=0').expect(400);

    // Nobody in another workspace can read it.
    const other = await signUp('Elsewhere IT', 'sam@elsewhere.example');
    await other.get(`/ask/${body.id}`).expect(404);
    await other.delete(`/ask/${body.id}`).expect(404);
    const theirs = listOf(askSummarySchema).parse(
      (await other.get('/ask').expect(200)).body,
    ).data;
    expect(theirs).toEqual([]);

    await as.delete(`/ask/${body.id}`).expect(204);
    await as.get(`/ask/${body.id}`).expect(404);
  });

  it('turns questions away when Ask is off, too short, or too many at once', async () => {
    await as.post('/ask').send({ question: 'hi' }).expect(400);

    await as
      .put('/intelligence/preferences')
      .send({ outputs: { ask: false } })
      .expect(200);
    const off = await as
      .post('/ask')
      .send({ question: 'Anything urgent?' })
      .expect(409);
    expect(off.body.message).toBe(
      'Ask Dossier is turned off on the Intelligence page.',
    );
    await as.put('/intelligence/preferences').send({}).expect(200);

    // Two answering at once is the most; the third waits its turn.
    const release = claude.holdAnswers();
    const first = await as
      .post('/ask')
      .send({ question: 'First question?' })
      .expect(202);
    const second = await as
      .post('/ask')
      .send({ question: 'Second question?' })
      .expect(202);
    await as.post('/ask').send({ question: 'Third question?' }).expect(429);
    release();
    const answers: AskAnswer[] = await Promise.all([
      answered(first.body.id),
      answered(second.body.id),
    ]);
    expect(answers.map((a) => a.status)).toEqual(['answered', 'answered']);
    await as.post('/ask').send({ question: 'Third question?' }).expect(202);
  });
});
