import type {
  ClientTheme,
  MemoryKind,
  PersonProfile,
  Source,
  TicketInsight,
} from '@dossierhq/contracts';
import { byMemoryHit } from '../../ordering.js';
import type {
  MemoryChunkInput,
  MemoryDocumentInput,
  MemoryFilter,
  MemoryHit,
  MemoryRecord,
  ClientThemesRepository,
  MemoryRepository,
  PersonInsightRecord,
  PersonInsightsRepository,
  TicketInsightRecord,
  TicketInsightsRepository,
} from '../../types.js';

export type StoredMemoryDocument = Omit<
  MemoryDocumentInput,
  'chunks' | 'removedKeys' | 'sources'
> & { missingSince: string | null };

export type StoredMemoryChunk = MemoryChunkInput & {
  documentId: string;
  clientId: string;
  kind: MemoryKind;
  record: MemoryRecord;
  embedding: number[] | null;
  embeddingModel: string | null;
};

/** The part of a workspace's store that memory keeps. */
export type MemoryStore = {
  memoryDocuments: StoredMemoryDocument[];
  memoryChunks: StoredMemoryChunk[];
  /** Sources as they stood, by ID. */
  memorySources: Map<string, { documentId: string; source: Source }>;
  /** What was read off each ticket; goes with the ticket's memory. */
  ticketInsights: TicketInsightRecord[];
  /** The model that reads tickets and people; null follows the default. */
  readingModel: string | null;
  /** What was read about each person. */
  personInsights: PersonInsightRecord[];
  /** Recurring issues, in each client's order. */
  themes: ClientTheme[];
};

export const emptyMemory = (): MemoryStore => ({
  memoryDocuments: [],
  memoryChunks: [],
  memorySources: new Map(),
  ticketInsights: [],
  readingModel: null,
  personInsights: [],
  themes: [],
});

/** Deletes documents with their passages and sources, like ON DELETE CASCADE. */
export function forgetDocuments(
  store: MemoryStore,
  drop: (doc: StoredMemoryDocument) => boolean,
): number {
  const gone = new Set(store.memoryDocuments.filter(drop).map((d) => d.id));
  if (gone.size === 0) return 0;
  store.memoryDocuments = store.memoryDocuments.filter((d) => !gone.has(d.id));
  store.memoryChunks = store.memoryChunks.filter(
    (c) => !gone.has(c.documentId),
  );
  for (const [id, kept] of store.memorySources) {
    if (gone.has(kept.documentId)) store.memorySources.delete(id);
  }
  store.ticketInsights = store.ticketInsights.filter(
    (r) => !gone.has(r.documentId),
  );
  return gone.size;
}

/** Ticket reads, kept beside memory as the SQL schema keeps them. */
export function ticketInsightsRepository(
  storeOf: (workspaceId: string) => MemoryStore | undefined,
): TicketInsightsRepository {
  return {
    async states(workspaceId) {
      return (storeOf(workspaceId)?.ticketInsights ?? []).map((r) => ({
        ticketId: r.ticketId,
        inputHash: r.inputHash,
        status: r.status,
        attemptedAt: r.attemptedAt,
      }));
    },
    async save(workspaceId, record) {
      const store = storeOf(workspaceId);
      if (!store) return;
      if (!store.memoryDocuments.some((d) => d.id === record.documentId)) {
        throw new Error(
          `No memory of ${record.documentId}: its read can't be kept.`,
        );
      }
      store.ticketInsights = [
        ...store.ticketInsights.filter((r) => r.ticketId !== record.ticketId),
        structuredClone(record),
      ];
    },
    async list(workspaceId, filter) {
      const ids = filter?.ticketIds ? new Set(filter.ticketIds) : null;
      return (storeOf(workspaceId)?.ticketInsights ?? [])
        .filter(
          (r) =>
            r.status === 'ok' &&
            r.insight !== null &&
            (!filter?.clientId || r.clientId === filter.clientId) &&
            (!ids || ids.has(r.ticketId)),
        )
        .sort(
          (a, b) =>
            (b.readAt ?? '').localeCompare(a.readAt ?? '') ||
            a.ticketId.localeCompare(b.ticketId),
        )
        .map((r) => structuredClone(r.insight as TicketInsight));
    },
    async purge(workspaceId, filter) {
      const store = storeOf(workspaceId);
      if (!store) return 0;
      const ids = filter.ticketIds ? new Set(filter.ticketIds) : null;
      const before = store.ticketInsights.length;
      store.ticketInsights = store.ticketInsights.filter(
        (r) =>
          !(
            (filter.withInternal && r.withInternal) ||
            (ids && ids.has(r.ticketId))
          ),
      );
      return before - store.ticketInsights.length;
    },
  };
}

