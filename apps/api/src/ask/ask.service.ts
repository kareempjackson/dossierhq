import {
  hasRole,
  MEMORY_KINDS,
  type AskAnswer,
  type AskLine,
  type AskSummary,
  type Source,
} from '@dossierhq/contracts';
import type { AskChanges, DatabaseAdapter } from '@dossierhq/database';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuditLog } from '../audit/audit-log.js';
import { RateLimits } from '../auth/rate-limits.js';
import { roleIn } from '../auth/roles.js';
import { notFound } from '../common/not-found.js';
import { DATABASE } from '../database/database.module.js';
import { oneLine } from '../integrations/ids.js';
import {
  IntelligenceFailure,
  IntelligenceService,
  turnedOff,
} from '../intelligence/intelligence.service.js';
import type { ModelTool } from '../intelligence/model.js';
import { ContextPacks, HandleBook } from '../intelligence/pack.js';
import { ASK_SYSTEM } from '../intelligence/prompts.js';
import { RecordSearch, SEARCH_KINDS } from '../intelligence/search.js';
import { leaksInternal } from '../intelligence/styles.js';
import { MemorySearch } from '../memory/search.js';
import { WorkspaceIndex } from '../intelligence/workspace-index.js';

/** The most clients one question reads in full. */
const MAX_CLIENTS = 6;
/** The most searches one question makes. */
const MAX_SEARCHES = 4;
/** The most searches of what's written that one question makes. */
const MAX_MEMORY_SEARCHES = 4;
/** The most turns Claude takes; on the last it has to answer. */
const MAX_TURNS = 8;
/** Questions a workspace has answering at once. */
const MAX_ANSWERING = 2;
/** An answer still being written after this long never will be: the API restarted. */
const GIVE_UP_MS = 5 * 60_000;

const paragraphSchema = z.object({
  text: z.string().describe('One short paragraph of the answer.'),
  sources: z
    .array(z.string())
    .describe('Handles of the records it rests on, such as "S3".'),
});

const answerSchema = z.object({
  answered: z
    .boolean()
    .describe('False when the records don’t show the answer.'),
  paragraphs: z
    .array(paragraphSchema)
    .describe('The technical version of the answer.'),
  executive: z
    .array(paragraphSchema)
    .describe('The same answer in plain words for leadership.'),
});

const clientInput = z.object({
  client_id: z
    .string()
    .describe('The client’s ID, exactly as the directory lists it.'),
});

const searchInput = z.object({
  query: z
    .string()
    .describe(
      'A few words to look for, such as "backup failed", "Windows 10" or "renewal".',
    ),
  kinds: z
    .array(z.enum(SEARCH_KINDS))
    .describe(
      'Which records to search: attention (alerts, expiries and overdue promises), promises, meetings (what clients said), recommendations, tickets and devices. An empty list searches them all.',
    ),
});

/**
 * Whether an executive answer is fit for a client's leadership. About one
 * client, it may be sent to that client, so it mustn't repeat the MSP's
 * internal notes Claude read there. Across several clients it's for the
 * MSP's own leadership, and nobody sends it to a client.
 */
export function clientMayRead(
  executive: string[],
  clientsRead: string[],
  internalOf: Map<string, string[]>,
): boolean {
  const [only, ...others] = clientsRead;
  if (!only || others.length > 0) return true;
  return !leaksInternal(executive, internalOf.get(only) ?? []);
}

const memoryInput = z.object({
  query: z
    .string()
    .describe(
      'What to look for, in plain words: "printer jams on the first floor", "who asked about the VPN", "how did we fix the X-ray licence error".',
    ),
  client_id: z
    .string()
    .nullable()
    .describe('A client’s ID from the directory, or null for every client.'),
  person: z
    .string()
    .nullable()
    .describe(
      'A person at a client, by name as the records write it, or null for anyone.',
    ),
  kinds: z
    .array(z.enum(MEMORY_KINDS))
    .describe(
      'What to search: ticket (every reply and note on tickets), summary (meeting summaries), transcript (what was said in meetings), note (the team’s meeting notes), alert (device alerts, including cleared ones) and asset (documentation). An empty list searches them all.',
    ),
  since: z
    .string()
    .nullable()
    .describe(
      'Only what was written on or after this day, YYYY-MM-DD; or null.',
    ),
});

const task = (asked: AskAnswer, today: string) =>
  [
    `Today is ${today}.`,
    '',
    `${asked.askedBy.name} asks: ${asked.question}`,
    '',
    'Look up what you need, then answer. Give:',
    '- answered: true when the records answer the question, false when they don’t.',
    '- paragraphs: the technical version of the answer, each paragraph with the handles of the records it rests on in sources.',
    '- executive: the executive version of the same answer, in one to three short paragraphs, each with its sources. When the answer is about one client, it is for that client’s leadership and nothing in it comes from internal notes; when it covers several clients, it is for the MSP’s own leadership.',
  ].join('\n');

/**
 * Questions typed into the Ask box, answered across the whole workspace.
 * Claude reads a directory of clients, looks up what it needs with tools,
 * and answers citing records. Answering takes a while, so it happens in the
 * background; the page asks again until the answer is written.
 */
