import {
  DEFAULT_MODEL,
  NO_USAGE,
  TICKET_ENTRIES_VERSION,
} from '@dossierhq/contracts';
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
import { WorkLeases } from '../common/leases.js';

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
      WorkLeases,
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

  it('stops when the provider slows it down, without holding it against any ticket', async () => {
    let calls = 0;
    const fake = fakeModel(() => {
      calls += 1;
      throw new IntelligenceFailure('failed', 'Too busy', NO_USAGE, true);
    });
    const { db, reader } = await setup(fake.model);
    await expect(reader.read(ws)).resolves.toBe(0);
    // Three readers, each stopped by its first refusal.
    expect(calls).toBeLessThanOrEqual(3);
    // Nothing is wrong with the tickets: none is marked failed or made to wait.
    await expect(db.ticketInsights.states(ws)).resolves.toEqual([]);
    await expect(db.aiRetries.list(ws, 'tickets')).resolves.toEqual([]);
  });

  it('waits longer after each failed read of the same ticket, then stops trying', async () => {
    let calls = 0;
    const fake = fakeModel(() => {
      calls += 1;
      throw new IntelligenceFailure('failed', 'Garbled answer');
    });
    const { db, reader } = await setup(fake.model);
    const written = demo.tickets.filter((t) => t.entries.length > 0).length;
    vi.useFakeTimers({ toFake: ['Date'] });
    const HOUR = 60 * 60 * 1000;
    const start = Date.now();
    /** Reads at `hours` after the start; answers how many tickets were tried. */
    const triedAt = async (hours: number) => {
      vi.setSystemTime(start + hours * HOUR);
      const before = calls;
      // So many failures also pause the workspace (see limits.spec.ts);
      // lifted here, to see each ticket's own wait.
      await db.aiBudget.resume(ws);
      await reader.read(ws);
      return calls - before;
    };

    // Every ticket fails once, and is marked as one Dossier couldn't read.
    await expect(triedAt(0)).resolves.toBe(written);
    const states = await db.ticketInsights.states(ws);
    expect(states).toHaveLength(written);
    expect(states.every((s) => s.status === 'failed')).toBe(true);

    // 1 h after the first failure, then 2 h after the second, 4 h, 8 h, 16 h…
    await expect(triedAt(0.5)).resolves.toBe(0);
    await expect(triedAt(1)).resolves.toBe(written);
    await expect(triedAt(2.5)).resolves.toBe(0);
    await expect(triedAt(3)).resolves.toBe(written);
    await expect(triedAt(6.5)).resolves.toBe(0);
    await expect(triedAt(7)).resolves.toBe(written);
    await expect(triedAt(15)).resolves.toBe(written);
    await expect(triedAt(31)).resolves.toBe(written);
    // …and after six failures on the same words, not again.
    await expect(triedAt(31 + 24 * 30)).resolves.toBe(0);
    const retries = await db.aiRetries.list(ws, 'tickets');
    expect(retries).toHaveLength(written);
    expect(retries.every((r) => r.attempts === 6)).toBe(true);
  });

  it('keeps the last good read when reading a changed ticket fails', async () => {
    let failing = false;
    const fake = fakeModel((req) => {
      if (failing) throw new IntelligenceFailure('failed', 'Garbled answer');
      return fakeRead(req);
    });
    const { db, reader } = await setup(fake.model);
    await reader.read(ws);
    const ticket = demo.tickets.find((t) => t.entries.length > 0)!;
    const good = (
      await db.ticketInsights.list(ws, { ticketIds: [ticket.id] })
    )[0]!;
    expect(good.summary).toContain('Read: ');

    // A new reply arrives, and the read of it fails.
    const list = db.tickets.list.bind(db.tickets);
    db.tickets.list = async (...args) =>
      (await list(...args)).map((t) =>
        t.id === ticket.id
          ? {
              ...t,
              entries: [
                ...t.entries,
                {
                  ...t.entries[0]!,
                  id: 'new',
                  at: t.updatedAt,
                  text: 'It has happened again this morning.',
                },
              ],
            }
          : t,
      );
    failing = true;
    await expect(reader.read(ws)).resolves.toBe(0);
    await expect(
      db.ticketInsights.list(ws, { ticketIds: [ticket.id] }),
    ).resolves.toEqual([good]);
    await expect(db.aiRetries.list(ws, 'tickets')).resolves.toHaveLength(1);

    // Once it reads, the new read takes its place and the failure is forgotten.
    failing = false;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    await expect(reader.read(ws)).resolves.toBe(1);
    await expect(db.aiRetries.list(ws, 'tickets')).resolves.toEqual([]);
    const again = (
      await db.ticketInsights.list(ws, { ticketIds: [ticket.id] })
    )[0]!;
    expect(again.readAt).not.toBe(good.readAt);
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

  it('reads an unchanged ticket once, though memory then carries what it read', async () => {
    const fake = fakeModel();
    const { reader, indexer } = await setup(fake.model);
    const first = await reader.read(ws);
    expect(first).toBeGreaterThan(0);
    // Each pass rebuilds memory, now with Dossier's read in it, then reads.
    for (let pass = 0; pass < 3; pass++) {
      await indexer.index(ws);
      await expect(reader.read(ws)).resolves.toBe(0);
    }
    expect(fake.requests).toHaveLength(first);
  });

  it('reads a ticket again only when what it says changes', async () => {
    const fake = fakeModel();
    const { db, reader } = await setup(fake.model);
    await reader.read(ws);
    const before = fake.requests.length;
    const target = demo.tickets.find((t) => t.entries.length > 0 && !t.open)!;
    let change = (t: (typeof demo.tickets)[number]) => t;
    const list = db.tickets.list.bind(db.tickets);
    db.tickets.list = async (...args) =>
      (await list(...args)).map((t) => (t.id === target.id ? change(t) : t));

    // An automation closing a resolved ticket: still closed, nothing new.
    change = (t) => ({ ...t, status: 'Closed by automation' });
    await expect(reader.read(ws)).resolves.toBe(0);
    // Who Dossier takes an entry to be from is Dossier's, not the ticket's.
    change = (t) => ({
      ...t,
      entries: t.entries.map((e) => ({ ...e, author: 'Someone else' })),
    });
    await expect(reader.read(ws)).resolves.toBe(0);
    // Reopened, or someone writes on it: read again, once.
    change = (t) => ({ ...t, open: true });
    await expect(reader.read(ws)).resolves.toBe(1);
    await expect(reader.read(ws)).resolves.toBe(0);
    change = (t) => ({
      ...t,
      open: true,
      entries: [
        ...t.entries,
        { ...t.entries[0]!, id: 'new', at: t.updatedAt, text: 'Still broken.' },
      ],
    });
    await expect(reader.read(ws)).resolves.toBe(1);
    expect(fake.requests).toHaveLength(before + 2);
  });

  it('waits for a ticket’s entries to be read the current way before reading it', async () => {
    const fake = fakeModel();
    const { db, reader } = await setup(fake.model);
    const target = demo.tickets.find((t) => t.entries.length > 0)!;
    let version = 1;
    const list = db.tickets.list.bind(db.tickets);
    db.tickets.list = async (...args) =>
      (await list(...args)).map((t) =>
        t.id === target.id ? { ...t, entriesVersion: version } : t,
      );
    const written = demo.tickets.filter((t) => t.entries.length > 0).length;
    await expect(reader.read(ws)).resolves.toBe(written - 1);
    // The sync reads its entries again; then it's read, once.
    version = TICKET_ENTRIES_VERSION;
    await expect(reader.read(ws)).resolves.toBe(1);
    await expect(reader.read(ws)).resolves.toBe(0);
  });

  it('keeps reads made before tickets were keyed by what they say', async () => {
    const fake = fakeModel();
    const { db, reader } = await setup(fake.model);
    const first = await reader.read(ws);
    // As an earlier release stored them: keyed by the memory document.
    for (const insight of await db.ticketInsights.list(ws)) {
      await db.ticketInsights.save(ws, {
        ticketId: insight.ticketId,
        documentId: `ticket:${insight.ticketId}`,
        clientId: insight.clientId,
        inputHash: 'oldDocumentHash1',
        status: 'ok',
        model: insight.model,
        withInternal: insight.withInternal,
        insight,
        error: null,
        attemptedAt: insight.readAt,
        readAt: insight.readAt,
      });
    }
    await expect(reader.read(ws)).resolves.toBe(0);
    expect(fake.requests).toHaveLength(first);
    const states = await db.ticketInsights.states(ws);
    expect(states.every((s) => s.inputHash.startsWith('k2:'))).toBe(true);
    await expect(reader.read(ws)).resolves.toBe(0);
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
