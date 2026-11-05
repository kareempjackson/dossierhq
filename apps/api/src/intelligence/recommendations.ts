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
/** After a failure, unchanged records wait this long before another try. */
const RETRY_AFTER_MS = 60 * 60 * 1000;
/** How many decided recommendations the model is shown, to avoid repeats. */
const DECIDED_SHOWN = 30;
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

function task(
  existing: Recommendation[],
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
  const waiting = existing.filter((rec) => rec.status === 'draft');
  const list = (recs: Recommendation[]) =>
    recs.map((rec) => `- (${rec.status}) ${oneLine(rec.title)}`).join('\n');
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
    { force = false }: { force?: boolean } = {},
  ): Promise<boolean> {
    const { outputs, topics } =
      await this.intelligence.preferences(workspaceId);
    // Turned off, or nothing left to look for: no call, no cost.
    if (!outputs.recommendations || !Object.values(topics).some(Boolean)) {
      return false;
    }
    const pack = await this.packs.forClient(workspaceId, clientId);
    if (!pack) return false;
    const inputHash = stableHash(DRAFT_VERSION, pack.hash);
    if (!force) {
      const last = await this.db.intelligence.lastRun(
        workspaceId,
        'recommendations',
        clientId,
      );
      const age = last ? Date.now() - Date.parse(last.startedAt) : Infinity;
      const wait = last?.status === 'ok' ? REDRAFT_AFTER_MS : RETRY_AFTER_MS;
      if (last?.inputHash === inputHash && age < wait) return false;
    }

    const existing = await this.db.recommendations.list(workspaceId, {
      clientId,
    });
    const now = new Date().toISOString();
    const runId = `run-${randomUUID()}`;
    const answer = await this.intelligence.run(workspaceId, {
      id: runId,
      kind: 'recommendations',
      clientId,
      inputHash,
      system: DOSSIER_SYSTEM,
      context: pack.text,
      task: task(existing, now.slice(0, 10), topics),
      schema: draftsSchema,
      effort: 'medium',
    });

    const decided = new Set(
      existing
        .filter((rec) => rec.status !== 'draft')
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
