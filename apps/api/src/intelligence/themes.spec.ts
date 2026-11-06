import { DEFAULT_MODEL, NO_USAGE } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo } from '@dossierhq/fixtures';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { fakeRead } from '../../test/fake-readers.js';
import { DATABASE } from '../database/database.module.js';
import { Secrets } from '../integrations/secrets.js';
import { EMBEDDER } from '../memory/embedder.js';
import { MemoryIndexer } from '../memory/indexer.js';
import { IntelligenceService } from './intelligence.service.js';
import {
  INTELLIGENCE_MODEL,
  type IntelligenceModel,
  type ModelRequest,
} from './model.js';
import { MODEL_CLIENTS, type ModelClients } from './model-clients.js';
import { buildClientPack, ContextPacks } from './pack.js';
import { ThemeFinder } from './themes.js';
import { TicketReader } from './ticket-insights.js';

/** What a test entry doesn't say: no ID, address, side or recipients. */
const ENTRY = {
  id: null,
  email: null,
  side: null,
  via: null,
  to: [] as string[],
  cc: [] as string[],
};

const ws = demo.workspace.id;
const NO_CLIENTS: ModelClients = {
  connect: () => {
    throw new Error('No workspace keys');
  },
  check: async () => {},
};

async function setup() {
  const requests: ModelRequest<unknown>[] = [];
  const model: IntelligenceModel = {
    async generate<T>(req: ModelRequest<T>) {
      requests.push(req as ModelRequest<unknown>);
      return {
        data: fakeRead(req as ModelRequest<unknown>) as T,
        usage: { ...NO_USAGE, inputTokens: 2_000, outputTokens: 300 },
        model: req.model,
      };
    },
  };
  const db = createMemoryAdapter(demo);
  // A second Harbour Dental ticket with something written on it, so two
  // tickets there have been read.
  const list = db.tickets.list.bind(db.tickets);
  db.tickets.list = async (...args) =>
    (await list(...args)).map((t) =>
      t.clientId === 'harbour-dental' && t.entries.length === 0
        ? {
            ...t,
            entries: [
              {
                ...ENTRY,
                at: t.openedAt,
                author: 'Priya Nair',
                kind: 'description' as const,
                public: true,
                text: 'Email stopped again this morning.',
              },
            ],
          }
        : t,
    );
  const moduleRef = await Test.createTestingModule({
    providers: [
      IntelligenceService,
      TicketReader,
      ThemeFinder,
      MemoryIndexer,
      ContextPacks,
      { provide: DATABASE, useValue: db },
      { provide: INTELLIGENCE_MODEL, useValue: model },
      { provide: MODEL_CLIENTS, useValue: NO_CLIENTS },
      { provide: Secrets, useValue: new Secrets(Buffer.alloc(32, 7)) },
      { provide: EMBEDDER, useValue: null },
      { provide: ConfigService, useValue: { get: () => DEFAULT_MODEL } },
    ],
  }).compile();
  await moduleRef.get(MemoryIndexer).index(ws);
  await moduleRef.get(TicketReader).read(ws);
  const client = 'harbour-dental';
  return {
    db: db as DatabaseAdapter,
    finder: moduleRef.get(ThemeFinder),
    packs: moduleRef.get(ContextPacks),
    requests,
    client,
  };
}

describe('ThemeFinder', () => {
  it('keeps issues that rest on two tickets or more, and looks again only when due', async () => {
    const { db, finder, requests, client } = await setup();
    await expect(finder.find(ws, client)).resolves.toBe(true);
    const themes = await db.themes.list(ws, { clientId: client });
    expect(themes.map((t) => t.title)).toEqual(['Email keeps going down']);
    expect(themes[0]!.ticketIds).toHaveLength(2);
    const asked = requests.find((r) =>
      r.context.startsWith('<client_tickets>'),
    )!;
    expect(asked.model).toBe('claude-haiku-5-5');
    expect(asked.system).toContain('keeps coming back');
    // Nothing changed: not asked again.
    await expect(finder.find(ws, client)).resolves.toBe(false);
  });

  it('puts them in the client pack, citing the tickets', async () => {
    const { finder, packs, client } = await setup();
    await finder.find(ws, client);
    const pack = buildClientPack(
      (await packs.input(ws, client))!,
      new Date('2026-10-14T09:00:00.000Z'),
    );
    expect(pack.text).toMatch(
      /## Recurring issues[^\n]*\n- \[S\d+, S\d+\] Email keeps going down/,
    );
  });
});