/** Words for matching, roughly as Postgres's English search reads them. */
const STOP = new Set(
  'a an and are as at be but by for from has have he her his i if in into is it its of on or our she so that the their them then there these they this to was we were what when where which who why will with you your'.split(
    ' ',
  ),
);
const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1 && !STOP.has(word));

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

function matches(chunk: StoredMemoryChunk, filter: MemoryFilter): boolean {
  return (
    (!filter.clientIds || filter.clientIds.includes(chunk.clientId)) &&
    (!filter.personKey || chunk.personKeys.includes(filter.personKey)) &&
    filter.records.includes(chunk.record) &&
    (!filter.kinds || filter.kinds.includes(chunk.kind)) &&
    (filter.includeInternal || !chunk.internal) &&
    (!filter.since || chunk.occurredAt >= filter.since) &&
    (!filter.excludeDocumentIds ||
      !filter.excludeDocumentIds.includes(chunk.documentId))
  );
}

const keyOf = (c: { documentId: string; key: string }) =>
  `${c.documentId}\u0000${c.key}`;

/** The same search as the SQL adapters, in memory: for tests and development. */
export function memoryRepository(
  storeOf: (workspaceId: string) => MemoryStore | undefined,
): MemoryRepository {
  const hit = (
    store: MemoryStore,
    chunk: StoredMemoryChunk,
    score: number,
  ): MemoryHit => {
    const doc = store.memoryDocuments.find((d) => d.id === chunk.documentId)!;
    return structuredClone({
      documentId: chunk.documentId,
      key: chunk.key,
      clientId: chunk.clientId,
      kind: chunk.kind,
      record: chunk.record,
      internal: chunk.internal,
      personKeys: chunk.personKeys,
      occurredAt: chunk.occurredAt,
      heading: chunk.heading,
      body: chunk.body,
      meta: chunk.meta,
      sourceId: chunk.sourceId ?? doc.sourceId,
      title: doc.title,
      score,
    });
  };

  return {
    async documents(workspaceId, filter) {
      const store = storeOf(workspaceId);
      return (store?.memoryDocuments ?? [])
        .filter((d) => !filter?.kinds || filter.kinds.includes(d.kind))
        .map((d) => ({
          id: d.id,
          clientId: d.clientId,
          kind: d.kind,
          contentHash: d.contentHash,
          missingSince: d.missingSince,
        }));
    },
    async chunkStates(workspaceId, documentIds) {
      const wanted = new Set(documentIds);
      return (storeOf(workspaceId)?.memoryChunks ?? [])
        .filter((c) => wanted.has(c.documentId))
        .map((c) => ({
          documentId: c.documentId,
          key: c.key,
          contentHash: c.contentHash,
          embedded: c.embedding !== null,
        }));
    },
    async chunks(workspaceId, documentId) {
      return (storeOf(workspaceId)?.memoryChunks ?? [])
        .filter((c) => c.documentId === documentId)
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        .map(({ embedding, embeddingModel: _model, ...chunk }) =>
          structuredClone({ ...chunk, embedded: embedding !== null }),
        );
    },
    async save(workspaceId, docs) {
      const store = storeOf(workspaceId);
      if (!store) return;
      for (const input of structuredClone(docs)) {
        const { chunks, removedKeys, sources, ...doc } = input;
        const index = store.memoryDocuments.findIndex((d) => d.id === doc.id);
        const stored = { ...doc, missingSince: null };
        if (index >= 0) store.memoryDocuments[index] = stored;
        else store.memoryDocuments.push(stored);
        const removed = new Set(removedKeys);
        store.memoryChunks = store.memoryChunks.filter(
          (c) => !(c.documentId === doc.id && removed.has(c.key)),
        );
        for (const chunk of chunks) {
          const at = store.memoryChunks.findIndex(
            (c) => c.documentId === doc.id && c.key === chunk.key,
          );
          const before = store.memoryChunks[at];
          const kept = before?.contentHash === chunk.contentHash;
          const next: StoredMemoryChunk = {
            ...chunk,
            documentId: doc.id,
            clientId: doc.clientId,
            kind: doc.kind,
            record: doc.record,
            embedding: kept ? before.embedding : null,
            embeddingModel: kept ? before.embeddingModel : null,
          };
          if (at >= 0) store.memoryChunks[at] = next;
          else store.memoryChunks.push(next);
        }
        for (const chunk of store.memoryChunks) {
          if (chunk.documentId === doc.id) {
            chunk.clientId = doc.clientId;
            chunk.record = doc.record;
          }
        }
        for (const source of sources) {
          store.memorySources.set(source.id, { documentId: doc.id, source });
        }
      }
    },
    async reconcile(workspaceId, kinds, present, now, forgetBefore) {
      const store = storeOf(workspaceId);
      if (!store) return;
      const here = new Set(present);
      for (const doc of store.memoryDocuments) {
        if (here.has(doc.id)) doc.missingSince = null;
        else if (kinds.includes(doc.kind)) doc.missingSince ??= now;
      }
      forgetDocuments(
        store,
        (d) =>
          d.kind === 'asset' &&
          d.missingSince !== null &&
          d.missingSince < forgetBefore,
      );
    },
    async pending(workspaceId, limit) {
      return (storeOf(workspaceId)?.memoryChunks ?? [])
        .filter((c) => c.embedding === null)
        .slice(0, limit)
        .map((c) => ({
          documentId: c.documentId,
          key: c.key,
          heading: c.heading,
          body: c.body,
          contentHash: c.contentHash,
        }));
    },
    async setEmbeddings(workspaceId, model, rows) {
      const store = storeOf(workspaceId);
      if (!store) return 0;
      let stored = 0;
      for (const row of rows) {
        const chunk = store.memoryChunks.find(
          (c) =>
            c.documentId === row.documentId &&
            c.key === row.key &&
            c.contentHash === row.contentHash,
        );
        if (!chunk) continue;
        chunk.embedding = [...row.embedding];
        chunk.embeddingModel = model;
        stored += 1;
      }
      return stored;
    },
    async search(workspaceId, query) {
      const store = storeOf(workspaceId);
      if (!store) return [];
      const eligible = store.memoryChunks.filter((c) => matches(c, query));
      const score = new Map<string, number>();
      const add = (list: StoredMemoryChunk[]) =>
        list.slice(0, 50).forEach((c, index) => {
          score.set(keyOf(c), (score.get(keyOf(c)) ?? 0) + 1 / (61 + index));
        });
      if (query.embedding) {
        const vector = query.embedding;
        add(
          eligible
            .filter((c) => c.embedding)
            .map((c) => ({ c, s: cosine(vector, c.embedding!) }))
            .sort((a, b) => b.s - a.s)
            .map(({ c }) => c),
        );
      }
      const terms = [...new Set(wordsOf(query.text))];
      if (terms.length > 0) {
        add(
          eligible
            .map((c) => {
              const words = new Set(wordsOf(`${c.heading} ${c.body}`));
              return { c, s: terms.filter((t) => words.has(t)).length };
            })
            .filter(({ s }) => s > 0)
            .sort((a, b) => b.s - a.s)
            .map(({ c }) => c),
        );
      }
      return eligible
        .filter((c) => score.has(keyOf(c)))
        .map((c) => hit(store, c, score.get(keyOf(c))!))
        .sort(byMemoryHit)
        .slice(0, Math.max(query.limit, 0));
    },
    async similar(workspaceId, documentId, keys, filter, limit) {
      const store = storeOf(workspaceId);
      if (!store) return [];
      const anchor = keys
        .map((key) =>
          store.memoryChunks.find(
            (c) => c.documentId === documentId && c.key === key && c.embedding,
          ),
        )
        .find(Boolean);
      if (!anchor?.embedding) return [];
      const best = new Map<string, { c: StoredMemoryChunk; s: number }>();
      for (const c of store.memoryChunks) {
        if (
          c.documentId === documentId ||
          !keys.includes(c.key) ||
          !c.embedding ||
          !matches(c, filter)
        ) {
          continue;
        }
        const s = cosine(anchor.embedding, c.embedding);
        const known = best.get(c.documentId);
        if (!known || s > known.s) best.set(c.documentId, { c, s });
      }
      return [...best.values()]
        .sort(
          (a, b) =>
            b.s - a.s ||
            (a.c.documentId < b.c.documentId
              ? -1
              : a.c.documentId > b.c.documentId
                ? 1
                : 0),
        )
        .slice(0, Math.max(limit, 0))
        .map(({ c, s }) => hit(store, c, s));
    },
    async purge(workspaceId, purge) {
      const store = storeOf(workspaceId);
      if (!store) return 0;
      let count = 0;
      if (purge.documentIds) {
        const ids = new Set(purge.documentIds);
        count += forgetDocuments(store, (d) => ids.has(d.id));
      }
      if (purge.records) {
        const records = purge.records;
        count += forgetDocuments(store, (d) => records.includes(d.record));
      }
      if (purge.internalOnly) {
        const before = store.memoryChunks.length;
        store.memoryChunks = store.memoryChunks.filter((c) => !c.internal);
        count += before - store.memoryChunks.length;
      }
      if (purge.embeddingsOnly) {
        for (const chunk of store.memoryChunks) {
          if (chunk.embedding) {
            chunk.embedding = null;
            chunk.embeddingModel = null;
            count += 1;
          }
        }
      }
      return count;
    },
    async counts(workspaceId) {
      const store = storeOf(workspaceId);
      const documents: Partial<Record<MemoryKind, number>> = {};
      for (const doc of store?.memoryDocuments ?? []) {
        documents[doc.kind] = (documents[doc.kind] ?? 0) + 1;
      }
      const chunks = store?.memoryChunks ?? [];
      const oldest = (store?.memoryDocuments ?? [])
        .map((d) => d.occurredAt)
        .sort()[0];
      return {
        documents,
        chunks: chunks.length,
        embedded: chunks.filter((c) => c.embedding).length,
        oldestAt: oldest ?? null,
      };
    },
  };
}

