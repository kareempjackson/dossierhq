import {
  costOfEmbedding,
  DEFAULT_EMBEDDING_MODEL,
  intelligencePreferencesSchema,
  MEMORY_RECORD_OF,
  NO_USAGE,
  type IntelligencePreferences,
  type MemoryKind,
  type MeetingTranscript,
  type MemoryStatus,
  type Source,
} from '@dossierhq/contracts';
import type {
  DatabaseAdapter,
  MemoryDocumentInput,
  MemoryRecord,
} from '@dossierhq/database';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { findEndUsers } from '../clients/end-users.js';
import { DATABASE } from '../database/database.module.js';
import { DAY_MS } from '../integrations/ids.js';
import {
  alertDocument,
  assetDocument,
  embeddingText,
  noteDocument,
  summaryDocument,
  ticketDocument,
  transcriptDocument,
  type BuiltDocument,
  type People,
} from './chunking.js';
import { EMBEDDER, EmbedderFailure, type Embedder } from './embedder.js';

/** Passages embedded in one pass after a sync; a backfill takes more. */
const EMBED_PER_PASS = 2_000;
/** Passages asked of Voyage at once. */
const EMBED_BATCH = 256;
/** Roughly what one save sends, so requests stay small. */
const SAVE_BYTES = 1_000_000;
/** Documentation gone from Hudu this long is forgotten. */
const FORGET_DOCUMENTATION_MS = 7 * DAY_MS;
/** A backfill stops after this long; the next pass carries on. */
const BACKFILL_MS = 30 * 60_000;

const ALL_RECORDS: MemoryRecord[] = [
  'tickets',
  'meetings',
  'notes',
  'devices',
  'documentation',
];

export type IndexResult = {
  documents: number;
  saved: number;
  embedded: number;
};

/**
 * Keeps memory in step with the records: after each sync, writes what's new
 * or changed in tickets, meetings, notes, alerts and documentation, marks
 * what's gone from the tools, and embeds what isn't yet. Only what the
 * workspace shares with models is kept, and only that reaches Voyage.
 */
