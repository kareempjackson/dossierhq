import { DEFAULT_MODEL, NO_USAGE } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo } from '@dossierhq/fixtures';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeRead } from '../../test/fake-readers.js';
import { DATABASE } from '../database/database.module.js';
import { Secrets } from '../integrations/secrets.js';
import { EMBEDDER } from '../memory/embedder.js';
import { MemoryIndexer } from '../memory/indexer.js';
import { IntelligenceService } from './intelligence.service.js';
import {
  INTELLIGENCE_MODEL,
  IntelligenceFailure,
  type IntelligenceModel,
  type ModelRequest,
} from './model.js';
import { MODEL_CLIENTS, type ModelClients } from './model-clients.js';
import { buildClientPack, ContextPacks } from './pack.js';
import { TicketReader } from './ticket-insights.js';

const ws = demo.workspace.id;
const USAGE = { ...NO_USAGE, inputTokens: 4_000, outputTokens: 600 };
const NO_CLIENTS: ModelClients = {
  connect: () => {
    throw new Error('No workspace keys');
  },
  check: async () => {},
};

function fakeModel(
  answer: (req: ModelRequest<unknown>) => unknown = (req) => fakeRead(req),
) {
  const requests: ModelRequest<unknown>[] = [];
  const model: IntelligenceModel = {
    async generate<T>(req: ModelRequest<T>) {
      requests.push(req as ModelRequest<unknown>);
      return {
        data: answer(req as ModelRequest<unknown>) as T,
        usage: USAGE,
        model: req.model,
      };
    },
  };
  return { model, requests };
}

async function setup(model: IntelligenceModel) {
  const db = createMemoryAdapter(demo);
  const moduleRef = await Test.createTestingModule({
    providers: [
      IntelligenceService,
      TicketReader,
      MemoryIndexer,
      ContextPacks,
      { provide: DATABASE, useValue: db },
      { provide: INTELLIGENCE_MODEL, useValue: model },
      { provide: MODEL_CLIENTS, useValue: NO_CLIENTS },
      { provide: Secrets, useValue: new Secrets(Buffer.alloc(32, 7)) },
      { provide: EMBEDDER, useValue: null },
      {
        provide: ConfigService,
        useValue: { get: () => DEFAULT_MODEL },
      },
    ],
  }).compile();
  const indexer = moduleRef.get(MemoryIndexer);
  await indexer.index(ws);
  return {
    db: db as DatabaseAdapter,
    reader: moduleRef.get(TicketReader),
    indexer,
    packs: moduleRef.get(ContextPacks),
  };
}

afterEach(() => vi.useRealTimers());

describe('TicketReader', () => {
  it('reads every ticket once on the reading model, and again only when it changes', async () => {
    const fake = fakeModel();
    const { db, reader } = await setup(fake.model);
    // A ticket with nothing written on it has nothing to read.
    const written = demo.tickets.filter((t) => t.entries.length > 0).length;
    await expect(reader.read(ws)).resolves.toBe(written);
    expect(fake.requests.every((r) => r.model === 'claude-haiku-5-5')).toBe(
      true,
    );
    expect(fake.requests[0]!.system).toContain('one support ticket');
    expect(fake.requests[0]!.context).toMatch(
      /^<ticket_record>\n\[S1\] Ticket #/,
    );
    const runs = await db.intelligence.runs(ws, '2000-01-01T00:00:00.000Z');
    expect(runs.filter((r) => r.kind === 'tickets')).toHaveLength(written);

    await expect(reader.read(ws)).resolves.toBe(0);
    expect(fake.requests).toHaveLength(written);
  });

  it('flags lines resting on internal notes, and drops an executive version that does', async () => {
    const fake = fakeModel((req) => {
      const read = fakeRead(req) as Record<string, unknown>;
      const internal = /^\[(E\d+)\] .*\(internal\):/m.exec(req.context)?.[1];
      // This executive version leans on an internal note.
      return internal ? { ...read, executiveEntries: [internal] } : read;
    });
    const { db, reader } = await setup(fake.model);
    await reader.read(ws);
    const xray = demo.tickets.find((t) => t.entries.some((e) => !e.public))!;
    const [read] = await db.ticketInsights.list(ws, { ticketIds: [xray.id] });
    expect(read).toMatchObject({
      withInternal: true,
      rootCause: { internal: true },
      executive: null,
    });
    expect(read!.tried.map((l) => l.internal)).toEqual([true, false]);
    const other = (await db.ticketInsights.list(ws)).find(
      (r) => r.ticketId !== xray.id,
    );
    expect(other?.executive).not.toBeNull();
  });

  it('tries a failed read again after an hour, and stops when the provider slows it down', async () => {
    let calls = 0;
    const fake = fakeModel(() => {
      calls += 1;
      throw new IntelligenceFailure('failed', 'Too busy', NO_USAGE, true);
    });
    const { db, reader } = await setup(fake.model);
    await expect(reader.read(ws)).resolves.toBe(0);
    // Three readers, each stopped by its first refusal.
    expect(calls).toBeLessThanOrEqual(3);
    const failed = await db.ticketInsights.states(ws);
    expect(failed.every((s) => s.status === 'failed')).toBe(true);

    const before = calls;
    await reader.read(ws);
    const retried = calls - before;
    // Only the tickets never tried yet are tried; the failed ones wait.
    expect(retried).toBeLessThanOrEqual(3);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    const later = calls;
    await reader.read(ws);
    expect(calls).toBeGreaterThan(later);
  });

  it('puts what it read in the client pack in place of the latest replies', async () => {
    const { reader, packs } = await setup(fakeModel().model);
    const xray = demo.tickets.find((t) => t.entries.some((e) => !e.public))!;
    const before = buildClientPack(
      (await packs.input(ws, xray.clientId))!,
      new Date('2026-10-14T09:00:00.000Z'),
    );
    await reader.read(ws);
    const after = buildClientPack(
      (await packs.input(ws, xray.clientId))!,
      new Date('2026-10-14T09:00:00.000Z'),
    );
    expect(after.text).toContain("Dossier's read: Read: ");
    expect(after.hash).not.toBe(before.hash);
    // Same reads, same pack: nothing drafts again for it.
    const again = buildClientPack(
      (await packs.input(ws, xray.clientId))!,
      new Date('2026-10-14T09:00:00.000Z'),
    );
    expect(again.hash).toBe(after.hash);
  });

  it('puts what it read back into memory, as the passage similar tickets are found by', async () => {
    const { db, reader, indexer } = await setup(fakeModel().model);
    await reader.read(ws);
    await indexer.index(ws);
    const ticket = demo.tickets.find((t) => t.entries.length > 0)!;
    const chunks = await db.memory.chunks(ws, `ticket:${ticket.id}`);
    expect(chunks.find((c) => c.key === 'summary')?.body).toContain(
      `Read: ${ticket.subject}`,
    );
  });
});
