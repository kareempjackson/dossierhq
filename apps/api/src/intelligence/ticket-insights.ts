import {
  ticketCategorySchema,
  ticketOutcomeSchema,
  ticketSentimentSchema,
  TICKET_ENTRIES_VERSION,
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
  type BatchRequest,
} from './intelligence.service.js';
import { clean, day } from './pack.js';
import { READING_SYSTEM } from './prompts.js';
import { itemFailed, mayTry } from './retry.js';
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
/**
 * Read keys made from what a ticket says carry this; keys from before, made
 * from its memory document, don't. Those reads are kept, not read again.
 */
const KEY_PREFIX = 'k2:';

/**
 * What a read rests on: the ticket's subject, whether it's open, and what's
 * written on it (when, whether the client saw it, and the words), with the
 * technicians' notes only while they're shared. Nothing Dossier adds goes
 * in: not its read of the ticket, which memory carries, nor who it took each
 * entry to be from. So an unchanged ticket is read once, however often
 * memory is rebuilt, and a status moving between two closed ones, as an
 * automation closing a resolved ticket, isn't a change.
 */
export function readKey(ticket: Ticket, withInternal: boolean): string {
  return (
    KEY_PREFIX +
    stableHash(
      READ_VERSION,
      withInternal ? 'internal' : 'public',
      ticket.open ? 'open' : 'closed',
      ticket.subject,
      ...ticket.entries
        .filter((entry) => withInternal || entry.public)
        .flatMap((entry) => [
          entry.at,
          entry.public ? 'public' : 'internal',
          entry.text,
        ]),
    )
  );
}

/** A ticket only memory has now can't change: it's read once, ever. */
const archivedKey = (ticketId: string, withInternal: boolean) =>
  `${KEY_PREFIX}archived:${ticketId}:${withInternal ? 'internal' : 'public'}`;
/**
 * Tickets read in one pass, at most: those in the client packs first, then
 * the backlog. The rest wait for the next pass, so no pass is unbounded.
 */
const READS_PER_PASS = 150;
/**
 * Backlog tickets sent in one batch, at most, and one batch out at a time:
 * what a batch costs is only known when it comes back, so this bounds it.
 */
