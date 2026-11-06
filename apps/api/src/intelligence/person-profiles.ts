import {
  toneTrendSchema,
  type CitedText,
  type Client,
  type IntelligencePreferences,
  type PersonProfile,
  type Source,
  type Ticket,
  type TicketInsight,
} from '@dossierhq/contracts';
import type { DatabaseAdapter, PersonInsightState } from '@dossierhq/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  findEndUsers,
  personKey,
  type FoundEndUser,
} from '../clients/end-users.js';
import { DATABASE } from '../database/database.module.js';
import { oneLine, stableHash } from '../integrations/ids.js';
import {
  IntelligenceFailure,
  IntelligenceService,
} from './intelligence.service.js';
import { clean, day, HandleBook, keptSources } from './pack.js';
import { PERSON_SYSTEM } from './prompts.js';
import {
  briefLines,
  executiveBrief,
  executiveOutputSchema,
  leaksInternal,
  lineOrNull,
  withoutHandles,
} from './styles.js';

/** What profiles are asked for. Changing it reads everyone once more. */
const PROFILE_VERSION = 'people-1';
/** People profiled in one pass; the rest come with later ones. */
const PEOPLE_PER_PASS = 20;
/** Fewer records than this say too little about someone to profile them. */
const MIN_RECORDS = 2;
const RETRY_AFTER_MS = 60 * 60 * 1000;
const MAX_TICKETS = 40;
const MAX_SAID = 15;

const citedSchema = z.object({
  text: z.string(),
  sources: z
    .array(z.string())
    .describe('Handles of the records it rests on, such as "S3".'),
});

const profileSchema = z.object({
  summary: z
    .string()
    .describe(
      'Who they are to the MSP and how IT is going for them, in two sentences.',
    ),
  recurring: z
    .array(citedSchema)
    .describe('Trouble that keeps coming back for them.'),
  devices: z.array(citedSchema).describe('How the devices they use are doing.'),
  tone: z.object({
    trend: toneTrendSchema,
    note: z
      .string()
      .nullable()
      .describe('One line on how they have sounded lately, or null.'),
  }),
  openLoops: z
    .array(citedSchema)
    .describe('What is owed to them, or by them, still open.'),
  executive: executiveOutputSchema.describe(
    'How IT is affecting their work and what is being done, for the client’s leadership.',
  ),
});
type ProfileReply = z.infer<typeof profileSchema>;

const TASK = [
  'Task: write a profile of this person for the MSP’s team, from their records above.',
  '',
  'Give:',
  '- summary: who they are to the MSP and how IT is going for them, in two sentences.',
  '- recurring: trouble that keeps coming back for them, each with the handles it rests on. Only what happened more than once.',
  '- devices: how the devices they use are doing, each with its handles.',
  '- tone: how they have sounded lately in their tickets and meetings (improving, steady, worsening, or unknown), with one line on it or null. This is for the MSP’s team only.',
  '- openLoops: what is still owed to them, or by them, each with its handles.',
  '- executive: the executive version: how IT is affecting their work and what is being done about it, for the client’s owner or practice manager. Never how they feel or behave, nothing from internal notes, and no blame.',
].join('\n');

type Candidate = {
  client: Client;
  person: FoundEndUser;
  context: string;
  hash: string;
  book: HandleBook;
  internalTexts: string[];
};

/**
 * Profiles each person at a client from what Dossier knows of them: the
 * tickets they raised and what was read off them, the devices they sign in
 * to, and what they said in meetings. On the reading model, again when what
 * it reads changes.
 */
