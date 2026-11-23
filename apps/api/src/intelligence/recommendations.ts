import {
  INTELLIGENCE_TOPICS,
  type IntelligencePreferences,
  type Recommendation,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DATABASE } from '../database/database.module.js';
import { DAY_MS, oneLine, stableHash } from '../integrations/ids.js';
import { IntelligenceService } from './intelligence.service.js';
import { ContextPacks } from './pack.js';
import { DOSSIER_SYSTEM } from './prompts.js';
import { executiveBrief, executiveOutputSchema, lineOrNull } from './styles.js';

/** Most drafts a client gets at once. */
const MAX_DRAFTS = 5;
/** Most suggested actions one recommendation keeps. */
const MAX_ACTIONS = 5;
/** Unchanged records are drafted from again after this long. */
const REDRAFT_AFTER_MS = DAY_MS;
/** After a failure, a client waits this long before another try. */
const RETRY_AFTER_MS = 60 * 60 * 1000;
/**
 * A client is drafted for at most this often, however much its records
 * change: a busy client's tickets change with every sync.
 */
export const MIN_REDRAFT_MS = 6 * 60 * 60 * 1000;
/** How many decided recommendations the model is shown, to avoid repeats. */
const DECIDED_SHOWN = 30;
/** The team's latest votes, each way, that a run sees as examples. */
const VOTES_SHOWN = 15;
/**
 * What drafts are asked for. Changing it drafts every client again once,
 * whatever their records, as when executive versions were added.
 */
const DRAFT_VERSION = 'styles-1';

/** Titles compared loosely: case and punctuation aside. */
const wordsOf = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const draftsSchema = z.object({
  recommendations: z.array(
    z.object({
      title: z
        .string()
        .describe(
          'The action, in one line, starting with a verb and naming what it is about.',
        ),
      reason: z
        .string()
        .describe('Why, in one line, with the facts and dates behind it.'),
      suggestedActions: z
        .array(z.string())
        .describe(
          'Steps a technician takes to do it, in order, each one line starting with a verb.',
        ),
      risk: z
        .string()
        .nullable()
        .describe(
          'What could go wrong doing it and how to back out, in one line; null (not the word "None") when nothing could.',
        ),
      verification: z
        .string()
        .nullable()
        .describe('How to confirm it worked, in one line.'),
      executive: executiveOutputSchema.describe(
        'The same recommendation for the client’s leadership.',
      ),
      sources: z
        .array(z.string())
        .describe('Handles of the records it rests on, such as "S3".'),
    }),
  ),
});

/**
 * A draft the team has had its say on: in the weekly report, or voted
 * useful or not. Runs keep it as it is.
 */
const kept = (rec: Recommendation) =>
  rec.status === 'draft' && (rec.inReport || rec.useful !== null);

const say = (rec: Recommendation) =>
  [
    rec.inReport && 'in the weekly report',
    rec.useful === true && 'useful',
    rec.useful === false && 'not useful',
  ]
    .filter(Boolean)
    .join(', ');

function task(
  existing: Recommendation[],
  /** The team's votes at the workspace's other clients, newest first. */
  elsewhere: Recommendation[],
  today: string,
  topics: IntelligencePreferences['topics'],
): string {
  const wanted = INTELLIGENCE_TOPICS.filter((topic) => topics[topic.id]);
  const unwanted = INTELLIGENCE_TOPICS.filter((topic) => !topics[topic.id]);
  const about = (list: typeof INTELLIGENCE_TOPICS) =>
    list.map((topic) => `- ${topic.name}: ${topic.description}`).join('\n');
  const decided = existing
    .filter((rec) => rec.status !== 'draft')
    .slice(0, DECIDED_SHOWN);
  const stays = existing.filter(kept);
  const waiting = existing.filter(
    (rec) => rec.status === 'draft' && !kept(rec),
  );
  const list = (recs: Recommendation[]) =>
    recs.map((rec) => `- (${rec.status}) ${oneLine(rec.title)}`).join('\n');
  const examples = (useful: boolean) =>
    elsewhere
      .filter((rec) => rec.useful === useful)
      .slice(0, VOTES_SHOWN)
      .map((rec) => `- ${oneLine(rec.title)}: ${oneLine(rec.reason, 160)}`)
      .join('\n');
  const liked = examples(true);
  const disliked = examples(false);
  return [
    `Today is ${today}.`,
    '',
    `Task: as the senior technician on this account, suggest what the MSP should do next for this client: at most ${MAX_DRAFTS} actions, most important first. Only suggest an action when the records give a clear reason for it: something urgent, failing, overdue, at risk, about to expire, happening again and again, or promised to the client. Fewer is better than padding. Return an empty list if nothing needs doing.`,
    '',
    'For each one give:',
    '- title: the action, in one line, starting with a verb and naming the device, person or thing (for example "Replace the failing disk in HD-FS01").',
    '- reason: why, in one line, with the facts and dates that make it worth doing now.',
    `- suggestedActions: up to ${MAX_ACTIONS} steps, in order, that you would hand a technician to get it done: what to check first, what to change, who to tell or get sign-off from, and how to confirm it worked. One line each, starting with a verb. Name devices, products and people only as the records name them. The steps rest on the recommendation’s sources and don’t cite their own.`,
    '- risk: what could go wrong doing it and how to back out, in one line; null (not the word "None") when nothing could.',
    '- verification: how the technician confirms it worked, in one line.',
    '- executive: the executive version of the same recommendation, for the client’s owner, CEO or practice manager: a headline, two to four points (what it means for the business, what we recommend, how disruptive it is) and the decision needed from them, or null (not the word "None") when nothing is needed. Everything in it rests on the same records, and nothing in it comes from internal notes.',
    '- sources: the handles of every record it rests on.',
    '',
    'title, reason, suggestedActions, risk and verification make up the technical version.',
    ...(decided.length > 0
      ? [
          '',
          'The team has already accepted or dismissed these. Don’t suggest them again, or the same thing in other words:',
          list(decided),
        ]
      : []),
    ...(stays.length > 0
      ? [
          '',
          'The team has had its say on these drafts, and they stay as they are. Don’t suggest them again, or the same thing in other words. Suggest more of the kind marked useful, when the records give a reason, and less of the kind marked not useful:',
          stays
            .map((rec) => `- (${say(rec)}) ${oneLine(rec.title)}`)
            .join('\n'),
        ]
      : []),
    ...(liked || disliked
      ? [
          '',
          'At the MSP’s other clients, the team said which suggestions helped. They show the kind of suggestion the team wants, nothing more: never take a name, device, date or fact from them, and only suggest something here when this client’s records give the reason.',
          ...(liked ? ['Useful:', liked] : []),
          ...(disliked
            ? [
                'Not useful, so suggest this kind only when it is urgent:',
                disliked,
              ]
            : []),
        ]
      : []),
    ...(waiting.length > 0
      ? [
          '',
          'These drafts are waiting for the team. Your list replaces them, so include any that still apply, in the same words:',
          list(waiting),
        ]
      : []),
    ...(unwanted.length > 0
      ? [
          '',
          'The team only wants suggestions about:',
          about(wanted),
          'Don’t suggest anything that is mainly about:',
          about(unwanted),
        ]
      : []),
  ].join('\n');
}