@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly audit: AuditLog,
    private readonly limits: RateLimits,
    private readonly intelligence: IntelligenceService,
    private readonly packs: ContextPacks,
    private readonly index: WorkspaceIndex,
    private readonly memory: MemorySearch,
  ) {}

  /** Starts answering, and returns the question as asked. */
  async ask(
    workspaceId: string,
    userId: string,
    question: string,
  ): Promise<AskAnswer> {
    const off = await this.intelligence.off(workspaceId);
    if (off) throw new ServiceUnavailableException(off);
    if (!(await this.intelligence.isOn(workspaceId, 'ask'))) {
      throw new ConflictException(turnedOff('ask'));
    }
    if (await this.limits.blocked(['ask', userId])) {
      throw new HttpException(
        'You’ve asked a lot of questions in the last hour. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const recent = await this.db.ask.list(workspaceId, { limit: 20 });
    if (recent.filter((a) => this.stillAnswering(a)).length >= MAX_ANSWERING) {
      throw new HttpException(
        `Dossier is already answering ${MAX_ANSWERING} questions here. Try again when one is done.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.limits.hit(['ask', userId]);

    const user = await this.db.users.get(userId);
    const asked: AskAnswer = {
      id: `ask-${randomUUID()}`,
      question,
      status: 'answering',
      answered: null,
      askedBy: { userId, name: user?.name ?? 'Someone' },
      clients: [],
      askedAt: new Date().toISOString(),
      finishedAt: null,
      lines: [],
      executiveLines: [],
      sources: [],
      model: null,
      cost: null,
      error: null,
    };
    await this.db.ask.create(workspaceId, asked);
    void this.answer(workspaceId, asked);
    return asked;
  }

  /** Newest first; with `mine`, only the person's own. */
  async list(
    workspaceId: string,
    userId: string,
    { mine, limit }: { mine: boolean; limit: number },
  ): Promise<AskSummary[]> {
    const asked = await this.db.ask.list(workspaceId, {
      askedBy: mine ? userId : undefined,
      limit,
    });
    return Promise.all(asked.map((a) => this.givenUp(workspaceId, a)));
  }

  async get(workspaceId: string, id: string): Promise<AskAnswer> {
    const answer =
      (await this.db.ask.get(workspaceId, id)) ?? notFound('Answer', id);
    return this.givenUp(workspaceId, answer);
  }

  /** The person who asked, or an admin, can delete a question. */
  async remove(workspaceId: string, userId: string, id: string) {
    const answer =
      (await this.db.ask.get(workspaceId, id)) ?? notFound('Answer', id);
    if (
      answer.askedBy.userId !== userId &&
      !hasRole(await roleIn(this.db, userId, workspaceId), 'admin')
    ) {
      throw new ForbiddenException(
        'Only the person who asked, or an admin, can delete this.',
      );
    }
    await this.db.ask.remove(workspaceId, id);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      what: `Deleted the question “${oneLine(answer.question, 80)}” and its answer`,
    });
  }

  /** Writes the answer, or why there isn't one. Never throws. */
  private async answer(workspaceId: string, asked: AskAnswer) {
    const book = new HandleBook();
    const read = new Map<string, string>();
    // Internal notes Claude read, by client, to keep them out of what a
    // client's leadership may be sent.
    const internalOf = new Map<string, string[]>();
    const clientsRead = () => [...read].map(([id, name]) => ({ id, name }));
    let finished: AskChanges;
    try {
      const shared = await this.packs.shared(workspaceId);
      const preferences = await this.intelligence.preferences(workspaceId);
      let recalled = 0;
      const [directory, search] = await Promise.all([
        this.index.directory(workspaceId, shared),
        RecordSearch.load(this.db, workspaceId, shared),
      ]);
      let searches = 0;
      const tools: ModelTool[] = [
        {
          name: 'client_records',
          description:
            'Reads one client’s records in full: its profile and contract, what needs attention, what the MSP promised, recorded meetings and the team’s notes, tickets, devices, documentation and files. Each fact carries handles to cite. Takes a client ID from the directory.',
          input: clientInput,
          run: async (input) => {
            const { client_id: id } = clientInput.parse(input);
            const name = directory.names.get(id);
            if (!name) {
              return `There is no client with the ID "${id}". Use an ID from the directory.`;
            }
            if (read.has(id))
              return `You already read ${name}’s records above.`;
            if (read.size >= MAX_CLIENTS) {
              return `You’ve read as many clients as one question may (${MAX_CLIENTS}). Answer with what you have.`;
            }
            const pack = await this.packs.forClient(workspaceId, id, book);
            if (!pack) return `${name} is no longer a client.`;
            read.set(id, name);
            internalOf.set(id, pack.internalTexts);
            // So the page can say whose records Dossier is reading.
            await this.db.ask.update(workspaceId, asked.id, {
              clients: clientsRead(),
            });
            return pack.text;
          },
        },
        {
          name: 'search_records',
          description:
            'Searches every client’s records at once for a few words, and returns the best matching lines, each naming its client and carrying handles to cite. Use it for questions across clients.',
          input: searchInput,
          run: async (input) => {
            const { query, kinds } = searchInput.parse(input);
            if (searches >= MAX_SEARCHES) {
              return `You’ve searched as many times as one question may (${MAX_SEARCHES}). Answer with what you have.`;
            }
            searches += 1;
            return search.find(query, kinds, book);
          },
        },
        {
          name: 'search_memory',
          description:
            'Searches what people wrote across every client’s records, by meaning as well as by words: every reply and internal note on tickets (closed ones too, long after they leave the tools), meeting summaries and transcripts, the team’s notes, device alerts and documentation. Returns the passages themselves, each with a handle to cite. Use it for what happened before and how it was fixed, what someone said or asked for, and anything about a person.',
          input: memoryInput,
          run: async (input) => {
            const asked = memoryInput.parse(input);
            if (recalled >= MAX_MEMORY_SEARCHES) {
              return `You’ve searched what’s written as many times as one question may (${MAX_MEMORY_SEARCHES}). Answer with what you have.`;
            }
            recalled += 1;
            return this.memory.find(
              workspaceId,
              {
                query: asked.query,
                clientId: asked.client_id,
                person: asked.person,
                kinds: asked.kinds,
                since: asked.since,
              },
              preferences,
              book,
            );
          },
        },
      ];

      const reply = await this.intelligence.answer(workspaceId, {
        kind: 'ask',
        clientId: null,
        system: ASK_SYSTEM,
        context: directory.text,
        task: task(asked, new Date().toISOString().slice(0, 10)),
        schema: answerSchema,
        effort: 'medium',
        tools,
        maxTurns: MAX_TURNS,
      });

      const answered =
        reply.data.answered &&
        reply.data.paragraphs.some(
          (p) => p.text.trim() && book.sources(p.sources).length > 0,
        );
      /**
       * An answer stands only on what it cites. Without one, its first
       * paragraph may say, uncited, what the records don't show.
       */
      const settle = (
        paragraphs: z.infer<typeof paragraphSchema>[],
        fallback: string | null,
      ): { text: string; sources: Source[] }[] => {
        const cited = paragraphs.map((p) => ({
          text: oneLine(p.text, 1_500),
          sources: book.sources(p.sources),
        }));
        const backed = cited.filter((p) => p.text && p.sources.length > 0);
        if (answered) return backed;
        const first = cited.find((p) => p.text);
        if (!first && fallback === null) return [];
        return [
          first ?? { text: fallback!, sources: [] },
          ...backed.filter((p) => p !== first),
        ];
      };
      const lines = settle(
        reply.data.paragraphs,
        'The records Dossier holds don’t show this.',
      );
      let executive = settle(reply.data.executive ?? [], null);
      const sources = [
        ...new Map(
          [...lines, ...executive]
            .flatMap((l) => l.sources)
            .map((s) => [s.id, s] as const),
        ).values(),
      ];
      // Clients the answer cites but never read in full, found by search.
      for (const source of sources) {
        const name = source.clientId && directory.names.get(source.clientId);
        if (name && !read.has(source.clientId!))
          read.set(source.clientId!, name);
      }
      if (
        !clientMayRead(
          executive.map((l) => l.text),
          [...read.keys()],
          internalOf,
        )
      ) {
        executive = [];
      }
      const asLines = (settled: typeof lines) =>
        settled.map((l): AskLine => ({
          text: l.text,
          sourceIds: l.sources.map((s) => s.id),
        }));
      finished = {
        status: 'answered',
        answered,
        clients: clientsRead(),
        lines: asLines(lines),
        executiveLines: asLines(executive),
        sources,
        model: reply.model,
        cost: reply.cost,
        error: null,
      };
    } catch (error) {
      if (!(error instanceof IntelligenceFailure)) {
        this.logger.error(
          `Answering ${asked.id} failed`,
          (error as Error)?.stack,
        );
      }
      finished = {
        status: 'failed',
        clients: clientsRead(),
        error:
          error instanceof IntelligenceFailure
            ? error.message
            : 'Something went wrong while answering. Try asking again.',
      };
    }
    await this.db.ask
      .update(workspaceId, asked.id, {
        ...finished,
        finishedAt: new Date().toISOString(),
      })
      .catch((error: Error) =>
        this.logger.warn(
          `Saving the answer to ${asked.id} failed: ${error.message}`,
        ),
      );
  }

  private stillAnswering(answer: AskSummary): boolean {
    return (
      answer.status === 'answering' &&
      Date.now() - Date.parse(answer.askedAt) < GIVE_UP_MS
    );
  }

  /** An answer stuck answering past GIVE_UP_MS, marked failed. */
  private async givenUp<T extends AskSummary>(
    workspaceId: string,
    answer: T,
  ): Promise<T> {
    if (answer.status !== 'answering' || this.stillAnswering(answer)) {
      return answer;
    }
    const changes = {
      status: 'failed' as const,
      error: 'Dossier stopped before it finished answering. Try asking again.',
      finishedAt: new Date().toISOString(),
    };
    await this.db.ask.update(workspaceId, answer.id, changes);
    return { ...answer, ...changes };
  }
}
