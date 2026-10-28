import {
  connectorSchema,
  DEFAULT_MODEL,
  intelligenceSettingsSchema,
  listOf,
  recommendationSchema,
  type Recommendation,
} from '@dossierhq/contracts';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HTTP_OPTIONS } from '../src/integrations/sync.service.js';
import {
  INTELLIGENCE_MODEL,
  type IntelligenceModel,
  type ModelRequest,
} from '../src/intelligence/model.js';
import { INTELLIGENCE_OPTIONS } from '../src/intelligence/scheduler.js';
import { CREDENTIALS, fakeTools } from './fake-tools.js';

const USAGE = {
  inputTokens: 1_000,
  outputTokens: 800,
  cacheReadTokens: 0,
  cacheWriteTokens: 9_000,
};

/** Suggests one thing per client, citing its first record and a made-up one. */
function fakeClaude() {
  const requests: ModelRequest<unknown>[] = [];
  const model: IntelligenceModel = {
    async generate<T>(req: ModelRequest<T>) {
      requests.push(req as ModelRequest<unknown>);
      const name = /^# (.+)$/m.exec(req.context)?.[1] ?? 'the client';
      const handle = /\[(S\d+)/.exec(req.context)?.[1];
      const recommendations = handle
        ? [
            {
              title: `Review the open issues at ${name}`,
              reason: 'Their records show something to act on.',
              sources: [handle, 'S999'],
            },
          ]
        : [];
      return { data: { recommendations } as T, usage: USAGE, model: req.model };
    },
  };
  return { model, requests };
}

async function boot(model: IntelligenceModel | null) {
  const tools = fakeTools();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(HTTP_OPTIONS)
    .useValue({ fetch: tools.fetch, sleep: async () => {} })
    .overrideProvider(INTELLIGENCE_MODEL)
    .useValue(model)
    .overrideProvider(INTELLIGENCE_OPTIONS)
    .useValue({ settleMs: 0, concurrency: 2 })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  const { body } = await request(app.getHttpServer())
    .post('/auth/sign-up')
    .send({
      workspaceName: 'Larkspur IT',
      timeZone: 'Europe/London',
      name: 'Sam Okafor',
      email: 'sam@larkspur.example',
      password: 'correct horse battery',
    })
    .expect(201);
  const auth = (r: request.Test) =>
    r.set('Authorization', `Bearer ${body.token}`);
  const api = request(app.getHttpServer());
  return {
    app,
    get: (url: string) => auth(api.get(url)),
    put: (url: string) => auth(api.put(url)),
    post: (url: string) => auth(api.post(url)),
  };
}

type Api = Awaited<ReturnType<typeof boot>>;

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  for (let i = 0; i < 200; i++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Gave up waiting');
}

const recommendations = async (api: Api): Promise<Recommendation[]> =>
  listOf(recommendationSchema).parse(
    (await api.get('/recommendations').expect(200)).body,
  ).data;

describe('Intelligence (e2e)', () => {
  const claude = fakeClaude();
  let api: Api;

  beforeAll(async () => {
    api = await boot(claude.model);
  });

  afterAll(async () => {
    await api?.app.close();
  });

  it('drafts cited recommendations for each client after a sync', async () => {
    await api
      .put('/connectors/ninjaone')
      .send(CREDENTIALS.ninjaone)
      .expect(200);
    await until(
      async () =>
        listOf(connectorSchema).parse((await api.get('/connectors')).body).data,
      (connectors) => connectors.every((c) => c.status !== 'syncing'),
    );
    const clients = (await api.get('/clients').expect(200)).body.data;
    expect(clients.length).toBeGreaterThan(0);

    // One model call per client; a client with no records gets no draft.
    await until(
      async () => claude.requests.length,
      (count) => count === clients.length,
    );
    const cited = claude.requests.filter((r) => /\[S\d+/.test(r.context));
    expect(cited.length).toBeGreaterThan(0);
    const drafted = await until(
      () => recommendations(api),
      (recs) => recs.length === cited.length,
    );
    for (const rec of drafted) {
      expect(rec.status).toBe('draft');
      expect(rec.title).toMatch(/^Review the open issues at /);
      // The made-up handle is dropped; the real one maps to a stored source.
      expect(rec.sourceIds).toHaveLength(1);
      const sources = (
        await api.get(`/clients/${rec.clientId}/sources`).expect(200)
      ).body.data as { id: string }[];
      expect(sources.map((s) => s.id)).toContain(rec.sourceIds[0]);
    }
    expect(claude.requests.every((r) => r.model === DEFAULT_MODEL)).toBe(true);
  });

  it('shows the model in use and what drafting cost', async () => {
    const settings = intelligenceSettingsSchema.parse(
      (await api.get('/intelligence').expect(200)).body,
    );
    expect(settings).toMatchObject({
      enabled: true,
      model: DEFAULT_MODEL,
      chosen: null,
      defaultModel: DEFAULT_MODEL,
    });
    expect(settings.spend).toEqual([
      expect.objectContaining({
        kind: 'recommendations',
        runs: claude.requests.length,
        outputTokens: USAGE.outputTokens * claude.requests.length,
      }),
    ]);
    expect(settings.spend[0]!.cost).toBeGreaterThan(0);
  });

  it('lets the owner switch models, and drafts with the new one', async () => {
    await api.put('/intelligence').send({ model: 'gpt-5' }).expect(400);
    const { body } = await api
      .put('/intelligence')
      .send({ model: 'claude-haiku-5-5' })
      .expect(200);
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      chosen: 'claude-haiku-5-5',
    });

    const before = claude.requests.length;
    await api.post('/intelligence/draft').expect(202);
    await until(
      async () => claude.requests.length,
      (count) => count > before,
    );
    expect(claude.requests.at(-1)?.model).toBe('claude-haiku-5-5');

    await api.put('/intelligence').send({ model: null }).expect(200);
    await expect(
      api.get('/intelligence').then((r) => r.body.model),
    ).resolves.toBe(DEFAULT_MODEL);
  });

  it('lets the owner switch things off, and keeps to it', async () => {
    const { body } = await api
      .put('/intelligence/preferences')
      .send({ outputs: { recommendations: false }, records: { files: false } })
      .expect(200);
    expect(body.preferences.outputs).toMatchObject({
      recommendations: false,
      reportQuestions: true,
    });
    expect(body.preferences.records).toMatchObject({
      files: false,
      tickets: true,
    });
    await api.post('/intelligence/draft').expect(409);
    await api
      .put('/intelligence/preferences')
      .send({ outputs: { recommendations: 'yes' } })
      .expect(400);

    // Everything back on: drafting works again.
    await api.put('/intelligence/preferences').send({}).expect(200);
    const before = claude.requests.length;
    await api.post('/intelligence/draft').expect(202);
    await until(
      async () => claude.requests.length,
      (count) => count > before,
    );
  });
});

describe('Intelligence without an API key (e2e)', () => {
  let api: Api;

  beforeAll(async () => {
    api = await boot(null);
  });

  afterAll(async () => {
    await api?.app.close();
  });

  it('says drafting is off, and won’t draft', async () => {
    await expect(
      api.get('/intelligence').then((r) => r.body.enabled),
    ).resolves.toBe(false);
    const { body } = await api.post('/intelligence/draft').expect(503);
    expect(body.message).toContain('ANTHROPIC_API_KEY');
  });
});
