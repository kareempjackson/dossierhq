import {
  connectorSchema,
  intelligenceSettingsSchema,
  listOf,
  meetingNoteSchema,
  meetingSchema,
  sourceSchema,
  type Meeting,
  type MeetingNote,
  type Tool,
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
  outputTokens: 200,
  cacheReadTokens: 0,
  cacheWriteTokens: 4_000,
};

const READING = 'list what the client said';

/** Finds one plan in each meeting or notes it reads; suggests nothing. */
function fakeClaude() {
  const requests: ModelRequest<unknown>[] = [];
  const model: IntelligenceModel = {
    async generate<T>(req: ModelRequest<T>) {
      requests.push(req as ModelRequest<unknown>);
      if (!req.task.includes(READING)) {
        return {
          data: { recommendations: [] } as T,
          usage: USAGE,
          model: req.model,
        };
      }
      const notes = req.context.includes('The notes:');
      const planning = [
        notes
          ? {
              text: 'Moving files to the cloud next year',
              sources: ['S1'],
              quote: 'move files to the cloud',
            }
          : {
              text: 'A second surgery in the spring',
              sources: ['S1'],
              quote: null,
            },
      ];
      return {
        data: { planning, concerns: [], askedFor: [] } as T,
        usage: USAGE,
        model: req.model,
      };
    },
  };
  return { model, requests };
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  for (let i = 0; i < 200; i++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Gave up waiting');
}

describe('Meeting notes (e2e)', () => {
  const claude = fakeClaude();
  const reads = () => claude.requests.filter((r) => r.task.includes(READING));
  let app: Awaited<ReturnType<typeof boot>>['app'];
  let as: Awaited<ReturnType<typeof boot>>['as'];
  let harbour: string;

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
      as: {
        get: (url: string) => auth(api.get(url)),
        put: (url: string) => auth(api.put(url)),
        post: (url: string) => auth(api.post(url)),
        delete: (url: string) => auth(api.delete(url)),
      },
    };
  }

  async function settled(tool: Tool) {
    return until(
      async () =>
        listOf(connectorSchema)
          .parse((await as.get('/connectors').expect(200)).body)
          .data.find((c) => c.tool === tool),
      (connector) => connector?.status !== 'syncing',
    );
  }

  const meetings = async (): Promise<Meeting[]> =>
    listOf(meetingSchema).parse(
      (await as.get(`/meetings?clientId=${harbour}`).expect(200)).body,
    ).data;

  const notes = async (): Promise<MeetingNote[]> =>
    listOf(meetingNoteSchema).parse(
      (await as.get(`/notes?clientId=${harbour}`).expect(200)).body,
    ).data;

  beforeAll(async () => {
    ({ app, as } = await boot());
    for (const tool of ['ninjaone', 'hudu', 'fathom'] as const) {
      await as.put(`/connectors/${tool}`).send(CREDENTIALS[tool]).expect(200);
      await settled(tool);
    }
    const { body } = await as.get('/clients').expect(200);
    harbour = body.data.find(
      (c: { name: string }) => c.name === 'Harbour Dental Ltd',
    ).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reads what the client said from Fathom’s summary, citing the recording', async () => {
    const [meeting] = await until(meetings, (list) =>
      list.some((m) => m.readAt !== null),
    );
    expect(meeting!.planning).toEqual([
      {
        text: 'A second surgery in the spring',
        sourceIds: [meeting!.recordingSourceId],
      },
    ]);
    const read = reads().find((r) => r.context.includes("Fathom's summary"));
    expect(read?.context).toContain('a second site is planned for spring');
  });

  it('keeps what was read through the next sync, without reading it again', async () => {
    const before = reads().length;
    await as.post('/connectors/fathom/sync').expect(202);
    await settled('fathom');
    const [meeting] = await meetings();
    expect(meeting?.planning).toHaveLength(1);
    expect(meeting?.readAt).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(reads()).toHaveLength(before);
  });

  it('reads notes the team adds, citing the words they came from', async () => {
    const { body } = await as
      .post('/notes')
      .send({
        clientId: harbour,
        title: 'Site walk',
        occurredOn: new Date().toISOString().slice(0, 10),
        body: 'Priya said they want to move files to the cloud next year.',
      })
      .expect(201);
    const [note] = await until(notes, (list) =>
      list.some((n) => n.id === body.id && n.readAt !== null),
    );
    expect(note!.planning).toEqual([
      {
        text: 'Moving files to the cloud next year',
        sourceIds: [expect.any(String)],
      },
    ]);
    const cited = note!.planning[0]!.sourceIds[0]!;
    const sources = listOf(sourceSchema).parse(
      (await as.get(`/sources?ids=${cited}`).expect(200)).body,
    ).data;
    expect(sources).toEqual([
      expect.objectContaining({
        kind: 'note',
        tool: null,
        noteId: body.id,
        quote: 'move files to the cloud',
        clientId: harbour,
      }),
    ]);

    await as.delete(`/notes/${body.id}`).expect(204);
    const after = (await as.get(`/sources?ids=${cited}`).expect(200)).body;
    expect(after.data).toEqual([]);
  });

  it('counts what reading meetings cost', async () => {
    const settings = intelligenceSettingsSchema.parse(
      (await as.get('/intelligence').expect(200)).body,
    );
    expect(settings.spend).toContainEqual(
      expect.objectContaining({ kind: 'meetings', runs: reads().length }),
    );
  });
});
