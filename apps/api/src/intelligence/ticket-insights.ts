import {
  ticketCategorySchema,
  ticketOutcomeSchema,
  ticketSentimentSchema,
  type Client,
  type Device,
  type InsightLine,
  type IntelligencePreferences,
  type Ticket,
  type TicketInsight,
} from '@dossierhq/contracts';
import type {
  DatabaseAdapter,
  MemoryChunk,
  MemoryDocumentState,
  TicketInsightState,
} from '@dossierhq/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { DATABASE } from '../database/database.module.js';
import { DAY_MS, oneLine, stableHash } from '../integrations/ids.js';
import {
  IntelligenceFailure,
  IntelligenceService,
} from './intelligence.service.js';
import { clean, day } from './pack.js';
import { READING_SYSTEM } from './prompts.js';
import {
  briefLines,
  executiveBrief,
  executiveOutputSchema,
  leaksInternal,
  lineOrNull,
  withoutHandles,
} from './styles.js';

/** What reads are asked for. Changing it reads every ticket once more. */
const READ_VERSION = 'tickets-1';
/** Tickets read from the backlog in one pass; those in packs aren't capped. */
const READS_PER_PASS = 100;
const CONCURRENCY = 3;
/** After a failure, an unchanged ticket waits this long before another try. */
const RETRY_AFTER_MS = 60 * 60 * 1000;
/** Tickets open, or closed this recently, are in the client's pack. */
const PACK_WINDOW_MS = 30 * DAY_MS;
/** What a model reads of one ticket, at most. */
const CONTEXT_CHARS = 24_000;
/** How much of one entry it reads, at most. */
const ENTRY_CHARS = 4_000;

const lineSchema = z.object({
  text: z.string(),
  entries: z
    .array(z.string())
    .describe('Handles of the entries it rests on, such as "E2".'),
});

const readSchema = z.object({
  summary: z
    .string()
    .describe('What happened and where it stands, in one or two sentences.'),
  issue: z
    .string()
    .describe(
      'The problem in a few words, named as it would be at any client, e.g. "Outlook search returns no results".',
    ),
  category: ticketCategorySchema,
  symptoms: z.array(z.string()).describe('What the client saw, one per line.'),
  tried: z.array(lineSchema).describe('What was tried, in order.'),
  rootCause: lineSchema
    .nullable()
    .describe('The cause, only where the entries state it; else null.'),
  resolution: lineSchema
    .nullable()
    .describe('What fixed it, or the workaround in place; else null.'),
  outcome: ticketOutcomeSchema,
  sentiment: ticketSentimentSchema.describe(
    'How the client sounds in what they wrote.',
  ),
  people: z.array(
    z.object({ name: z.string(), role: z.enum(['client', 'msp']) }),
  ),
  devices: z
    .array(z.string())
    .describe(
      'Devices it concerns, named exactly as the device list writes them.',
    ),
  followUps: z
    .array(lineSchema.extend({ owner: z.enum(['msp', 'client']) }))
    .describe('What is still owed, and by whom.'),
  executive: executiveOutputSchema.describe(
    'Where this stands, for the client’s leadership.',
  ),
  executiveEntries: z
    .array(z.string())
    .describe('Handles of the public entries the executive version rests on.'),
});
type Read = z.infer<typeof readSchema>;

const TASK = [
  'Task: read the ticket and write down what it says.',
  '',
  'Give:',
  '- summary: what happened and where it stands now, in one or two sentences.',
  '- issue: the problem in a few words, named so the same problem reads the same at any client.',
  '- category: what it is about, broadly.',
  '- symptoms: what the client saw.',
  '- tried: what was tried, in order, each with the entries it rests on.',
  '- rootCause: the cause, only if the entries state it; else null.',
  '- resolution: what fixed it, or the workaround in place, with its entries; else null.',
  '- outcome: resolved, workaround, unresolved, or open while it is still being worked on.',
  '- sentiment: how the client sounds in what they wrote: positive, calm, frustrated, angry, or unknown.',
  '- people: everyone named, as client or msp.',
  '- devices: the client’s devices it concerns, exactly as the device list names them.',
  '- followUps: anything still owed, by the msp or the client, with its entries.',
  '- executive: the executive version: where this stands for the client’s owner or practice manager, in plain words: what happened, what it meant for them, where it stands and what happens next. Only from public entries; never mention internal notes or what they say.',
  '- executiveEntries: the handles of the public entries the executive version rests on.',
].join('\n');