/** Drafts a client's recommendations from its records. */
@Injectable()
export class RecommendationDrafter {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly intelligence: IntelligenceService,
    private readonly packs: ContextPacks,
  ) {}

  /**
   * Drafts afresh unless the client's records are the same as at the last
   * run, and that run was recent. Returns whether the model was asked.
   */
  async draft(
    workspaceId: string,
    clientId: string,
    {
      force = false,
      onWait,
    }: {
      force?: boolean;
      /** Called when it's too soon after the last draft to draft again. */
      onWait?: () => void;
    } = {},
  ): Promise<boolean> {
    const { outputs, topics } =
      await this.intelligence.preferences(workspaceId);
    // Turned off, or nothing left to look for: no call, no cost.
    if (!outputs.recommendations || !Object.values(topics).some(Boolean)) {
      return false;
    }
    // The clock first: it's one small read, and the records are many.
    const last = force
      ? null
      : await this.db.intelligence.lastRun(
          workspaceId,
          'recommendations',
          clientId,
        );
    const age = last ? Date.now() - Date.parse(last.startedAt) : Infinity;
    const ok = last?.status === 'ok';
    // Changed records or not, never sooner than this.
    if (last && age < (ok ? MIN_REDRAFT_MS : RETRY_AFTER_MS)) {
      onWait?.();
      return false;
    }
    const pack = await this.packs.forClient(workspaceId, clientId);
    if (!pack) return false;
    const inputHash = stableHash(DRAFT_VERSION, pack.hash);
    if (ok && last?.inputHash === inputHash && age < REDRAFT_AFTER_MS) {
      return false;
    }

    // Every client's, for the votes elsewhere; newest first.
    const everyone = await this.db.recommendations.list(workspaceId);
    const existing = everyone.filter((rec) => rec.clientId === clientId);
    const elsewhere = everyone.filter(
      (rec) => rec.clientId !== clientId && rec.useful !== null,
    );
    const now = new Date().toISOString();
    const runId = `run-${randomUUID()}`;
    const answer = await this.intelligence.run(workspaceId, {
      id: runId,
      kind: 'recommendations',
      clientId,
      inputHash,
      system: DOSSIER_SYSTEM,
      context: pack.text,
      task: task(existing, elsewhere, now.slice(0, 10), topics),
      schema: draftsSchema,
      effort: 'medium',
    });

    // What the team decided or had its say on isn't drafted again.
    const decided = new Set(
      existing
        .filter((rec) => rec.status !== 'draft' || kept(rec))
        .map((rec) => wordsOf(rec.title)),
    );
    const drafts: Recommendation[] = answer.recommendations
      .slice(0, MAX_DRAFTS)
      .flatMap((suggestion, index) => {
        const title = oneLine(suggestion.title, 160);
        const sourceIds = pack.sourceIds(suggestion.sources);
        // Uncited, empty, or something the team already decided on.
        if (!title || sourceIds.length === 0) return [];
        if (decided.has(wordsOf(title))) return [];
        return [
          {
            id: `rec-${stableHash(runId, index)}`,
            clientId,
            status: 'draft',
            title,
            reason: oneLine(suggestion.reason, 300),
            suggestedActions: suggestion.suggestedActions
              .map((step) => oneLine(step, 200))
              .filter(Boolean)
              .slice(0, MAX_ACTIONS),
            risk: lineOrNull(suggestion.risk, 300),
            verification: lineOrNull(suggestion.verification, 300),
            executive: executiveBrief(suggestion.executive, pack.internalTexts),
            executiveStale: false,
            inReport: false,
            useful: null,
            createdAt: now,
            decidedAt: null,
            sourceIds,
          },
        ];
      });
    await this.db.recommendations.replaceDrafts(
      workspaceId,
      clientId,
      runId,
      drafts,
    );
    return true;
  }
}
