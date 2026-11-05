import {
  askAnswerSchema,
  connectorSchema,
  listOf,
  clientThemeSchema,
  endUserDetailSchema,
  memoryStatusSchema,
  ticketInsightViewSchema,
  type AskAnswer,
  type MemoryStatus,
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
import { EMBEDDER } from '../src/memory/embedder.js';
import { signUpWorkspace } from './accounts.js';
import { CREDENTIALS, fakeTools, NINJAONE_SIGN_IN } from './fake-tools.js';
import { fakeRead } from './fake-readers.js';
import { HashingEmbedder } from './hashing-embedder.js';

const USAGE = {
  inputTokens: 2_000,
  outputTokens: 300,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/**
 * Drafts nothing; answers questions by searching what's written for the MX
 * records change, and cites the first passage it gets back.
 */
function fakeClaude() {
  const found: string[] = [];
  const reads: ModelRequest<unknown>[] = [];
  const model: IntelligenceModel = {
    async generate<T>(req: ModelRequest<T>) {
      reads.push(req as ModelRequest<unknown>);
      const read = fakeRead(req as ModelRequest<unknown>);
      if (read) return { data: read as T, usage: USAGE, model: req.model };
      // A meeting with its transcript: a worry, in the client's own words.
      if (req.context.includes('[W1]')) {
        return {
          data: {
            planning: [],
            concerns: [
              {
                text: 'Worried about losing the X-ray images',
                sources: ['W1'],
                quote: null,
              },
            ],
            askedFor: [],
          } as T,
          usage: USAGE,
          model: req.model,
        };
      }
      return {
        data: {
          recommendations: [],
          patterns: [],
          planning: [],
          concerns: [],
          askedFor: [],
        } as T,
        usage: USAGE,
        model: req.model,
      };
    },
    async answer<T>(req: ToolLoopRequest<T>) {
      const tool = req.tools.find((t) => t.name === 'search_memory')!;
      const result = await tool.run({
        query: 'MX records changed at the registrar',
        client_id: null,
        person: null,
        kinds: ['ticket'],
        since: null,
      });
      found.push(result);
      const handle = /\[(S\d+)/.exec(result)?.[1];
      return {
        data: {
          answered: Boolean(handle),
          paragraphs: handle
            ? [{ text: 'The MX records were changed.', sources: [handle] }]
            : [{ text: 'Nothing found.', sources: [] }],
          executive: [],
        } as T,
        usage: USAGE,
        model: req.model,
      };
    },
  };
  return { model, found, reads };
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  for (let i = 0; i < 300; i++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Gave up waiting');
}

describe('Memory (e2e)', () => {
  const claude = fakeClaude();
  const embedder = new HashingEmbedder();
  const tools = fakeTools();
  let app: Awaited<ReturnType<typeof boot>>['app'];
  let as: Awaited<ReturnType<typeof boot>>['as'];

  async function boot() {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HTTP_OPTIONS)
      .useValue({ fetch: tools.fetch, sleep: async () => {} })
      .overrideProvider(INTELLIGENCE_MODEL)
      .useValue(claude.model)
      .overrideProvider(EMBEDDER)
      .useValue(embedder)
      .overrideProvider(INTELLIGENCE_OPTIONS)
      .useValue({ settleMs: 0, concurrency: 2 })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const api = request(app.getHttpServer());
    const body = await signUpWorkspace(app, {
      workspaceName: 'Larkspur IT',
      timeZone: 'Europe/London',
      name: 'Sam Okafor',
      email: 'sam@larkspur.example',
      password: 'correct horse battery',
    });
    const auth = (r: request.Test) =>
      r.set('Authorization', `Bearer ${body.token}`);
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

  const status = async (): Promise<MemoryStatus> =>
    memoryStatusSchema.parse(
      (await as.get('/intelligence/memory').expect(200)).body,
    );
  const settled = () =>
    until(
      async () =>
        listOf(connectorSchema).parse((await as.get('/connectors')).body).data,
      (connectors) => connectors.every((c) => c.status !== 'syncing'),
    );
  const ask = async (question: string): Promise<AskAnswer> => {
    const { body } = await as.post('/ask').send({ question }).expect(202);
    return until(
      async () => askAnswerSchema.parse((await as.get(`/ask/${body.id}`)).body),
      (answer) => answer.status !== 'answering',
    );
  };

  beforeAll(async () => {
    ({ app, as } = await boot());
    await as.put('/connectors/hudu').send(CREDENTIALS.hudu).expect(200);
    // Signed in as a technician, NinjaOne gives tickets and what's on them.
    const { body: start } = await as
      .post('/connectors/ninjaone/sign-in')
      .send(NINJAONE_SIGN_IN)
      .expect(200);
    const state = new URL(start.authorizeUrl).searchParams.get('state');
    await as
      .post('/connectors/ninjaone/sign-in/finish')
      .send({
        pending: start.pending,
        state,
        code: tools.authorize(start.authorizeUrl),
      })
      .expect(201);
    await settled();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('remembers what’s written on tickets, and embeds every passage', async () => {
    const remembered = await until(
      status,
      (s) => (s.documents.ticket ?? 0) > 0 && s.embedded === s.chunks,
    );
    expect(remembered).toMatchObject({
      embeddings: 'on',
      model: 'voyage-4',
      backfilling: false,
    });
    expect(remembered.documents.alert).toBeGreaterThan(0);
    expect(remembered.chunks).toBeGreaterThan(remembered.documents.ticket!);
    expect(embedder.documents.join('\n')).toContain('MX records changed');
    // Secrets were redacted before anything was stored or sent.
    expect(embedder.documents.join('\n')).not.toContain('Hunter2');

    const spend = (await as.get('/intelligence').expect(200)).body.spend as {
      kind: string;
      cost: number;
    }[];
    expect(spend.find((s) => s.kind === 'embeddings')?.cost).toBeGreaterThan(0);
  });

  it('lets Ask cite a passage from a ticket’s conversation', async () => {
    const answer = await ask('Why did email stop at Harbour Dental?');
    expect(claude.found.at(-1)).toContain('<search_results>');
    expect(claude.found.at(-1)).toContain(
      'MX records changed at the registrar',
    );
    expect(claude.found.at(-1)).toContain('internal note by Sam Okafor');
    expect(answer.answered).toBe(true);
    expect(answer.lines[0]!.sourceIds).toHaveLength(1);
    expect(answer.sources[0]).toMatchObject({ recordType: 'Ticket' });
  });

  it('forgets internal notes as soon as they stop being shared', async () => {
    await as
      .put('/intelligence/preferences')
      .send({ records: { ticketNotes: false } })
      .expect(200);
    await ask('Why did email stop at Harbour Dental?');
    expect(claude.found.at(-1)).not.toContain('internal note');
    expect(claude.found.at(-1)).not.toContain('MX records changed');
    await as.put('/intelligence/preferences').send({}).expect(200);
  });

  it('reads each ticket on the reading model, and finds similar ones', async () => {
    const tickets = (await as.get('/tickets').expect(200)).body.data as {
      id: string;
      number: string;
    }[];
    const email = tickets.find((t) => t.number === '4821')!;
    const insightOf = async () =>
      ticketInsightViewSchema.parse(
        (await as.get(`/tickets/${email.id}/insight`).expect(200)).body,
      );
    // A pass reads what changed since; earlier tests changed what's shared.
    await as.post('/intelligence/draft').expect(202);
    const view = await until(
      insightOf,
      (v) => v.insight?.withInternal === true,
    );
    expect(view.reading).toBe(true);
    expect(view.insight).toMatchObject({
      ticketId: email.id,
      summary: 'Read: Email is down for the whole practice.',
      outcome: 'resolved',
      // The made-up entry is dropped; what rests on internal notes says so.
      tried: [
        { text: 'Checked the settings', internal: true },
        { text: 'Asked the client', internal: false },
      ],
      rootCause: { text: 'A settings change', internal: true },
      executive: { headline: 'Sorted: Email is down for the whole practice' },
    });
    expect(view.insight!.deviceIds).toHaveLength(1);
    const read = claude.reads.find((r) =>
      r.context.startsWith('<ticket_record>'),
    )!;
    expect(read.model).toBe('claude-haiku-5-5');
    expect(read.context).toContain('(internal)');
    expect(view.similar.length).toBeGreaterThan(0);
    expect(view.similar.map((t) => t.ticketId)).not.toContain(email.id);
    expect(view.similar[0]).toMatchObject({ live: true });

    // The owner can choose the reading model.
    const { body: settings } = await as
      .put('/intelligence/reading')
      .send({ model: 'claude-sonnet-5-5' })
      .expect(200);
    expect(settings).toMatchObject({
      readingModel: 'claude-sonnet-5-5',
      readingChosen: 'claude-sonnet-5-5',
    });
    expect(
      (settings.spend as { kind: string }[]).map((row) => row.kind),
    ).toContain('tickets');

    // Internal notes off: what was read with them goes, and the next pass
    // reads the ticket again from what the client saw.
    await as
      .put('/intelligence/preferences')
      .send({ records: { ticketNotes: false } })
      .expect(200);
    expect((await insightOf()).insight).toBeNull();
    await as.post('/intelligence/draft').expect(202);
    const again = await until(insightOf, (v) => v.insight !== null);
    expect(again.insight!.withInternal).toBe(false);
    expect(again.insight!.tried.every((line) => !line.internal)).toBe(true);
    expect(
      claude.reads.filter((r) => r.context.startsWith('<ticket_record>')).at(-1)
        ?.model,
    ).toBe('claude-sonnet-5-5');
    await as.put('/intelligence/preferences').send({}).expect(200);
    await as.put('/intelligence/reading').send({ model: null }).expect(200);
  });

  it('keeps what was said in meetings, cites the moment, and profiles people', async () => {
    await as.put('/connectors/fathom').send(CREDENTIALS.fathom).expect(200);
    await settled();
    await until(
      status,
      (s) => (s.documents.transcript ?? 0) > 0 && s.embedded === s.chunks,
    );
    const said = embedder.documents
      .filter((text) => text.startsWith('Meeting transcript'))
      .join('\n');
    // Turns in a row by one person are one turn; each side is named.
    expect(said).toContain(
      '[00:10:45] Priya Nair (client): If we lost the X-ray images we would have to close for the day. Can we test a restore before the end of the month?',
    );
    expect(said).toContain('Sam Okafor (MSP)');
    // "Priya" is priya@ on the invite, so she's taken as Priya Nair.
    expect(said).toContain(
      '[00:20:00] Priya Nair (client): We are opening a second site in the spring.',
    );
    expect(said).not.toContain('Hunter2');

    const harbour = (
      (await as.get('/clients').expect(200)).body.data as {
        id: string;
        name: string;
      }[]
    ).find((c) => c.name.startsWith('Harbour'))!;
    await as.post('/intelligence/draft').expect(202);
    const nair = await until(
      async () =>
        endUserDetailSchema.parse(
          (await as.get(`/clients/${harbour.id}/users/priyanair`).expect(200))
            .body,
        ),
      (detail) => JSON.stringify(detail.meetings).includes('X-ray images'),
    );
    // What she said, cited to the moment in the recording.
    expect(JSON.stringify(nair.meetings)).toContain(
      'Worried about losing the X-ray images',
    );

    const shah = await until(
      async () =>
        endUserDetailSchema.parse(
          (await as.get(`/clients/${harbour.id}/users/priyashah`).expect(200))
            .body,
        ),
      (detail) => detail.profile !== null,
    );
    expect(shah.profile).toMatchObject({
      personKey: 'priyashah',
      summary: 'Priya Shah is known from their records.',
      tone: { trend: 'steady', note: 'Calm and clear.' },
      executive: { headline: 'Priya Shah’s IT is being looked after' },
    });
    // The made-up citation went; the real one stands.
    expect(shah.profile!.recurring).toHaveLength(1);
    const person = claude.reads.find((r) =>
      r.context.startsWith('<person_records>'),
    )!;
    expect(person.model).toBe('claude-haiku-5-5');
  });

  it('finds what keeps coming back at a client, and drafts and compares with it', async () => {
    const harbour = (
      (await as.get('/clients').expect(200)).body.data as {
        id: string;
        name: string;
      }[]
    ).find((c) => c.name.startsWith('Harbour'))!;
    await as.post('/intelligence/draft').expect(202);
    const themes = await until(
      async () =>
        listOf(clientThemeSchema).parse(
          (await as.get(`/clients/${harbour.id}/themes`).expect(200)).body,
        ).data,
      (list) => list.length > 0,
    );
    // The one-ticket "issue" isn't one; the made-up ticket is dropped.
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      title: 'Email keeps going down',
      trend: 'growing',
      executive: { headline: 'Email outages keep interrupting the practice' },
    });
    expect(themes[0]!.ticketIds).toHaveLength(2);
    const asked = claude.reads.find((r) =>
      r.context.startsWith('<client_tickets>'),
    )!;
    expect(asked.model).toBe('claude-haiku-5-5');

    // Recommendations and patterns across clients read it.
    await until(
      async () =>
        claude.reads.filter(
          (r) =>
            r.context.startsWith('<client_records>') &&
            r.context.includes('Email keeps going down'),
        ).length,
      (n) => n > 0,
    );
    await as.post('/intelligence/patterns').expect(202);
    await until(
      async () =>
        claude.reads.filter(
          (r) =>
            r.context.startsWith('<workspace_records>') &&
            r.context.includes('Keeps coming back: Email keeps going down'),
        ).length,
      (n) => n > 0,
    );
  });

  it('reads past records on request, and forgets a tool’s once it’s disconnected', async () => {
    await as.post('/intelligence/memory/backfill').expect(202);
    await until(status, (s) => !s.backfilling);
    await as.delete('/connectors/ninjaone').expect(204);
    const after = await status();
    expect(after.documents.ticket).toBeUndefined();
    expect(after.documents.alert).toBeUndefined();
    expect(after.documents.asset).toBeGreaterThan(0);
  });
});
