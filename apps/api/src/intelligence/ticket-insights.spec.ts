import {
  costOf,
  DEFAULT_MODEL,
  NO_USAGE,
  TICKET_ENTRIES_VERSION,
  type ModelId,
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
  type BatchItem,
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

/** A model that also takes batches, answering them once `end` is called. */
function batchModel() {
  const fake = fakeModel();
  const batches = new Map<string, BatchItem<unknown>[]>();
  let ended = false;
  const model: IntelligenceModel = {
    ...fake.model,
    async submitBatch<T>(items: BatchItem<T>[]) {
      const id = `batch-${batches.size + 1}`;
      batches.set(id, items as BatchItem<unknown>[]);
      return id;
    },
    async collectBatch<T>(id: string, _schema: unknown, asked: ModelId) {
      if (!batches.has(id)) return 'gone' as const;
      if (!ended) return 'running' as const;
      return batches.get(id)!.map((item) => ({
        id: item.id,
        reply: {
          data: fakeRead(item.request) as T,
          usage: USAGE,
          model: asked,
        },
      }));
    },
  };
  return { ...fake, model, batches, end: () => (ended = true) };
}

async function setup(model: IntelligenceModel, clients = NO_CLIENTS) {
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
      { provide: MODEL_CLIENTS, useValue: clients },
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
    intelligence: moduleRef.get(IntelligenceService),
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
  it('takes a handle on a long ticket to mean the entry shown under it', async () => {
    // The model cites the last entry it was shown, by the handle it had.
    const last = (context: string) =>
      /\[(E\d+)\] [^\n]*\n\s*We replaced the switch\./.exec(context)?.[1];
    const fake = fakeModel((req) => ({
      ...(fakeRead(req) as object),
      resolution: {
        text: 'Replaced the switch.',
        entries: [last(req.context) ?? 'E1'],
      },
    }));
    const { db, reader } = await setup(fake.model);
    const target = demo.tickets.find((t) => t.entries.length > 0)!;
    const chunks = db.memory.chunks.bind(db.memory);
    db.memory.chunks = async (workspaceId, documentId) => {
      const real = await chunks(workspaceId, documentId);
      const entry = real.find((c) => c.key.startsWith('e:'));
      if (documentId !== `ticket:${target.id}` || !entry) return real;
      // Too long to show whole: two public entries, twelve long internal
      // ones in the middle, and a short public one at the end.
      const made = (n: number, internal: boolean, body: string) => ({
        ...entry,
        key: `e:${String(n).padStart(3, '0')}`,
        occurredAt: `2030-01-${String(n + 1).padStart(2, '0')}T00:00:00.000Z`,
        internal,
        body,
      });
      return [
        ...real.filter((c) => !c.key.startsWith('e:')),
        made(0, false, 'It stopped working.'),
        made(1, false, 'Still down.'),
        ...Array.from({ length: 12 }, (_, i) =>
          made(i + 2, true, 'Internal note. '.repeat(260)),
        ),
        made(14, false, 'We replaced the switch.'),
      ];
    };
    await reader.read(ws);
    const context = fake.requests.find((r) =>
      r.context.includes('We replaced the switch.'),
    )!.context;
    expect(context).toContain('entries in the middle left out');
    // Fewer handles than entries: the last one shown isn't the fifteenth.
    expect(last(context)).not.toBe('E15');
    const [read] = await db.ticketInsights.list(ws, {
      ticketIds: [target.id],
    });
    // The entry under that handle was public. The entry in that place in
    // the whole ticket, which was never shown, is an internal note.
    expect(read!.resolution).toEqual({
      text: 'Replaced the switch.',
      internal: false,
    });
  });

  describe('the backlog, on the workspace’s own key', () => {
    /** Closed tickets made old, so they're backlog; open ones stay recent. */
    async function withBacklog() {
      const fake = batchModel();
      const world = await setup(fakeModel().model, {
        connect: () => fake.model,
        check: async () => {},
      });
      const owner = demo.users[0]!;
      await world.intelligence.addKey(ws, owner.id, 'anthropic', 'sk-own-key');
      const list = world.db.tickets.list.bind(world.db.tickets);
      world.db.tickets.list = async (...args) =>
        (await list(...args)).map((t) =>
          t.open ? t : { ...t, updatedAt: '2001-01-01T00:00:00.000Z' },
        );
      const written = demo.tickets.filter((t) => t.entries.length > 0);
      return {
        ...world,
        fake,
        recent: written.filter((t) => t.open),
        backlog: written.filter((t) => !t.open),
      };
    }

    it('reads recent tickets now and sends the rest as one batch', async () => {
      const { db, reader, fake, recent, backlog } = await withBacklog();
      expect(recent.length).toBeGreaterThan(0);
      expect(backlog.length).toBeGreaterThan(0);

      await expect(reader.sweep(ws)).resolves.toEqual({
        read: recent.length,
        done: true,
        collected: 0,
      });
      expect(fake.requests).toHaveLength(recent.length);
      expect([...fake.batches.values()].map((b) => b.length)).toEqual([
        backlog.length,
      ]);
      const [out] = await db.aiBatches.list(ws);
      expect(out).toMatchObject({ id: 'batch-1', kind: 'tickets' });
      expect(
        Object.values(out!.items)
          .map((item) => (item as { ticketId: string }).ticketId)
          .sort(),
      ).toEqual(backlog.map((t) => t.id).sort());

      // Still out: nothing is read twice, and nothing more is sent. A ticket
      // not in the batch waits its turn, so the sweep isn't done.
      await expect(reader.sweep(ws)).resolves.toEqual({
        read: 0,
        done: false,
        collected: 0,
      });
      expect(fake.requests).toHaveLength(recent.length);
      expect(fake.batches.size).toBe(1);
    });

    it('saves a batch’s answers at half price and notes its clients as changed', async () => {
      const { db, reader, fake, recent, backlog } = await withBacklog();
      await reader.sweep(ws);
      fake.end();

      await expect(reader.sweep(ws)).resolves.toEqual({
        read: 0,
        done: true,
        collected: backlog.length,
      });
      await expect(db.aiBatches.list(ws)).resolves.toEqual([]);
      const reads = await db.ticketInsights.list(ws);
      expect(reads.map((r) => r.ticketId).sort()).toEqual(
        [...recent, ...backlog].map((t) => t.id).sort(),
      );
      const runs = (
        await db.intelligence.runs(ws, '2000-01-01T00:00:00.000Z')
      ).filter((r) => r.kind === 'tickets');
      const full = costOf(USAGE, 'claude-haiku-5-5');
      expect(runs.map((r) => r.cost).sort()).toEqual(
        [...recent.map(() => full), ...backlog.map(() => full / 2)].sort(),
      );
      expect((await db.changes.list(ws)).map((c) => c.clientId).sort()).toEqual(
        [...new Set(backlog.map((t) => t.clientId))].sort(),
      );

      // All read: nothing left to send.
      await expect(reader.sweep(ws)).resolves.toEqual({
        read: 0,
        done: true,
        collected: 0,
      });
      expect(fake.batches.size).toBe(1);
    });

    it('drops an answer whose ticket changed while the batch was out', async () => {
      const { db, reader, fake, backlog } = await withBacklog();
      await reader.sweep(ws);
      const target = backlog[0]!;
      const chunks = db.memory.chunks.bind(db.memory);
      db.memory.chunks = async (workspaceId, documentId) =>
        (await chunks(workspaceId, documentId)).filter(
          (chunk) =>
            documentId !== `ticket:${target.id}` || !chunk.key.startsWith('e:'),
        );
      fake.end();
      const { collected } = await reader.sweep(ws);
      expect(collected).toBe(backlog.length - 1);
      const reads = await db.ticketInsights.list(ws);
      expect(reads.some((r) => r.ticketId === target.id)).toBe(false);
    });

    it('forgets a batch the provider no longer has, and sends its tickets again', async () => {
      const { db, reader, fake, backlog } = await withBacklog();
      await reader.sweep(ws);
      fake.batches.clear();
      await expect(reader.sweep(ws)).resolves.toMatchObject({ collected: 0 });
      // Forgotten on the way in, so the same sweep sent them again.
      expect([...fake.batches.values()].map((b) => b.length)).toEqual([
        backlog.length,
      ]);
      await expect(db.aiBatches.list(ws)).resolves.toHaveLength(1);
    });
  });

  it('reads the whole backlog now on Dossier’s key, where nothing is batched', async () => {
    const fake = batchModel();
    const { db, reader } = await setup(fake.model);
    const written = demo.tickets.filter((t) => t.entries.length > 0).length;
    await expect(reader.read(ws)).resolves.toBe(written);
    expect(fake.batches.size).toBe(0);
    await expect(db.aiBatches.list(ws)).resolves.toEqual([]);
  });
});
