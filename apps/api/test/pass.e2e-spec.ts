import type { DatabaseAdapter } from '@dossierhq/database';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo } from '@dossierhq/fixtures';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { DATABASE } from '../src/database/database.module.js';
import {
  INTELLIGENCE_MODEL,
  type IntelligenceModel,
  type ModelRequest,
} from '../src/intelligence/model.js';
import {
  INTELLIGENCE_OPTIONS,
  IntelligenceScheduler,
} from '../src/intelligence/scheduler.js';
import { fakeRead } from './fake-readers.js';

const ws = demo.workspace.id;
const USAGE = {
  inputTokens: 100,
  outputTokens: 10,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/**
 * The background pass looks only at what changed: with nothing new it loads
 * no records and asks no model, and one changed client costs one client.
 */
describe('Background pass (e2e)', () => {
  let app: INestApplication;
  let scheduler: IntelligenceScheduler;
  const db: DatabaseAdapter = createMemoryAdapter(demo);
  /** The client each load of tickets was for; null for the whole workspace. */
  let ticketLoads: (string | null)[] = [];
  let sourceLoads: string[] = [];
  let modelCalls = 0;
  const reset = () => {
    ticketLoads = [];
    sourceLoads = [];
    modelCalls = 0;
  };

  beforeAll(async () => {
    const listTickets = db.tickets.list.bind(db.tickets);
    db.tickets.list = (workspaceId, filter) => {
      ticketLoads.push(filter?.clientId ?? null);
      return listTickets(workspaceId, filter);
    };
    const listSources = db.sources.listForClient.bind(db.sources);
    db.sources.listForClient = (workspaceId, clientId, ...rest) => {
      sourceLoads.push(clientId);
      return listSources(workspaceId, clientId, ...rest);
    };
    const model: IntelligenceModel = {
      async generate<T>(req: ModelRequest<T>) {
        modelCalls += 1;
        const read = fakeRead(req as ModelRequest<unknown>);
        return {
          data: (read ?? {
            recommendations: [],
            patterns: [],
            themes: [],
            planning: [],
            concerns: [],
            askedFor: [],
          }) as T,
          usage: USAGE,
          model: req.model,
        };
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(db)
      .overrideProvider(INTELLIGENCE_MODEL)
      .useValue(model)
      .overrideProvider(INTELLIGENCE_OPTIONS)
      .useValue({ settleMs: 60_000, concurrency: 2 })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    scheduler = app.get(IntelligenceScheduler);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('looks at every client the first time', async () => {
    const steps = ['memory', 'tickets', 'people', 'clients', 'drafts'];
    const everyone = demo.clients.map((c) => c.id).sort();
    const marked = async (step: string) =>
      (await db.changes.marks(ws, step)).map((m) => m.clientId).sort();
    await scheduler.now(ws);
    expect(modelCalls).toBeGreaterThan(0);
    expect(ticketLoads.length).toBeGreaterThan(0);
    // More people than one pass profiles: a step isn't done until it has
    // nothing left, so later passes carry on with it.
    for (let pass = 0; pass < 20; pass++) {
      if ((await marked('people')).length > 0) break;
      await scheduler.now(ws);
    }
    for (const step of steps) {
      expect(await marked(step), step).toEqual(everyone);
    }
  });

  it('loads no records and asks no model when nothing changed', async () => {
    reset();
    await scheduler.now(ws);
    expect(ticketLoads).toEqual([]);
    expect(sourceLoads).toEqual([]);
    expect(modelCalls).toBe(0);
  });

  it('loads one client’s records when one client changed', async () => {
    const client = demo.clients[0]!;
    await db.changes.touch(ws, [client.id], new Date().toISOString());
    reset();
    await scheduler.now(ws);
    expect(ticketLoads.length).toBeGreaterThan(0);
    expect(new Set(ticketLoads)).toEqual(new Set([client.id]));
    expect(new Set(sourceLoads)).toEqual(new Set([client.id]));

    // Dealt with: the next pass is quiet again, except for the draft, which
    // waits for its six hours and stays due without loading anything.
    reset();
    await scheduler.now(ws);
    expect(ticketLoads).toEqual([]);
    expect(sourceLoads).toEqual([]);
    expect(modelCalls).toBe(0);
  });

  it('looks at every client again when what the workspace shares changes', async () => {
    await db.changes.forgetMarks(ws);
    reset();
    await scheduler.now(ws);
    expect(ticketLoads.length).toBeGreaterThan(0);
  });
});