const BATCH_READS = 300;
/** A batch never heard of again is given up on after this long. */
const BATCH_LOST_MS = 2 * DAY_MS;
const CONCURRENCY = 3;
/** The reader's name in the record of failed reads. */
const RETRY_KIND = 'tickets';
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
): { text: string; shown: MemoryChunk[] } {
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
  const text = [
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
  // The handles number these, not every entry: a long ticket leaves some out.
  return { text, shown: kept };
}

/** A ticket that needs reading. */
type Candidate = {
  doc: MemoryDocumentState;
  ticketId: string;
  ticket: Ticket | undefined;
  hash: string;
  inWindow: boolean;
  /** It has a good read, which a failed one must not replace. */
  hasRead: boolean;
  /** A read of it has failed before. */
  failedBefore: boolean;
};

/** What a request in a batch was for, kept until its answer is saved. */
type BatchedRead = {
  ticketId: string;
  documentId: string;
  clientId: string;
  hash: string;
  withInternal: boolean;
  /** The memory keys of the entries shown, in handle order (E1, E2…). */
  keys: string[];
  hasRead: boolean;
  failedBefore: boolean;
};

/** What every saved read of a ticket says about the attempt. */
type ReadBase = {
  ticketId: string;
  documentId: string;
  clientId: string;
  inputHash: string;
  withInternal: boolean;
  attemptedAt: string;
};

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
    options: { budget?: number; force?: boolean; clientIds?: string[] } = {},
  ): Promise<number> {
    return (await this.sweep(workspaceId, options)).read;
  }

  /**
   * Reads what needs reading, at every client or only at `clientIds`.
   * `done` is false while tickets are left for another pass: more than the
   * budget, a provider saying slow down, or no key to read with.
   */
  async sweep(
    workspaceId: string,
    {
      budget = READS_PER_PASS,
      force = false,
      clientIds,
    }: { budget?: number; force?: boolean; clientIds?: string[] } = {},
  ): Promise<{ read: number; done: boolean; collected: number }> {
    const preferences = await this.intelligence.preferences(workspaceId);
    if (!this.reads(preferences)) return { read: 0, done: true, collected: 0 };
    if (await this.intelligence.off(workspaceId, 'reading')) {
      return { read: 0, done: false, collected: 0 };
    }
    // Answers to what was sent earlier come first: they're paid for.
    const { read: collected } = await this.collect(workspaceId).catch(
      (error: Error) => {
        this.logger.warn(`Collecting ticket reads failed: ${error.message}`);
        return { read: 0 };
      },
    );
    if (clientIds?.length === 0) return { read: 0, done: true, collected };
    const withInternal = preferences.records.ticketNotes;
    const looked = clientIds && new Set(clientIds);
    /** Every client's, or one list for each client looked at. */
    const ofClients = async <T>(
      list: (filter?: { clientId: string }) => Promise<T[]>,
    ): Promise<T[]> =>
      clientIds
        ? (
            await Promise.all(clientIds.map((clientId) => list({ clientId })))
          ).flat()
        : list();

    const [everyDoc, states, retries, tickets, clients, devices, out] =
      await Promise.all([
        this.db.memory.documents(workspaceId, { kinds: ['ticket'] }),
        this.db.ticketInsights.states(workspaceId),
        this.db.aiRetries.list(workspaceId, RETRY_KIND),
        ofClients((filter) => this.db.tickets.list(workspaceId, filter)),
        this.db.clients.list(workspaceId),
        ofClients((filter) => this.db.devices.list(workspaceId, filter)),
        this.batchesOut(workspaceId),
      ]);
    // Out in a batch already: its answer is on the way.
    const waiting = new Set(
      out.flatMap((batch) =>
        Object.values(batch.items).map((item) => item.ticketId),
      ),
    );
    // A ticket of a client not looked at isn't gone, just not loaded.
    const docs = (
      looked ? everyDoc.filter((doc) => looked.has(doc.clientId)) : everyDoc
    ).filter((doc) => !waiting.has(doc.id.slice('ticket:'.length)));
    const stateOf = new Map(states.map((s) => [s.ticketId, s]));
    const retryOf = new Map(retries.map((r) => [r.itemId, r]));
    const live = new Map(tickets.map((t) => [t.id, t]));
    const clientOf = new Map(clients.map((c) => [c.id, c]));
    const now = Date.now();

    // Reads keyed the old way are kept as they are, under the new key: the
    // ticket may not have changed, and reading it again costs a model run.
    const adopt: { ticketId: string; hash: string }[] = [];
    const candidates: Candidate[] = docs.flatMap((doc) => {
      const ticketId = doc.id.slice('ticket:'.length);
      const ticket = live.get(ticketId);
      // Its entries are still to be read the current way: wait for the sync
      // that does, rather than read it now and again after.
      if (ticket && ticket.entriesVersion < TICKET_ENTRIES_VERSION) return [];
      const hash = ticket
        ? readKey(ticket, withInternal)
        : archivedKey(ticketId, withInternal);
      const state = stateOf.get(ticketId);
      if (
        !force &&
        state?.status === 'ok' &&
        !state.inputHash.startsWith(KEY_PREFIX)
      ) {
        adopt.push({ ticketId, hash });
        return [];
      }
      if (!force && state && fresh(state, hash, now)) return [];
      // It failed on this very input: wait longer each time, then give up
      // until the ticket changes.
      const retry = retryOf.get(ticketId);
      if (!force && !mayTry(retry, hash, now)) return [];
      const inWindow = Boolean(
        ticket &&
        (ticket.open || now - Date.parse(ticket.updatedAt) <= PACK_WINDOW_MS),
      );
      return [
        {
          doc,
          ticketId,
          ticket,
          hash,
          inWindow,
          hasRead: state?.status === 'ok',
          failedBefore: retry !== undefined,
        },
      ];
    });
    if (adopt.length > 0) {
      await this.adopt(workspaceId, adopt, stateOf, withInternal);
    }
    const newest = (a: Candidate, b: Candidate) =>
      (b.ticket?.updatedAt ?? '').localeCompare(a.ticket?.updatedAt ?? '') ||
      a.ticketId.localeCompare(b.ticketId);
    const recent = candidates.filter((c) => c.inWindow).sort(newest);
    const backlog = candidates.filter((c) => !c.inWindow).sort(newest);
    let read = 0;
    let stopped = false;
    // The backlog can wait, so it goes out as a batch at half the price,
    // one batch at a time. Without batches (Dossier's key, another
    // provider) or when asked by hand, it's read now, after the recent ones.
    const batching =
      !force &&
      backlog.length > 0 &&
      (await this.intelligence.batches(workspaceId));
    // Tickets dealt with by a batch: sent, or with nothing on them to send.
    let sent = 0;
    if (batching && out.length === 0) {
      const going = backlog.slice(0, BATCH_READS);
      try {
        await this.send(workspaceId, going, clientOf, devices, withInternal);
        sent = going.length;
      } catch (error) {
        if (error instanceof IntelligenceFailure && error.rateLimited) {
          stopped = true;
        }
        this.logger.warn(
          `Sending the ticket backlog failed: ${(error as Error).message}`,
        );
      }
    }
    const queue = (batching ? recent : [...recent, ...backlog]).slice(
      0,
      budget,
    );
    const left = batching
      ? recent.length - queue.length + backlog.length - sent
      : candidates.length - queue.length;

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
    return { read, done: !stopped && left <= 0, collected };
  }

  /** The workspace's ticket batches still out. */
  private async batchesOut(workspaceId: string) {
    return (await this.db.aiBatches.list(workspaceId))
      .filter((batch) => batch.kind === RETRY_KIND)
      .map((batch) => ({
        ...batch,
        items: batch.items as Record<string, BatchedRead>,
      }));
  }

  /** Sends these tickets as one batch. Returns how many went. */
  private async send(
    workspaceId: string,
    candidates: Candidate[],
    clientOf: ReadonlyMap<string, Client>,
    devices: Device[],
    withInternal: boolean,
  ): Promise<number> {
    const items: Record<string, BatchedRead> = {};
    const requests: BatchRequest<Read>[] = [];
    for (const candidate of candidates) {
      const client = clientOf.get(candidate.doc.clientId);
      if (!client) continue;
      const prepared = await this.prepare(
        workspaceId,
        candidate,
        client,
        devices.filter((d) => d.clientId === client.id),
        withInternal,
      );
      if (!prepared) continue;
      const id = `t${requests.length}`;
      items[id] = {
        ticketId: candidate.ticketId,
        documentId: candidate.doc.id,
        clientId: candidate.doc.clientId,
        hash: candidate.hash,
        withInternal,
        keys: prepared.shown.map((entry) => entry.key),
        hasRead: candidate.hasRead,
        failedBefore: candidate.failedBefore,
      };
      requests.push({
        id,
        clientId: candidate.doc.clientId,
        inputHash: candidate.hash,
        system: READING_SYSTEM,
        context: prepared.context,
        task: TASK,
        schema: readSchema,
        effort: 'low' as const,
      });
    }
    if (requests.length === 0) return 0;
    const batch = await this.intelligence.submitBatch(
      workspaceId,
      'tickets',
      requests,
    );
    await this.db.aiBatches.save(workspaceId, {
      id: batch.id,
      kind: RETRY_KIND,
      model: batch.model,
      submittedAt: new Date().toISOString(),
      items,
    });
    return requests.length;
  }

  /**
   * Saves the answers of batches that have ended, and notes their clients
   * as changed so the rest of the pass sees what was read. Returns how many
   * tickets were read.
   */
  async collect(
    workspaceId: string,
  ): Promise<{ read: number; clientIds: string[] }> {
    let read = 0;
    const clientIds = new Set<string>();
    for (const batch of await this.batchesOut(workspaceId)) {
      const outcomes = await this.intelligence.collectBatch(
        workspaceId,
        'tickets',
        batch,
        readSchema,
        (id) => {
          const item = batch.items[id];
          return item
            ? { clientId: item.clientId, inputHash: item.hash }
            : null;
        },
      );
      if (outcomes === 'running') {
        // Never heard of again: let its tickets be read another way.
        if (Date.now() - Date.parse(batch.submittedAt) > BATCH_LOST_MS) {
          await this.db.aiBatches.remove(workspaceId, batch.id);
        }
        continue;
      }
      if (outcomes !== 'gone') {
        const devicesOf = new Map<string, Device[]>();
        for (const outcome of outcomes) {
          const item = batch.items[outcome.id];
          if (!item) continue;
          const base = {
            ticketId: item.ticketId,
            documentId: item.documentId,
            clientId: item.clientId,
            inputHash: item.hash,
            withInternal: item.withInternal,
            attemptedAt: new Date().toISOString(),
          };
          if ('failure' in outcome) {
            await this.failed(
              workspaceId,
              base,
              outcome.failure.message,
              item.hasRead,
            );
            continue;
          }
          // The entries the model saw, by key. One gone since means the
          // ticket changed: it's a candidate again, and this read is stale.
          const byKey = new Map(
            (await this.db.memory.chunks(workspaceId, item.documentId)).map(
              (chunk) => [chunk.key, chunk],
            ),
          );
          const shown = item.keys.flatMap((key) => byKey.get(key) ?? []);
          if (shown.length !== item.keys.length) continue;
          if (!devicesOf.has(item.clientId)) {
            devicesOf.set(
              item.clientId,
              await this.db.devices.list(workspaceId, {
                clientId: item.clientId,
              }),
            );
          }
          await this.keep(
            workspaceId,
            base,
            outcome.reply.data,
            shown,
            devicesOf.get(item.clientId)!,
            outcome.reply.model,
            item.failedBefore,
          );
          read += 1;
          clientIds.add(item.clientId);
        }
      }
      await this.db.aiBatches.remove(workspaceId, batch.id);
    }
    if (clientIds.size > 0) {
      await this.db.changes.touch(
        workspaceId,
        [...clientIds],
        new Date().toISOString(),
      );
    }
    return { read, clientIds: [...clientIds] };
  }

  /**
   * Files reads made under the old keys under their new ones, without a
   * model run. A read that rests on internal notes no longer shared isn't
   * kept: it's read again from what the client saw.
   */
  private async adopt(
    workspaceId: string,
    keys: { ticketId: string; hash: string }[],
    states: ReadonlyMap<string, TicketInsightState>,
    withInternal: boolean,
  ): Promise<void> {
    const hashOf = new Map(keys.map((k) => [k.ticketId, k.hash]));
    const reads = await this.db.ticketInsights.list(workspaceId, {
      ticketIds: [...hashOf.keys()],
    });
    for (const insight of reads) {
      if (insight.withInternal && !withInternal) continue;
      const documentId = `ticket:${insight.ticketId}`;
      await this.db.ticketInsights.save(workspaceId, {
        ticketId: insight.ticketId,
        documentId,
        clientId: insight.clientId,
        inputHash: hashOf.get(insight.ticketId)!,
        status: 'ok',
        model: insight.model,
        withInternal: insight.withInternal,
        insight,
        error: null,
        attemptedAt:
          states.get(insight.ticketId)?.attemptedAt ?? insight.readAt,
        readAt: insight.readAt,
      });
    }
  }

  /** What the model reads of a ticket; null when nothing is written on it. */
  private async prepare(
    workspaceId: string,
    candidate: Pick<Candidate, 'doc' | 'ticketId' | 'ticket'>,
    client: Client,
    devices: Device[],
    withInternal: boolean,
  ): Promise<{ context: string; shown: MemoryChunk[] } | null> {
    const chunks = await this.db.memory.chunks(workspaceId, candidate.doc.id);
    const entries = chunks
      .filter((c) => c.key.startsWith('e:') && (withInternal || !c.internal))
      .sort(
        (a, b) =>
          a.occurredAt.localeCompare(b.occurredAt) ||
          a.key.localeCompare(b.key),
      );
    if (entries.length === 0) return null;
    const facts = candidate.ticket
      ? fromTicket(candidate.ticket)
      : factsFromMemory(candidate.ticketId, chunks);
    const { text, shown } = contextOf(facts, client, entries, devices);
    return { context: text, shown };
  }

  /**
   * Notes a read that failed on the ticket itself. The last good read stays
   * as it is; only a ticket with none is marked as one Dossier couldn't read.
   */
  private async failed(
    workspaceId: string,
    base: ReadBase,
    message: string,
    hasRead: boolean,
  ): Promise<void> {
    await this.db.aiRetries
      .fail(workspaceId, RETRY_KIND, {
        itemId: base.ticketId,
        inputHash: base.inputHash,
        attemptedAt: base.attemptedAt,
        error: message,
      })
      .catch(() => {});
    if (!hasRead) {
      await this.db.ticketInsights.save(workspaceId, {
        ...base,
        status: 'failed',
        model: null,
        insight: null,
        error: message,
        readAt: null,
      });
    }
  }

  private async readOne(
    workspaceId: string,
    candidate: Candidate,
    client: Client,
    devices: Device[],
    withInternal: boolean,
  ): Promise<boolean> {
    const { doc, ticketId, hash } = candidate;
    const prepared = await this.prepare(
      workspaceId,
      candidate,
      client,
      devices,
      withInternal,
    );
    if (!prepared) return false;

    const base: ReadBase = {
      ticketId,
      documentId: doc.id,
      clientId: doc.clientId,
      inputHash: hash,
      withInternal,
      attemptedAt: new Date().toISOString(),
    };
    let reply: Read;
    try {
      reply = await this.intelligence.run(workspaceId, {
        kind: 'tickets',
        clientId: doc.clientId,
        inputHash: hash,
        system: READING_SYSTEM,
        context: prepared.context,
        task: TASK,
        schema: readSchema,
        effort: 'low',
        use: 'reading',
      });
    } catch (error) {
      // Held, or told to slow down: nothing wrong with this ticket.
      if (!itemFailed(error)) throw error;
      await this.failed(
        workspaceId,
        base,
        (error as Error).message,
        candidate.hasRead,
      );
      throw error;
    }
    await this.keep(
      workspaceId,
      base,
      reply,
      prepared.shown,
      devices,
      await this.intelligence.readingModel(workspaceId),
      candidate.failedBefore,
    );
    return true;
  }

  /** Saves what the model read, checked against the entries it was shown. */
  private async keep(
    workspaceId: string,
    base: ReadBase,
    reply: Read,
    entries: MemoryChunk[],
    devices: Device[],
    model: string,
    failedBefore: boolean,
  ): Promise<void> {
    const { ticketId, clientId, withInternal, attemptedAt } = base;
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
      clientId,
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
      model,
    };
    await this.db.ticketInsights.save(workspaceId, {
      ...base,
      status: 'ok',
      model: insight.model,
      insight,
      error: null,
      readAt: attemptedAt,
    });
    if (failedBefore) {
      await this.db.aiRetries
        .clear(workspaceId, RETRY_KIND, [ticketId])
        .catch(() => {});
    }
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
