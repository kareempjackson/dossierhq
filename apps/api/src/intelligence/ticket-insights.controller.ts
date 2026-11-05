import type {
  IntelligencePreferences,
  SimilarTicket,
  TicketInsightView,
} from '@dossierhq/contracts';
import type {
  DatabaseAdapter,
  MemoryFilter,
  MemoryHit,
} from '@dossierhq/database';
import { Controller, Get, Inject, Param } from '@nestjs/common';
import { WorkspaceId } from '../common/workspace.js';
import { DATABASE } from '../database/database.module.js';
import { IntelligenceService } from './intelligence.service.js';
import { TicketReader } from './ticket-insights.js';

/** Similar tickets shown at most. */
const SIMILAR = 6;

/** Words that say what a ticket is about, roughly stemmed. */
const COMMON = new Set(
  'about after again also before being both cannot could does from have into just more need needs only other over same since some still that their them then there these they this very want were what when which will with would your'.split(
    ' ',
  ),
);
const significant = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 3 && !COMMON.has(word))
      .map((word) => word.replace(/(?:ing|ed|es|s)$/, '')),
  );

/** What Dossier read off a ticket, and tickets like it. */
@Controller('tickets')
export class TicketInsightsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly intelligence: IntelligenceService,
    private readonly reader: TicketReader,
  ) {}

  /** `GET /tickets/:id/insight`. Empty while tickets aren't shared. */
  @Get(':id/insight')
  async insight(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<TicketInsightView> {
    const preferences = await this.intelligence.preferences(workspaceId);
    if (!preferences.records.tickets) {
      return { insight: null, similar: [], reading: false };
    }
    const [read, similar, off] = await Promise.all([
      preferences.outputs.ticketInsights
        ? this.db.ticketInsights.list(workspaceId, { ticketIds: [id] })
        : Promise.resolve([]),
      this.similar(workspaceId, id, preferences),
      this.intelligence.off(workspaceId, 'reading'),
    ]);
    return {
      insight: read[0] ?? null,
      similar,
      reading: this.reader.reads(preferences) && off === null,
    };
  }

  /**
   * Tickets like this one, here and at other clients, nearest first: by
   * meaning once embedded, else by the words of its subject.
   */
  private async similar(
    workspaceId: string,
    ticketId: string,
    preferences: IntelligencePreferences,
  ): Promise<SimilarTicket[]> {
    const documentId = `ticket:${ticketId}`;
    const filter: MemoryFilter = {
      records: ['tickets'],
      kinds: ['ticket'],
      includeInternal: preferences.records.ticketNotes,
    };
    let hits = await this.db.memory.similar(
      workspaceId,
      documentId,
      ['summary', 'card'],
      filter,
      SIMILAR,
    );
    let byMeaning = true;
    if (hits.length === 0) {
      const chunks = await this.db.memory.chunks(workspaceId, documentId);
      const card = chunks.find((c) => c.key === 'card');
      if (!card) return [];
      byMeaning = false;
      // By words, without embeddings: the subject and what was read off it.
      const read = chunks.find((c) => c.key === 'summary');
      const text = [card.body.split('\n')[0], read?.body.split('\n')[0]]
        .filter(Boolean)
        .join(' ');
      const wanted = significant(text);
      const seen = new Set<string>();
      hits = (
        await this.db.memory.search(workspaceId, {
          ...filter,
          text,
          embedding: null,
          excludeDocumentIds: [documentId],
          limit: SIMILAR * 5,
        })
      ).filter((hit) => {
        if (seen.has(hit.documentId)) return false;
        // One shared word ("new", "PC") isn't likeness; two might be.
        const shared = significant(`${hit.title} ${hit.body}`);
        if ([...wanted].filter((w) => shared.has(w)).length < 2) return false;
        seen.add(hit.documentId);
        return true;
      });
      hits = hits.slice(0, SIMILAR);
    }
    if (hits.length === 0) return [];

    const ids = hits.map((hit) => hit.documentId.slice('ticket:'.length));
    const [tickets, clients, reads] = await Promise.all([
      this.db.tickets.list(workspaceId),
      this.db.clients.list(workspaceId),
      this.db.ticketInsights.list(workspaceId, { ticketIds: ids }),
    ]);
    const live = new Map(tickets.map((t) => [t.id, t]));
    const clientName = new Map(clients.map((c) => [c.id, c.name]));
    const readOf = new Map(reads.map((r) => [r.ticketId, r]));
    return hits.map((hit: MemoryHit, i): SimilarTicket => {
      const id = ids[i]!;
      const ticket = live.get(id);
      const title = /^#(\S+)\s+(.*)$/.exec(hit.title);
      const read = readOf.get(id);
      return {
        ticketId: id,
        clientId: hit.clientId,
        clientName: clientName.get(hit.clientId) ?? 'A former client',
        number: ticket?.number ?? title?.[1] ?? '',
        subject: ticket?.subject ?? title?.[2] ?? hit.title,
        openedAt: ticket?.openedAt ?? hit.occurredAt,
        outcome: read?.outcome ?? null,
        resolution:
          read?.resolution &&
          (preferences.records.ticketNotes || !read.resolution.internal)
            ? read.resolution.text
            : null,
        sourceId: ticket?.sourceId ?? hit.sourceId,
        live: Boolean(ticket),
        similarity: byMeaning ? Math.max(0, Math.min(1, hit.score)) : null,
      };
    });
  }
}
