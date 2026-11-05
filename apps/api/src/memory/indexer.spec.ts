import {
  intelligencePreferencesSchema,
  type Ticket,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo } from '@dossierhq/fixtures';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { HashingEmbedder } from '../../test/hashing-embedder.js';
import { DATABASE } from '../database/database.module.js';
import { HandleBook } from '../intelligence/pack.js';
import { EMBEDDER, type Embedder } from './embedder.js';
import { MemoryIndexer } from './indexer.js';
import { MemorySearch } from './search.js';

const ws = demo.workspace.id;

async function setup(embedder: Embedder | null = new HashingEmbedder()) {
  const db = createMemoryAdapter(demo);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MemoryIndexer,
      MemorySearch,
      { provide: DATABASE, useValue: db },
      { provide: EMBEDDER, useValue: embedder },
    ],
  }).compile();
  return {
    db,
    indexer: moduleRef.get(MemoryIndexer),
    search: moduleRef.get(MemorySearch),
  };
}

/** Changes what the tickets repository returns, as a sync would. */
function editTickets(
  db: DatabaseAdapter,
  change: (tickets: Ticket[]) => Ticket[],
) {
  const list = db.tickets.list.bind(db.tickets);
  db.tickets.list = async (...args) => change(await list(...args));
}

const share = async (db: DatabaseAdapter, preferences: unknown) =>
  db.intelligence.setPreferences(ws, preferences as Record<string, unknown>);

describe('MemoryIndexer', () => {
  it('remembers tickets, alerts and documentation, and embeds each passage once', async () => {
    const embedder = new HashingEmbedder();
    const { db, indexer } = await setup(embedder);
    const first = await indexer.index(ws);
    expect(first.saved).toBeGreaterThan(0);
    const counts = await db.memory.counts(ws);
    expect(counts.documents).toMatchObject({
      ticket: demo.tickets.length,
      alert: expect.any(Number),
      asset: expect.any(Number),
    });
    expect(counts.embedded).toBe(counts.chunks);
    expect(first.embedded).toBe(counts.chunks);
    const [run] = await db.intelligence.runs(ws, '2000-01-01T00:00:00.000Z');
    expect(run).toMatchObject({
      kind: 'embeddings',
      model: 'voyage-4',
      status: 'ok',
      clientId: null,
    });
    expect(run!.cost).toBeGreaterThan(0);

    // Nothing changed: nothing written, nothing embedded.
    const calls = embedder.calls.length;
    await expect(indexer.index(ws)).resolves.toMatchObject({
      saved: 0,
      embedded: 0,
    });
    expect(embedder.calls).toHaveLength(calls);
  });

  it('embeds again only the reply that changed', async () => {
    const embedder = new HashingEmbedder();
    const { db, indexer } = await setup(embedder);
    await indexer.index(ws);
    const target = demo.tickets.find((t) => t.entries.length > 1)!;
    editTickets(db, (tickets) =>
      tickets.map((t) =>
        t.id === target.id
          ? {
              ...t,
              status: 'Waiting',
              entries: t.entries.map((e, i) =>
                i === t.entries.length - 1
                  ? { ...e, text: `${e.text} Followed up by phone.` }
                  : e,
              ),
            }
          : t,
      ),
    );
    const before = embedder.documents.length;
    await expect(indexer.index(ws)).resolves.toMatchObject({
      saved: 1,
      embedded: 1,
    });
    expect(embedder.documents.slice(before)).toEqual([
      expect.stringContaining('Followed up by phone.'),
    ]);
  });

  it('keeps a ticket that leaves the sync, and every reply it ever had', async () => {
    const { db, indexer } = await setup();
    await indexer.index(ws);
    const gone = demo.tickets[0]!;
    editTickets(db, (tickets) => tickets.filter((t) => t.id !== gone.id));
    await indexer.index(ws);
    const docs = await db.memory.documents(ws, { kinds: ['ticket'] });
    const kept = docs.find((d) => d.id === `ticket:${gone.id}`);
    expect(kept?.missingSince).not.toBeNull();
    const chunks = await db.memory.chunks(ws, `ticket:${gone.id}`);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('forgets what stops being shared, and sends nothing to Voyage when memory is off', async () => {
    const embedder = new HashingEmbedder();
    const { db, indexer } = await setup(embedder);
    await indexer.index(ws);
    const internal = async () =>
      (
        await Promise.all(
          (await db.memory.documents(ws, { kinds: ['ticket'] })).map((d) =>
            db.memory.chunks(ws, d.id),
          ),
        )
      )
        .flat()
        .filter((c) => c.internal);
    expect((await internal()).length).toBeGreaterThan(0);

    await share(db, { records: { ticketNotes: false, documentation: false } });
    await indexer.index(ws);
    await expect(internal()).resolves.toEqual([]);
    expect((await db.memory.counts(ws)).documents.asset).toBeUndefined();

    await share(db, { outputs: { memory: false } });
    const calls = embedder.calls.length;
    await indexer.index(ws);
    expect(embedder.calls).toHaveLength(calls);
    expect((await db.memory.counts(ws)).embedded).toBe(0);
    await expect(indexer.status(ws)).resolves.toMatchObject({
      embeddings: 'off',
    });
  });

  it('searches by words alone without Voyage, and keeps to its budget with it', async () => {
    const plain = await setup(null);
    await plain.indexer.index(ws);
    expect((await plain.db.memory.counts(ws)).embedded).toBe(0);
    await expect(plain.indexer.status(ws)).resolves.toMatchObject({
      embeddings: 'unavailable',
    });
    const preferences = intelligencePreferencesSchema.parse({});
    const found = await plain.search.find(
      ws,
      { query: 'X-ray licence error' },
      preferences,
      new HandleBook(),
    );
    expect(found).toContain('<search_results>');
    expect(found).toMatch(/\[S1\] Ticket #4821/);

    const limited = await setup();
    await expect(
      limited.indexer.index(ws, { embedBudget: 3 }),
    ).resolves.toMatchObject({ embedded: 3 });
  });
});

describe('MemorySearch', () => {
  it('finds passages by meaning, two at most from a document, never internal notes unless shared', async () => {
    const { db, indexer, search } = await setup();
    await indexer.index(ws);
    const preferences = intelligencePreferencesSchema.parse({});
    const hits = await search.passages(
      ws,
      { query: 'licence service stopped after the patch' },
      preferences,
    );
    expect(hits.length).toBeGreaterThan(0);
    const perDocument = new Map<string, number>();
    for (const { hit } of hits) {
      perDocument.set(
        hit.documentId,
        (perDocument.get(hit.documentId) ?? 0) + 1,
      );
    }
    expect(Math.max(...perDocument.values())).toBeLessThanOrEqual(2);
    expect(hits.some(({ hit }) => hit.internal)).toBe(true);

    await share(db, { records: { ticketNotes: false } });
    const withheld = intelligencePreferencesSchema.parse({
      records: { ticketNotes: false },
    });
    const without = await search.passages(
      ws,
      { query: 'licence service stopped after the patch' },
      withheld,
    );
    expect(without.some(({ hit }) => hit.internal)).toBe(false);

    // A person's records, and one client's.
    const priya = await search.passages(
      ws,
      { query: 'backup restore', person: 'Priya Nair' },
      preferences,
    );
    for (const { hit } of priya) expect(hit.personKeys).toContain('priyanair');
    const harbour = await search.passages(
      ws,
      { query: 'printer', clientId: 'northside-legal' },
      preferences,
    );
    for (const { hit } of harbour) expect(hit.clientId).toBe('northside-legal');
  });
});
