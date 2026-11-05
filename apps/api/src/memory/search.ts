import type {
  IntelligencePreferences,
  MemoryKind,
  Source,
} from '@dossierhq/contracts';
import type {
  DatabaseAdapter,
  MemoryFilter,
  MemoryHit,
} from '@dossierhq/database';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { personKey } from '../clients/end-users.js';
import { DATABASE } from '../database/database.module.js';
import { clean, type HandleBook } from '../intelligence/pack.js';
import { EMBEDDER, type Embedder } from './embedder.js';
import { MemoryIndexer } from './indexer.js';

/** Passages one search returns. */
const MAX_PASSAGES = 12;
/** Passages from any one document, so one long ticket can't crowd the rest. */
const PER_DOCUMENT = 2;
/** How much of each passage is shown. */
const PASSAGE_CHARS = 700;

export type MemoryQueryInput = {
  query: string;
  clientId?: string | null;
  /** A person's name, as the records spell it. */
  person?: string | null;
  kinds?: MemoryKind[];
  /** YYYY-MM-DD. */
  since?: string | null;
};

/**
 * Searches what's written across a workspace's records by meaning and by
 * words, within what it shares with models, and returns the passages
 * themselves with handles to cite.
 */
@Injectable()
export class MemorySearch {
  private readonly logger = new Logger(MemorySearch.name);

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    @Optional() @Inject(EMBEDDER) private readonly embedder: Embedder | null,
    private readonly indexer: MemoryIndexer,
  ) {}

  /** What the workspace lets a search look at. */
  filter(preferences: IntelligencePreferences): MemoryFilter {
    return {
      records: this.indexer.shared(preferences),
      includeInternal: preferences.records.ticketNotes,
    };
  }

  /** The question as a vector, or null to search by words alone. */
  async embedQuery(
    query: string,
    preferences: IntelligencePreferences,
  ): Promise<number[] | null> {
    if (!this.embedder || !this.indexer.embeds(preferences)) return null;
    try {
      const { vectors } = await this.embedder.embed([query], 'query');
      return vectors[0] ?? null;
    } catch (error) {
      this.logger.warn(
        `Embedding a search failed, so it goes by words: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** The best passages, at most two a document, and the sources they cite. */
  async passages(
    workspaceId: string,
    input: MemoryQueryInput,
    preferences: IntelligencePreferences,
    limit = MAX_PASSAGES,
  ): Promise<{ hit: MemoryHit; source: Source }[]> {
    const base = this.filter(preferences);
    if (base.records.length === 0 || !input.query.trim()) return [];
    const key = input.person ? personKey(input.person) : null;
    const hits = await this.db.memory.search(workspaceId, {
      ...base,
      ...(input.clientId ? { clientIds: [input.clientId] } : {}),
      ...(key ? { personKey: key } : {}),
      ...(input.kinds && input.kinds.length > 0 ? { kinds: input.kinds } : {}),
      ...(input.since && /^\d{4}-\d{2}-\d{2}$/.test(input.since)
        ? { since: `${input.since}T00:00:00.000Z` }
        : {}),
      text: input.query,
      embedding: await this.embedQuery(input.query, preferences),
      limit: limit * 4,
    });
    const perDocument = new Map<string, number>();
    const kept = hits.filter((hit) => {
      const seen = perDocument.get(hit.documentId) ?? 0;
      if (seen >= PER_DOCUMENT || !hit.sourceId) return false;
      perDocument.set(hit.documentId, seen + 1);
      return true;
    });
    const sources = new Map(
      (
        await this.db.sources.getMany(workspaceId, [
          ...new Set(kept.map((hit) => hit.sourceId!)),
        ])
      ).map((source) => [source.id, source]),
    );
    return kept
      .flatMap((hit) => {
        const source = sources.get(hit.sourceId!);
        return source ? [{ hit, source }] : [];
      })
      .slice(0, limit);
  }

  /** Passages as a model reads them, with handles from the question's book. */
  async find(
    workspaceId: string,
    input: MemoryQueryInput,
    preferences: IntelligencePreferences,
    book: HandleBook,
  ): Promise<string> {
    const found = await this.passages(workspaceId, input, preferences);
    if (found.length === 0) {
      return `<search_results>\nNothing written in the records matches "${clean(input.query, 120)}".\n</search_results>`;
    }
    return [
      '<search_results>',
      ...found.map(
        ({ hit, source }) =>
          `- ${book.cite([source])}${clean(hit.heading, 220)}\n  ${clean(hit.body, PASSAGE_CHARS)}`,
      ),
      '</search_results>',
    ].join('\n');
  }
}