/** Person reads, kept as the SQL schema keeps them. */
export function personInsightsRepository(
  storeOf: (workspaceId: string) => MemoryStore | undefined,
): PersonInsightsRepository {
  const same = (r: PersonInsightRecord, clientId: string, key: string) =>
    r.clientId === clientId && r.personKey === key;
  return {
    async states(workspaceId) {
      return (storeOf(workspaceId)?.personInsights ?? []).map((r) => ({
        clientId: r.clientId,
        personKey: r.personKey,
        inputHash: r.inputHash,
        status: r.status,
        attemptedAt: r.attemptedAt,
      }));
    },
    async save(workspaceId, record) {
      const store = storeOf(workspaceId);
      if (!store) return;
      store.personInsights = [
        ...store.personInsights.filter(
          (r) => !same(r, record.clientId, record.personKey),
        ),
        structuredClone(record),
      ];
    },
    async get(workspaceId, clientId, personKey) {
      const found = storeOf(workspaceId)?.personInsights.find(
        (r) => same(r, clientId, personKey) && r.status === 'ok',
      );
      return found?.profile
        ? structuredClone(found.profile as PersonProfile)
        : null;
    },
    async purge(workspaceId) {
      const store = storeOf(workspaceId);
      if (!store) return 0;
      const before = store.personInsights.length;
      store.personInsights = store.personInsights.filter(
        (r) => !r.withInternal,
      );
      return before - store.personInsights.length;
    },
  };
}

/** Recurring issues, kept as the SQL schema keeps them. */
export function clientThemesRepository(
  storeOf: (workspaceId: string) => MemoryStore | undefined,
): ClientThemesRepository {
  return {
    async list(workspaceId, filter) {
      return structuredClone(
        (storeOf(workspaceId)?.themes ?? []).filter(
          (t) => !filter?.clientId || t.clientId === filter.clientId,
        ),
      );
    },
    async replace(workspaceId, clientId, themes) {
      const store = storeOf(workspaceId);
      if (!store) return;
      store.themes = [
        ...store.themes.filter((t) => t.clientId !== clientId),
        ...structuredClone(themes),
      ];
    },
  };
}