@Injectable()
export class PersonProfiler {
  private readonly logger = new Logger(PersonProfiler.name);

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly intelligence: IntelligenceService,
  ) {}

  /** Profiles who needs it. Returns how many were profiled. */
  async profile(
    workspaceId: string,
    { budget = PEOPLE_PER_PASS } = {},
  ): Promise<number> {
    const preferences = await this.intelligence.preferences(workspaceId);
    if (!preferences.outputs.peopleProfiles) return 0;
    if (await this.intelligence.off(workspaceId, 'reading')) return 0;
    const candidates = await this.candidates(workspaceId, preferences);
    let profiled = 0;
    for (const candidate of candidates.slice(0, budget)) {
      try {
        await this.read(workspaceId, candidate);
        profiled += 1;
      } catch (error) {
        this.logger.warn(
          `Profiling ${candidate.person.user.id} failed: ${(error as Error).message}`,
        );
        if (error instanceof IntelligenceFailure && error.rateLimited) break;
      }
    }
    return profiled;
  }

  /** People whose records changed since they were profiled, latest contact first. */
  private async candidates(
    workspaceId: string,
    preferences: IntelligencePreferences,
  ): Promise<Candidate[]> {
    const shared = preferences.records;
    const [clients, members, tickets, meetings, devices, reads, states] =
      await Promise.all([
        this.db.clients.list(workspaceId),
        this.db.users.members(workspaceId),
        this.db.tickets.list(workspaceId),
        this.db.meetings.list(workspaceId),
        this.db.devices.list(workspaceId),
        this.db.ticketInsights.list(workspaceId),
        this.db.personInsights.states(workspaceId),
      ]);
    const readOf = new Map(reads.map((r) => [r.ticketId, r]));
    const stateOf = new Map(
      states.map((s) => [`${s.clientId}\u0000${s.personKey}`, s]),
    );
    const now = Date.now();
    const out: (Candidate & { lastContactAt: string })[] = [];

    for (const client of clients) {
      const notes = await this.db.notes.list(workspaceId, client.id);
      const found = findEndUsers({
        client,
        devices: devices.filter((d) => d.clientId === client.id),
        tickets: tickets.filter((t) => t.clientId === client.id),
        meetings: meetings.filter((m) => m.clientId === client.id),
        notes,
        staffEmails: members.map((m) => m.email),
      });
      const people = found.filter(
        (f) =>
          (shared.tickets ? f.tickets.length + f.involved.length : 0) +
            (shared.devices ? f.devices.length : 0) +
            (shared.meetings ? f.meetings.length : 0) >=
          MIN_RECORDS,
      );
      if (people.length === 0) continue;
      const live = await this.db.sources.listForClient(workspaceId, client.id);
      for (const person of people) {
        const built = await this.context(
          workspaceId,
          client,
          person,
          live,
          readOf,
          preferences,
        );
        const hash = stableHash(PROFILE_VERSION, built.context);
        const state = stateOf.get(`${client.id}\u0000${person.user.id}`);
        if (state && fresh(state, hash, now)) continue;
        out.push({
          client,
          person,
          ...built,
          hash,
          lastContactAt: person.user.lastContactAt ?? '',
        });
      }
    }
    return out.sort((a, b) => b.lastContactAt.localeCompare(a.lastContactAt));
  }

  /** Their records as the reading model sees them, with handles to cite. */
  private async context(
    workspaceId: string,
    client: Client,
    person: FoundEndUser,
    live: Source[],
    readOf: Map<string, TicketInsight>,
    preferences: IntelligencePreferences,
  ): Promise<{ context: string; book: HandleBook; internalTexts: string[] }> {
    const shared = preferences.records;
    const book = new HandleBook();
    const internalTexts: string[] = [];
    const newest = (list: Ticket[], max: number) =>
      shared.tickets
        ? [...list]
            .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
            .slice(0, max)
        : [];
    const tickets = newest(person.tickets, MAX_TICKETS);
    // Others' tickets they were part of: fewer, and only what they're about.
    const involved = newest(person.involved, Math.ceil(MAX_TICKETS / 2));
    // What they said: transcript stretches tagged with them, newest first.
    const said = shared.meetings
      ? (
          await this.db.memory.search(workspaceId, {
            records: ['meetings'],
            kinds: ['transcript'],
            includeInternal: false,
            personKey: person.user.id,
            clientIds: [client.id],
            text: person.user.name,
            embedding: null,
            limit: MAX_SAID * 2,
          })
        )
          .filter((hit) => hit.sourceId)
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
          .slice(0, MAX_SAID)
      : [];
    const points = shared.meetings
      ? person.meetings.flatMap((meeting) =>
          (['planning', 'concerns', 'askedFor'] as const).flatMap((group) =>
            meeting[group].map((point) => ({ group, point, meeting })),
          ),
        )
      : [];
    const sources = [
      ...live,
      ...(await keptSources(this.db, workspaceId, live, [
        ...tickets.map((t) => t.sourceId),
        ...involved.map((t) => t.sourceId),
        ...said.map((hit) => hit.sourceId!),
        ...points.flatMap(({ point }) => point.sourceIds),
      ])),
    ];
    const sourceById = new Map(sources.map((s) => [s.id, s]));
    const cite = (...ids: string[]) =>
      book.cite(ids.flatMap((id) => sourceById.get(id) ?? []));
    // Points from them: those resting on moments where they spoke.
    const key = person.user.id;
    const theirs = points.filter(({ point }) =>
      point.sourceIds.some((id) => {
        const source = sourceById.get(id);
        return (
          source?.kind === 'meeting' && personKey(source.speakerName) === key
        );
      }),
    );

    const lines = [
      '<person_records>',
      `# ${clean(person.user.name)} · ${clean(client.name)}${person.user.role ? ` · ${clean(person.user.role)}` : ''}${person.user.primaryContact ? ' · primary contact' : ''}`,
    ];
    if (shared.devices && person.devices.length > 0) {
      lines.push('', '## Devices they use');
      for (const device of person.devices) {
        lines.push(
          `- ${cite(device.sourceId)}${clean(device.name)} (${device.type}, ${clean(device.os)}) · patching ${device.patchStatus} · last seen ${day(device.lastSeenAt)}`,
        );
      }
    }
    if (tickets.length > 0) {
      lines.push('', '## Tickets they raised, newest first');
      for (const ticket of tickets) {
        const read = readOf.get(ticket.id);
        const usable = read && (shared.ticketNotes || !read.withInternal);
        if (usable && read.withInternal) {
          internalTexts.push(
            read.summary,
            ...[...read.tried, read.rootCause, read.resolution]
              .filter((l) => l?.internal)
              .map((l) => l!.text),
          );
        }
        lines.push(
          `- ${cite(ticket.sourceId)}#${clean(ticket.number)} "${clean(ticket.subject, 160)}" · opened ${day(ticket.openedAt)} · ${clean(ticket.status)}` +
            (usable
              ? ` · Dossier's read: ${clean(read.summary, 240)} · ${read.outcome}${read.withInternal ? ' (read with internal notes)' : ''}`
              : ''),
        );
      }
    }
    if (involved.length > 0) {
      lines.push(
        '',
        '## Tickets others raised that they were part of, newest first',
      );
      for (const ticket of involved) {
        lines.push(
          `- ${cite(ticket.sourceId)}#${clean(ticket.number)} "${clean(ticket.subject, 160)}" · opened ${day(ticket.openedAt)} · ${clean(ticket.status)}` +
            (ticket.requester ? ` · raised by ${clean(ticket.requester)}` : ''),
        );
      }
    }
    if (said.length > 0) {
      lines.push('', '## What they said in meetings, newest first');
      for (const hit of said) {
        const words = hit.body
          .split('\n')
          .filter((line) => / \(client\): /.test(line))
          .join(' ');
        lines.push(
          `- ${cite(hit.sourceId!)}${clean(hit.heading, 160)}: ${clean(words, 600)}`,
        );
      }
    }
    if (theirs.length > 0) {
      lines.push('', '## What Dossier noted from them in meetings');
      for (const { group, point } of theirs) {
        lines.push(
          `- ${cite(...point.sourceIds)}${group}: ${clean(point.text, 300)}`,
        );
      }
    }
    lines.push('</person_records>');
    return { context: lines.join('\n'), book, internalTexts };
  }

  private async read(workspaceId: string, candidate: Candidate) {
    const { client, person, context, hash, book, internalTexts } = candidate;
    const attemptedAt = new Date().toISOString();
    const base = {
      clientId: client.id,
      personKey: person.user.id,
      inputHash: hash,
      withInternal: internalTexts.length > 0,
      attemptedAt,
    };
    let reply: ProfileReply;
    try {
      reply = await this.intelligence.run(workspaceId, {
        kind: 'people',
        clientId: client.id,
        inputHash: hash,
        system: PERSON_SYSTEM,
        context,
        task: TASK,
        schema: profileSchema,
        effort: 'low',
        use: 'reading',
      });
    } catch (error) {
      await this.db.personInsights.save(workspaceId, {
        ...base,
        status: 'failed',
        model: null,
        profile: null,
        error: (error as Error).message,
        readAt: null,
      });
      throw error;
    }
    const cited = (
      lines: z.infer<typeof citedSchema>[],
      max: number,
    ): CitedText[] =>
      lines
        .flatMap((line) => {
          const text = lineOrNull(line.text, 300);
          const sourceIds = book.sources(line.sources).map((s) => s.id);
          return text && sourceIds.length > 0 ? [{ text, sourceIds }] : [];
        })
        .slice(0, max);
    let executive = executiveBrief(reply.executive, internalTexts);
    if (executive && leaksInternal(briefLines(executive), internalTexts)) {
      executive = null;
    }
    const profile: PersonProfile = {
      clientId: client.id,
      personKey: person.user.id,
      name: person.user.name,
      summary: oneLine(withoutHandles(reply.summary), 500),
      recurring: cited(reply.recurring, 6),
      devices: cited(reply.devices, 6),
      tone: {
        trend: reply.tone.trend,
        note: lineOrNull(reply.tone.note, 240),
      },
      openLoops: cited(reply.openLoops, 6),
      executive,
      withInternal: base.withInternal,
      readAt: attemptedAt,
      model: await this.intelligence.readingModel(workspaceId),
    };
    await this.db.personInsights.save(workspaceId, {
      ...base,
      status: 'ok',
      model: profile.model,
      profile,
      error: null,
      readAt: attemptedAt,
    });
  }
}

function fresh(state: PersonInsightState, hash: string, now: number) {
  if (state.inputHash !== hash) return false;
  return (
    state.status === 'ok' ||
    now - Date.parse(state.attemptedAt) < RETRY_AFTER_MS
  );
}