@Injectable()
export class MemoryIndexer {
  private readonly logger = new Logger(MemoryIndexer.name);
  private readonly running = new Map<string, Promise<IndexResult>>();
  private readonly backfills = new Set<string>();

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    @Optional() @Inject(EMBEDDER) private readonly embedder: Embedder | null,
  ) {}

  get embeddingModel(): string {
    return this.embedder?.model ?? DEFAULT_EMBEDDING_MODEL;
  }

  async preferences(workspaceId: string): Promise<IntelligencePreferences> {
    return (
      intelligencePreferencesSchema.safeParse(
        await this.db.intelligence.preferences(workspaceId),
      ).data ?? intelligencePreferencesSchema.parse({})
    );
  }

  /** Whether passages are embedded for this workspace. */
  embeds(preferences: IntelligencePreferences): boolean {
    return this.embedder !== null && preferences.outputs.memory;
  }

  /** The record kinds the workspace lets models read, as memory files them. */
  shared(preferences: IntelligencePreferences): MemoryRecord[] {
    return ALL_RECORDS.filter((record) => preferences.records[record]);
  }

  /** One pass at a time per workspace; a second call waits for the first. */
  index(
    workspaceId: string,
    { embedBudget = EMBED_PER_PASS }: { embedBudget?: number } = {},
  ): Promise<IndexResult> {
    const current = this.running.get(workspaceId);
    if (current) return current;
    const pass = this.pass(workspaceId, embedBudget).finally(() =>
      this.running.delete(workspaceId),
    );
    this.running.set(workspaceId, pass);
    return pass;
  }

  /**
   * Reads past records into memory now: passes until everything is embedded,
   * for up to half an hour. Resolves when done.
   */
  async backfill(workspaceId: string): Promise<void> {
    if (this.backfills.has(workspaceId)) return;
    this.backfills.add(workspaceId);
    const until = Date.now() + BACKFILL_MS;
    try {
      for (;;) {
        const result = await this.index(workspaceId, {
          embedBudget: EMBED_PER_PASS * 5,
        });
        const preferences = await this.preferences(workspaceId);
        if (!this.embeds(preferences) || result.embedded === 0) break;
        if (Date.now() > until) break;
      }
    } catch (error) {
      this.logger.warn(
        `Reading past records for ${workspaceId} failed: ${(error as Error).message}`,
      );
    } finally {
      this.backfills.delete(workspaceId);
    }
  }

  async status(workspaceId: string): Promise<MemoryStatus> {
    const [counts, preferences] = await Promise.all([
      this.db.memory.counts(workspaceId),
      this.preferences(workspaceId),
    ]);
    return {
      embeddings: !this.embedder
        ? 'unavailable'
        : preferences.outputs.memory
          ? 'on'
          : 'off',
      model: this.embeddingModel,
      documents: counts.documents,
      chunks: counts.chunks,
      embedded: counts.embedded,
      oldestAt: counts.oldestAt,
      backfilling: this.backfills.has(workspaceId),
    };
  }

  /**
   * Forgets what the workspace stopped sharing: a kind of record, its
   * internal ticket notes, or (with memory off) what Voyage made of it.
   */
  async forgetUnshared(
    workspaceId: string,
    preferences: IntelligencePreferences,
  ): Promise<void> {
    const kept = this.shared(preferences);
    const dropped = ALL_RECORDS.filter((record) => !kept.includes(record));
    if (dropped.length > 0) {
      await this.db.memory.purge(workspaceId, { records: dropped });
    }
    if (!preferences.records.ticketNotes) {
      await this.db.memory.purge(workspaceId, { internalOnly: true });
      // What was read with internal notes rests on them too.
      await this.db.ticketInsights.purge(workspaceId, { withInternal: true });
      await this.db.personInsights.purge(workspaceId, { withInternal: true });
    }
    if (!preferences.outputs.memory) {
      await this.db.memory.purge(workspaceId, { embeddingsOnly: true });
    }
  }

  /**
   * Keeps meeting transcripts a sync fetched. They're in no tool's records
   * once fetched, so memory is where they live; embedded on the next pass.
   */
  async rememberTranscripts(
    workspaceId: string,
    transcripts: MeetingTranscript[],
  ): Promise<number> {
    const preferences = await this.preferences(workspaceId);
    if (!preferences.records.meetings || transcripts.length === 0) return 0;
    const [clients, members, tickets, meetings, devices, recordings] =
      await Promise.all([
        this.db.clients.list(workspaceId),
        this.db.users.members(workspaceId),
        this.db.tickets.list(workspaceId),
        this.db.meetings.list(workspaceId),
        this.db.devices.list(workspaceId),
        this.db.sources.getMany(
          workspaceId,
          transcripts.map((t) => t.recordingSourceId),
        ),
      ]);
    const recordingOf = new Map(recordings.map((s) => [s.id, s]));
    const docs: MemoryDocumentInput[] = [];
    for (const transcript of transcripts) {
      const client = clients.find((c) => c.id === transcript.clientId);
      if (!client) continue;
      const notes = await this.db.notes.list(workspaceId, client.id);
      const people: People = {
        keys: new Set(
          findEndUsers({
            client,
            tickets: tickets.filter((t) => t.clientId === client.id),
            meetings: meetings.filter((m) => m.clientId === client.id),
            devices: devices.filter((d) => d.clientId === client.id),
            notes,
            staffEmails: members.map((m) => m.email),
          }).map((found) => found.user.id),
        ),
      };
      const built = transcriptDocument(transcript, client, people);
      if (!built) continue;
      const {
        sourceIds,
        appendOnly: _appendOnly,
        ...document
      } = built.document;
      docs.push({
        ...document,
        removedKeys: [],
        sources: [
          ...sourceIds.flatMap((id) => recordingOf.get(id) ?? []),
          ...built.moments,
        ],
      });
    }
    await this.db.memory.save(workspaceId, docs);
    return docs.length;
  }

  private async pass(
    workspaceId: string,
    embedBudget: number,
  ): Promise<IndexResult> {
    const preferences = await this.preferences(workspaceId);
    await this.forgetUnshared(workspaceId, preferences);
    const built = await this.build(workspaceId, preferences);
    const saved = await this.save(workspaceId, built.documents, built.sources);
    const kinds = (Object.keys(MEMORY_RECORD_OF) as MemoryKind[]).filter(
      (kind) =>
        kind !== 'transcript' && preferences.records[MEMORY_RECORD_OF[kind]],
    );
    const now = Date.now();
    await this.db.memory.reconcile(
      workspaceId,
      kinds,
      built.documents.map((doc) => doc.id),
      new Date(now).toISOString(),
      new Date(now - FORGET_DOCUMENTATION_MS).toISOString(),
    );
    const embedded = this.embeds(preferences)
      ? await this.embed(workspaceId, embedBudget)
      : 0;
    return { documents: built.documents.length, saved, embedded };
  }

  /** Every document the records hold now, for what's shared. */
  private async build(
    workspaceId: string,
    preferences: IntelligencePreferences,
  ): Promise<{ documents: BuiltDocument[]; sources: Map<string, Source> }> {
    const shared = preferences.records;
    const [clients, members, tickets, meetings, devices, insights] =
      await Promise.all([
        this.db.clients.list(workspaceId),
        this.db.users.members(workspaceId),
        this.db.tickets.list(workspaceId),
        this.db.meetings.list(workspaceId),
        this.db.devices.list(workspaceId),
        this.db.ticketInsights.list(workspaceId),
      ]);
    const insightOf = new Map(insights.map((i) => [i.ticketId, i]));
    const staffEmails = members.map((member) => member.email);
    const documents: BuiltDocument[] = [];
    const sources = new Map<string, Source>();

    for (const client of clients) {
      const [clientSources, notes] = await Promise.all([
        this.db.sources.listForClient(workspaceId, client.id),
        this.db.notes.list(workspaceId, client.id),
      ]);
      for (const source of clientSources) sources.set(source.id, source);
      const theirs = {
        tickets: tickets.filter((t) => t.clientId === client.id),
        meetings: meetings.filter((m) => m.clientId === client.id),
        devices: devices.filter((d) => d.clientId === client.id),
      };
      const people: People = {
        keys: new Set(
          findEndUsers({
            client,
            ...theirs,
            notes,
            staffEmails,
          }).map((found) => found.user.id),
        ),
      };

      if (shared.tickets) {
        for (const ticket of theirs.tickets) {
          const tool = sources.get(ticket.sourceId)?.tool ?? 'ninjaone';
          documents.push(
            ticketDocument(
              ticket,
              client,
              people,
              shared.ticketNotes,
              tool,
              insightOf.get(ticket.id) ?? null,
            ),
          );
        }
      }
      if (shared.meetings) {
        for (const meeting of theirs.meetings) {
          const recording = sources.get(meeting.recordingSourceId);
          const doc =
            recording && summaryDocument(meeting, recording, client, people);
          if (doc) documents.push(doc);
        }
      }
      if (shared.notes) {
        for (const note of notes) {
          const whole =
            clientSources.find(
              (s) => s.kind === 'note' && s.noteId === note.id && !s.quote,
            ) ?? null;
          const doc = noteDocument(
            { ...note, clientId: client.id },
            whole,
            client,
            people,
          );
          if (doc) documents.push(doc);
        }
      }
      for (const source of clientSources) {
        if (source.kind !== 'record') continue;
        if (
          shared.devices &&
          source.tool === 'ninjaone' &&
          source.recordType === 'Alert'
        ) {
          documents.push(alertDocument(source, client, theirs.devices, people));
        } else if (shared.documentation && source.tool === 'hudu') {
          documents.push(assetDocument(source, client));
        }
      }
    }
    return { documents, sources };
  }

  /** Writes what's new or changed. Returns how many documents changed. */
  private async save(
    workspaceId: string,
    built: BuiltDocument[],
    sources: Map<string, Source>,
  ): Promise<number> {
    const stored = new Map(
      (await this.db.memory.documents(workspaceId)).map((doc) => [doc.id, doc]),
    );
    const changed = built.filter(
      (doc) =>
        stored.get(doc.id)?.contentHash !== doc.contentHash ||
        stored.get(doc.id)?.clientId !== doc.clientId,
    );
    if (changed.length === 0) return 0;

    const states = new Map<string, Map<string, string>>();
    for (const state of await this.db.memory.chunkStates(
      workspaceId,
      changed.map((doc) => doc.id),
    )) {
      const keys = states.get(state.documentId) ?? new Map<string, string>();
      keys.set(state.key, state.contentHash);
      states.set(state.documentId, keys);
    }

    let batch: MemoryDocumentInput[] = [];
    let size = 0;
    const flush = async () => {
      if (batch.length === 0) return;
      await this.db.memory.save(workspaceId, batch);
      batch = [];
      size = 0;
    };
    for (const doc of changed) {
      const { sourceIds, appendOnly, ...document } = doc;
      const before = states.get(doc.id) ?? new Map<string, string>();
      const keys = new Set(doc.chunks.map((c) => c.key));
      const input: MemoryDocumentInput = {
        ...document,
        chunks: doc.chunks.filter(
          (c) =>
            before.get(c.key) !== c.contentHash ||
            stored.get(doc.id)?.clientId !== doc.clientId,
        ),
        removedKeys: appendOnly
          ? []
          : [...before.keys()].filter((key) => !keys.has(key)),
        sources: sourceIds.flatMap((id) => sources.get(id) ?? []),
      };
      const bytes = JSON.stringify(input).length;
      if (size + bytes > SAVE_BYTES) await flush();
      batch.push(input);
      size += bytes;
    }
    await flush();
    return changed.length;
  }

  /** Embeds passages that aren't yet, newest first, up to `budget`. */
  private async embed(workspaceId: string, budget: number): Promise<number> {
    const embedder = this.embedder;
    if (!embedder) return 0;
    const startedAt = new Date().toISOString();
    let embedded = 0;
    let tokens = 0;
    let error: string | null = null;
    try {
      while (embedded < budget) {
        const want = Math.min(EMBED_BATCH, budget - embedded);
        const pending = await this.db.memory.pending(workspaceId, want);
        if (pending.length === 0) break;
        const reply = await embedder.embed(
          pending.map(embeddingText),
          'document',
        );
        tokens += reply.tokens;
        const stored = await this.db.memory.setEmbeddings(
          workspaceId,
          embedder.model,
          pending.map((chunk, i) => ({
            documentId: chunk.documentId,
            key: chunk.key,
            contentHash: chunk.contentHash,
            embedding: reply.vectors[i]!,
          })),
        );
        embedded += stored;
        // Changed under us, or the last few: either way, done for now.
        if (stored === 0 || pending.length < want) break;
      }
    } catch (failure) {
      error =
        failure instanceof EmbedderFailure
          ? failure.message
          : 'Embedding failed.';
      this.logger.warn(
        `Embedding for ${workspaceId} failed: ${(failure as Error).message}`,
      );
    }
    if (tokens > 0 || error) {
      await this.db.intelligence
        .saveRun(workspaceId, {
          id: `run-${randomUUID()}`,
          clientId: null,
          kind: 'embeddings',
          inputHash: null,
          model: embedder.model,
          usage: { ...NO_USAGE, inputTokens: tokens },
          cost: costOfEmbedding(tokens, embedder.model),
          status: error ? 'failed' : 'ok',
          error,
          startedAt,
          finishedAt: new Date().toISOString(),
        })
        .catch((saving: Error) =>
          this.logger.warn(`Logging embeddings failed: ${saving.message}`),
        );
    }
    return embedded;
  }
}
