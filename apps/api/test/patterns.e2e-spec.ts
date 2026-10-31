import {
  connectorSchema,
  intelligenceSettingsSchema,
  listOf,
  meetingNoteSchema,
  patternSchema,
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
import { signUpWorkspace } from './accounts.js';

const USAGE = {
  inputTokens: 20_000,
  outputTokens: 1_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

const LOOKING = 'find patterns across these clients';
const READING = 'list what the client said';

/**
 * Drafts nothing, reads one worry from each set of notes, and finds one
 * pattern in the first two clients it can cite.
 */
function fakeClaude() {
  const looked: ModelRequest<unknown>[] = [];
  const reply = <T>(req: ModelRequest<T>, data: unknown) => ({
    data: data as T,
    usage: USAGE,
    model: req.model,
  });
  const model: IntelligenceModel = {
    async generate<T>(req: ModelRequest<T>) {
      if (req.task.includes(READING)) {
        return reply(req, {
          planning: [],
          concerns: [
            { text: 'Worried about ransomware', sources: ['S1'], quote: null },
          ],
          askedFor: [],
        });
      }
      if (!req.task.includes(LOOKING)) {
        return reply(req, { recommendations: [] });
      }
      looked.push(req as ModelRequest<unknown>);
      const cited = req.context
        .split(/^# /m)
        .slice(1)
        .flatMap((section) => {
          const handle = /\[(S\d+)/.exec(section)?.[1];
          const id = /\(([^)]+)\)\n/.exec(section)?.[1];
          return handle && id ? [{ id, handle }] : [];
        });
      return reply(req, {
        patterns: [
          {
            title: 'Ransomware on clients’ minds',
            why: 'One was hit, another is worried.',
            suggestion: 'Review ransomware protection for both.',
            clients: cited.slice(0, 2).map(({ id, handle }) => ({
              clientId: id,
              detail: `What it looks like at ${id}`,
              sources: [handle],
            })),
          },
        ],
      });
    },
  };
  return { model, looked };
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  for (let i = 0; i < 200; i++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Gave up waiting');
}

describe('Patterns across clients (e2e)', () => {
  const claude = fakeClaude();
  let app: Awaited<ReturnType<typeof boot>>['app'];
  let as: Awaited<ReturnType<typeof boot>>['as'];

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
    const body = await signUpWorkspace(app, {
      workspaceName: 'Larkspur IT',
      timeZone: 'Europe/London',
      name: 'Sam Okafor',
      email: 'sam@larkspur.example',
      password: 'correct horse battery',
    });
    const auth = (r: request.Test) =>
      r.set('Authorization', `Bearer ${body.token}`);
    const api = request(app.getHttpServer());
    return {
      app,
      as: {
        get: (url: string) => auth(api.get(url)),
        put: (url: string) => auth(api.put(url)),
        post: (url: string) => auth(api.post(url)),
      },
    };
  }

  const patterns = async () =>
    listOf(patternSchema).parse((await as.get('/patterns').expect(200)).body)
      .data;

  beforeAll(async () => {
    ({ app, as } = await boot());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('looks across clients after a sync, and keeps nothing only one client has', async () => {
    await expect(patterns()).resolves.toEqual([]);
    await as.put('/connectors/ninjaone').send(CREDENTIALS.ninjaone).expect(200);
    await until(
      async () =>
        listOf(connectorSchema).parse((await as.get('/connectors')).body).data,
      (connectors) => connectors.every((c) => c.status !== 'syncing'),
    );
    await until(
      async () => claude.looked.length,
      (count) => count > 0,
    );
    const [digest] = claude.looked;
    expect(digest!.context).toMatch(/^<workspace_records>/);
    expect(digest!.context).toMatch(/Ransomware behaviour was blocked/);
    // Only one client's records were there to cite.
    await expect(patterns()).resolves.toEqual([]);
    const spend = intelligenceSettingsSchema.parse(
      (await as.get('/intelligence').expect(200)).body,
    ).spend;
    expect(spend.find((s) => s.kind === 'patterns')?.runs).toBe(1);
  });

  it('finds what two clients share when an admin asks it to look again', async () => {
    const clients = (await as.get('/clients').expect(200)).body.data as {
      id: string;
      name: string;
    }[];
    const northside = clients.find((c) => c.name === 'Northside Legal')!;
    await as
      .post('/notes')
      .send({
        clientId: northside.id,
        occurredOn: new Date().toISOString().slice(0, 10),
        title: 'Partner meeting',
        body: 'The partners asked what we do about ransomware.',
      })
      .expect(201);
    await until(
      async () =>
        listOf(meetingNoteSchema).parse(
          (await as.get(`/notes?clientId=${northside.id}`).expect(200)).body,
        ).data,
      ([note]) => note?.readAt != null,
    );

    const before = claude.looked.length;
    await as.post('/intelligence/patterns').expect(202);
    const [found] = await until(patterns, (list) => list.length > 0);
    expect(claude.looked.length).toBe(before + 1);
    expect(found).toMatchObject({
      title: 'Ransomware on clients’ minds',
      suggestion: 'Review ransomware protection for both.',
    });
    expect(found!.clients.map((c) => c.clientId)).toContain(northside.id);
    expect(new Set(found!.clients.map((c) => c.clientId)).size).toBe(2);
  });

  it('shows nothing while turned off, and won’t look', async () => {
    await as
      .put('/intelligence/preferences')
      .send({ outputs: { patterns: false } })
      .expect(200);
    await expect(patterns()).resolves.toEqual([]);
    const off = await as.post('/intelligence/patterns').expect(409);
    expect(off.body.message).toBe(
      'Patterns across clients are turned off on the Intelligence page.',
    );
    await as.put('/intelligence/preferences').send({}).expect(200);
    await expect(patterns()).resolves.toHaveLength(1);
  });
});