/** The ticket and its entries, as the reading model sees them. */
function contextOf(
  ticket: {
    number: string;
    subject: string;
    status: string;
    requester: string | null;
    assignedTo: string | null;
    openedAt: string;
    updatedAt: string;
  },
  client: Client,
  entries: MemoryChunk[],
  devices: Device[],
): string {
  const head =
    `[S1] Ticket #${clean(ticket.number)} "${clean(ticket.subject, 200)}" · ${clean(client.name)} · ${clean(ticket.status)}` +
    (ticket.requester ? ` · raised by ${clean(ticket.requester)}` : '') +
    (ticket.assignedTo ? ` · with ${clean(ticket.assignedTo)}` : '') +
    ` · opened ${day(ticket.openedAt)}, updated ${day(ticket.updatedAt)}`;
  // Too long to read whole: the first two entries and as many of the
  // latest as fit, so both how it began and where it stands are read.
  const shown = (e: MemoryChunk) =>
    `${day(e.occurredAt)}${typeof e.meta.author === 'string' ? ` ${clean(e.meta.author)}` : ''} (${e.internal ? 'internal' : 'public'}):\n${clean(e.body, ENTRY_CHARS)}`;
  let kept = entries;
  const size = (list: MemoryChunk[]) =>
    list.reduce((sum, e) => sum + shown(e).length + 8, head.length);
  if (size(kept) > CONTEXT_CHARS) {
    const start = entries.slice(0, 2);
    const latest: MemoryChunk[] = [];
    for (const entry of entries.slice(2).reverse()) {
      if (size([...start, entry, ...latest]) > CONTEXT_CHARS) break;
      latest.unshift(entry);
    }
    kept = [...start, ...latest];
  }
  return [
    '<ticket_record>',
    head,
    ...kept.map((e, i) => `[E${i + 1}] ${shown(e)}`),
    kept.length < entries.length
      ? `(${entries.length - kept.length} entries in the middle left out)`
      : '',
    devices.length > 0
      ? `Devices at this client: ${devices.map((d) => `${clean(d.name)} (${d.type})`).join(', ')}`
      : '',
    '</ticket_record>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Ticket fields the reader needs, from the live ticket or its memory. */
type TicketFacts = {
  ticketId: string;
  number: string;
  subject: string;
  status: string;
  open: boolean;
  requester: string | null;
  assignedTo: string | null;
  openedAt: string;
  updatedAt: string;
};

const fromTicket = (t: Ticket): TicketFacts => ({
  ticketId: t.id,
  number: t.number,
  subject: t.subject,
  status: t.status,
  open: t.open,
  requester: t.requester,
  assignedTo: t.assignedTo,
  openedAt: t.openedAt,
  updatedAt: t.updatedAt,
});

/**
 * Reads each ticket's whole conversation once, on the workspace's reading
 * model, and again when it changes: what went wrong, what was tried, what
 * fixed it, what's owed. Tickets in the client packs first, then the
 * backlog, newest first. Internal notes only while they're shared.
 */
@Injectable()
export class TicketReader {
  private readonly logger = new Logger(TicketReader.name);

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly intelligence: IntelligenceService,
  ) {}

  /** Whether the workspace has tickets read. */
  reads(preferences: IntelligencePreferences): boolean {
    return preferences.outputs.ticketInsights && preferences.records.tickets;
  }

  /** Reads what needs reading. Returns how many tickets were read. */
  async read(
    workspaceId: string,
    { budget = READS_PER_PASS, force = false } = {},
  ): Promise<number> {
    const preferences = await this.intelligence.preferences(workspaceId);
    if (!this.reads(preferences)) return 0;
    if (await this.intelligence.off(workspaceId, 'reading')) return 0;
    const withInternal = preferences.records.ticketNotes;

    const [docs, states, tickets, clients, devices] = await Promise.all([
      this.db.memory.documents(workspaceId, { kinds: ['ticket'] }),
      this.db.ticketInsights.states(workspaceId),
      this.db.tickets.list(workspaceId),
      this.db.clients.list(workspaceId),
      this.db.devices.list(workspaceId),
    ]);
    const stateOf = new Map(states.map((s) => [s.ticketId, s]));
    const live = new Map(tickets.map((t) => [t.id, t]));
    const clientOf = new Map(clients.map((c) => [c.id, c]));
    const now = Date.now();

    type Candidate = {
      doc: MemoryDocumentState;
      ticketId: string;
      ticket: Ticket | undefined;
      hash: string;
      inWindow: boolean;
    };
    const candidates: Candidate[] = docs.flatMap((doc) => {
      const ticketId = doc.id.slice('ticket:'.length);
      const ticket = live.get(ticketId);
      const hash = stableHash(
        READ_VERSION,
        doc.contentHash,
        withInternal ? 'internal' : 'public',
        ticket ? `${ticket.open}:${ticket.status}` : 'archived',
      );
      const state = stateOf.get(ticketId);
      if (!force && state && fresh(state, hash, now)) return [];
      const inWindow = Boolean(
        ticket &&
        (ticket.open || now - Date.parse(ticket.updatedAt) <= PACK_WINDOW_MS),
      );
      return [{ doc, ticketId, ticket, hash, inWindow }];
    });
    const newest = (a: Candidate, b: Candidate) =>
      (b.ticket?.updatedAt ?? '').localeCompare(a.ticket?.updatedAt ?? '') ||
      a.ticketId.localeCompare(b.ticketId);
    const queue = [
      ...candidates.filter((c) => c.inWindow).sort(newest),
      ...candidates
        .filter((c) => !c.inWindow)
        .sort(newest)
        .slice(0, budget),
    ];

    let read = 0;
    let stopped = false;
    const worker = async () => {
      for (let next = queue.shift(); next && !stopped; next = queue.shift()) {
        const client = clientOf.get(next.doc.clientId);
        if (!client) continue;
        try {
          const ok = await this.readOne(
            workspaceId,
            next,
            client,
            devices.filter((d) => d.clientId === client.id),
            withInternal,
          );
          if (ok) read += 1;
        } catch (error) {
          if (error instanceof IntelligenceFailure && error.rateLimited) {
            stopped = true;
          }
          this.logger.warn(
            `Reading ticket ${next.ticketId} failed: ${(error as Error).message}`,
          );
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return read;
  }

  private async readOne(
    workspaceId: string,
    candidate: {
      doc: MemoryDocumentState;
      ticketId: string;
      ticket: Ticket | undefined;
      hash: string;
    },
    client: Client,
    devices: Device[],
    withInternal: boolean,
  ): Promise<boolean> {
    const { doc, ticketId, hash } = candidate;
    const chunks = await this.db.memory.chunks(workspaceId, doc.id);
    const entries = chunks
      .filter((c) => c.key.startsWith('e:') && (withInternal || !c.internal))
      .sort(
        (a, b) =>
          a.occurredAt.localeCompare(b.occurredAt) ||
          a.key.localeCompare(b.key),
      );
    const facts = candidate.ticket
      ? fromTicket(candidate.ticket)
      : factsFromMemory(ticketId, chunks);
    if (entries.length === 0) return false;

    const attemptedAt = new Date().toISOString();
    const base = {
      ticketId,
      documentId: doc.id,
      clientId: doc.clientId,
      inputHash: hash,
      withInternal,
      attemptedAt,
    };
    let reply: Read;
    try {
      reply = await this.intelligence.run(workspaceId, {
        kind: 'tickets',
        clientId: doc.clientId,
        inputHash: hash,
        system: READING_SYSTEM,
        context: contextOf(facts, client, entries, devices),
        task: TASK,
        schema: readSchema,
        effort: 'low',
        use: 'reading',
      });
    } catch (error) {
      await this.db.ticketInsights.save(workspaceId, {
        ...base,
        status: 'failed',
        model: null,
        insight: null,
        error: (error as Error).message,
        readAt: null,
      });
      throw error;
    }

    const entryOf = (handle: string) => {
      const n = Number(/^\[?E(\d+)\]?$/i.exec(handle.trim())?.[1]);
      return Number.isInteger(n) ? entries[n - 1] : undefined;
    };
    /** A cited line, or null when it cites nothing that's there. */
    const cited = (
      line: { text: string; entries: string[] } | null,
    ): InsightLine | null => {
      if (!line) return null;
      const text = lineOrNull(line.text, 400);
      const backing = line.entries.flatMap((h) => entryOf(h) ?? []);
      if (!text || backing.length === 0) return null;
      return { text, internal: backing.some((e) => e.internal) };
    };
    const executiveBacking = reply.executiveEntries.map(entryOf);
    const internalTexts = entries.filter((e) => e.internal).map((e) => e.body);
    let executive = executiveBrief(reply.executive, internalTexts);
    // For the client's leadership: only what the client saw stands behind it.
    if (
      executive &&
      (executiveBacking.length === 0 ||
        executiveBacking.some((e) => !e || e.internal) ||
        leaksInternal(briefLines(executive), internalTexts))
    ) {
      executive = null;
    }
    const deviceIds = [
      ...new Set(
        reply.devices.flatMap(
          (name) =>
            devices.find(
              (d) => d.name.toLowerCase() === name.trim().toLowerCase(),
            )?.id ?? [],
        ),
      ),
    ];
    const insight: TicketInsight = {
      ticketId,
      clientId: doc.clientId,
      summary: oneLine(withoutHandles(reply.summary), 500),
      issue: oneLine(withoutHandles(reply.issue), 160),
      category: reply.category,
      symptoms: reply.symptoms
        .flatMap((s) => lineOrNull(s, 300) ?? [])
        .slice(0, 8),
      tried: reply.tried.flatMap((line) => cited(line) ?? []).slice(0, 10),
      rootCause: cited(reply.rootCause),
      resolution: cited(reply.resolution),
      outcome: reply.outcome,
      sentiment: reply.sentiment,
      people: reply.people
        .filter((p) => p.name.trim())
        .map((p) => ({ name: oneLine(p.name, 120), role: p.role }))
        .slice(0, 12),
      deviceIds,
      followUps: reply.followUps
        .flatMap((line) => {
          const kept = cited(line);
          return kept ? [{ ...kept, owner: line.owner }] : [];
        })
        .slice(0, 6),
      executive,
      withInternal,
      readAt: attemptedAt,
      model: await this.intelligence.readingModel(workspaceId),
    };
    await this.db.ticketInsights.save(workspaceId, {
      ...base,
      status: 'ok',
      model: insight.model,
      insight,
      error: null,
      readAt: attemptedAt,
    });
    return true;
  }
}

function fresh(state: TicketInsightState, hash: string, now: number) {
  if (state.inputHash !== hash) return false;
  return (
    state.status === 'ok' ||
    now - Date.parse(state.attemptedAt) < RETRY_AFTER_MS
  );
}

/** A ticket no longer in the sync, as its memory describes it. */
function factsFromMemory(ticketId: string, chunks: MemoryChunk[]): TicketFacts {
  const card = chunks.find((c) => c.key === 'card');
  const subject = card?.body.split('\n')[0] ?? 'Ticket';
  const number = /#(\S+)/.exec(card?.heading ?? '')?.[1] ?? '';
  const at =
    card?.occurredAt ?? chunks[0]?.occurredAt ?? new Date(0).toISOString();
  const last =
    chunks
      .map((c) => c.occurredAt)
      .sort()
      .at(-1) ?? at;
  return {
    ticketId,
    number,
    subject,
    status: 'No longer in the tool',
    open: false,
    requester:
      /raised by ([^·]+)/.exec(card?.heading ?? '')?.[1]?.trim() ?? null,
    assignedTo: null,
    openedAt: at,
    updatedAt: last,
  };
}
