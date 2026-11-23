import {
  BACKGROUND_KINDS,
  costOf,
  DEFAULT_DAILY_BUDGET,
  DEFAULT_MODEL,
  INTELLIGENCE_OUTPUTS,
  intelligenceKindSchema,
  intelligencePreferencesSchema,
  modelIdSchema,
  modelInfo,
  NO_USAGE,
  OUTPUT_OF_KIND,
  PROVIDER_DEFAULT_MODEL,
  providerInfo,
  READING_DEFAULT_MODEL,
  type IntelligenceKind,
  type IntelligenceLimits,
  type IntelligenceOutput,
  type IntelligencePreferences,
  type IntelligenceSettings,
  type IntelligenceSpend,
  type ModelId,
  type ModelUsage,
  type ProviderId,
} from '@dossierhq/contracts';
import type {
  AiGuard,
  DatabaseAdapter,
  IntelligenceRun,
  StoredIntelligenceKey,
} from '@dossierhq/database';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { AppConfig } from '../config/configuration.js';
import { TtlCache } from '../common/ttl-cache.js';
import { DATABASE } from '../database/database.module.js';
import { DAY_MS } from '../integrations/ids.js';
import { Secrets } from '../integrations/secrets.js';
import {
  INTELLIGENCE_MODEL,
  IntelligenceFailure,
  type Effort,
  type BatchOutcome,
  type IntelligenceModel,
  type ModelReply,
  type ModelTool,
} from './model.js';
import { MODEL_CLIENTS, type ModelClients } from './model-clients.js';

export { IntelligenceFailure } from './model.js';

/** How long a workspace's model, keys and preferences are remembered. */
const SETTINGS_TTL_MS = 30_000;

/** One piece of work for the workspace's model. */
export type RunRequest<T> = {
  kind: IntelligenceKind;
  /** Null for work across the workspace. */
  clientId: string | null;
  /** A hash of what the model reads, kept on the run. */
  inputHash?: string | null;
  /** Instructions that never change; cached. */
  system: string;
  /** What the model reads, e.g. a client pack's text. */
  context: string;
  /** Whether another run reads the same `context` within minutes; then it's cached. */
  sharedContext?: boolean;
  /** What to do this time; read after the cache. */
  task: string;
  /** The answer's shape (zod v4), enforced by structured outputs. */
  schema: z.ZodType<T>;
  effort: Effort;
  /** The run's ID, when the caller needs to know it beforehand. */
  id?: string;
  /**
   * Which of the workspace's models: the drafting one, or the cheaper one
   * that reads every ticket and person.
   */
  use?: ModelUse;
};

/** One request of a batch: reading work that can wait. */
export type BatchRequest<T> = Pick<
  RunRequest<T>,
  'system' | 'context' | 'task' | 'schema' | 'effort'
> & {
  /** Letters, digits, `_` and `-`; unique in its batch. */
  id: string;
  clientId: string | null;
  inputHash: string;
};

/** What a batch costs next to asking now: providers halve the price. */
export const BATCH_PRICE = 0.5;

/** Drafting for people to review, or reading records, which runs far more. */
export type ModelUse = 'drafting' | 'reading';

/** A run where the model may look things up with `tools` before it answers. */
export type ToolRunRequest<T> = RunRequest<T> & {
  tools: ModelTool[];
  /** The most turns the model takes; on the last it has to answer. */
  maxTurns: number;
};

/** An answer, with what it cost and the model that gave it. */
export type RunResult<T> = { data: T; model: ModelId; cost: number };

/** "Recommendations are turned off…", "Ask Dossier is turned off…". */
export function turnedOff(output: IntelligenceOutput): string {
  const name = INTELLIGENCE_OUTPUTS.find((o) => o.id === output)!.name;
  return `${name} ${output === 'ask' ? 'is' : 'are'} turned off on the Intelligence page.`;
}

/** How far back the Intelligence page adds up spend. */
const SPEND_DAYS = 30;

/** What a client run takes before there are any to measure. */
const TYPICAL_RUN: ModelUsage = {
  inputTokens: 25_000,
  outputTokens: 3_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** What reading one ticket takes before there are any to measure. */
const TYPICAL_READ: ModelUsage = {
  inputTokens: 5_000,
  outputTokens: 900,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** Why the workspace's model can't run: it has no key for its provider. */
const needsKey = (model: ModelId) => {
  const { provider, name } = modelInfo(model);
  return `Drafting is off. Add your ${providerInfo(provider).name} API key in Settings to draft with ${name}.`;
};

/** Whose key a run is paid on: Dossier's, or the workspace's own. */
type KeyOwner = 'shared' | 'own';

/** The model a workspace drafts with now, or why it can't. */
type Drafter =
  | {
      model: ModelId;
      connect: () => IntelligenceModel;
      off: null;
      owner: KeyOwner;
    }
  | { model: ModelId; connect: null; off: string };

/** Why work is held at a limit: which one, and what to tell people. */
export type Waiting = {
  reason: 'trial' | 'budget' | 'paused';
  message: string;
};

const trialOver = (trial: number) =>
  `You’ve used the ${trial} trial runs on Dossier’s key. Add your own API key in Settings to keep drafting.`;
const trialReserved = (trial: number) =>
  `Dossier has stopped drafting by itself so the rest of your ${trial} trial runs are yours to try. Add your own API key in Settings and it carries on.`;

const dollars = (amount: number) =>
  `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;

/** The UTC day a moment counts toward, as YYYY-MM-DD. */
const dayOf = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Why a run on `owner`'s key can't go ahead, or null. A person's own
 * request is only stopped by the end of the trial; work Dossier does by
 * itself also stops at its share of the trial (half), the day's budget, and
 * a pause. `trial` is how many runs Dossier's key gives a workspace.
 */
export function limitOn(
  owner: KeyOwner,
  guard: AiGuard,
  background: boolean,
  now: Date,
  trial: number,
): Waiting | null {
  if (owner === 'shared' && guard.sharedCalls >= trial) {
    return { reason: 'trial', message: trialOver(trial) };
  }
  if (!background) return null;
  if (owner === 'shared' && guard.sharedCalls >= Math.ceil(trial / 2)) {
    return { reason: 'trial', message: trialReserved(trial) };
  }
  if (guard.pausedUntil && Date.parse(guard.pausedUntil) > now.getTime()) {
    const until = guard.pausedUntil.slice(11, 16);
    return {
      reason: 'paused',
      message:
        `Dossier has paused its own drafting until ${until} UTC, and tries again then. ${guard.pausedReason ?? ''}`.trim(),
    };
  }
  const budget = guard.dailyBudget ?? DEFAULT_DAILY_BUDGET;
  if (owner === 'own' && guard.spentToday >= budget) {
    return {
      reason: 'budget',
      message: `Today’s AI budget of ${dollars(budget)} is spent, so Dossier has stopped drafting by itself until tomorrow (UTC). Questions and reports you ask for still work. Change the budget in Settings.`,
    };
  }
  return null;
}

/** What Settings says about a key; the rest stays in the API. */
const shown = (key: StoredIntelligenceKey) => ({
  provider: key.provider,
  hint: key.hint,
  addedBy: key.addedBy.name,
  addedAt: key.addedAt,
});

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
};

/**
 * Runs work on the model each workspace chose, on the workspace's own key
 * for its provider or else, for Claude, on Dossier's. Keeps a record of
 * every run: what it cost, and a hash of what it read.
 */
@Injectable()
export class IntelligenceService {
  private readonly logger = new Logger(IntelligenceService.name);
  private readonly remembered = new TtlCache<unknown>(SETTINGS_TTL_MS);
  private readonly defaultModel: ModelId;
  /** Runs a workspace gets on Dossier's own key (AI_TRIAL_CALLS). */
  private readonly trial: number;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    /** Claude on Dossier's own key; null without ANTHROPIC_API_KEY. */
    @Inject(INTELLIGENCE_MODEL)
    private readonly llm: IntelligenceModel | null,
    @Inject(MODEL_CLIENTS) private readonly clients: ModelClients,
    private readonly secrets: Secrets,
    config: ConfigService<AppConfig, true>,
  ) {
    this.defaultModel =
      config.get('INTELLIGENCE_MODEL', { infer: true }) ?? DEFAULT_MODEL;
    this.trial = config.get('AI_TRIAL_CALLS', { infer: true });
  }

  /** Why nothing drafts (or reads) for the workspace, or null when it can. */
  async off(
    workspaceId: string,
    use: ModelUse = 'drafting',
  ): Promise<string | null> {
    const drafter = await this.drafter(workspaceId, use);
    if (drafter.off !== null || drafter.owner === 'own') return drafter.off;
    // On Dossier's key: off once the trial is used up.
    const guard = await this.guard(workspaceId);
    return (
      limitOn('shared', guard, false, new Date(), this.trial)?.message ?? null
    );
  }

  /**
   * Why the work Dossier does by itself is held for now, or null when it
   * may run: no key, the trial, the day's budget, or a pause after failures.
   * Passes ask first, so a held workspace costs them nothing.
   */
  async waiting(
    workspaceId: string,
    use: ModelUse = 'reading',
  ): Promise<Waiting | { reason: 'off'; message: string } | null> {
    const drafter = await this.drafter(workspaceId, use);
    if (drafter.off !== null) return { reason: 'off', message: drafter.off };
    return limitOn(
      drafter.owner,
      await this.guard(workspaceId),
      true,
      new Date(),
      this.trial,
    );
  }

  private guard(workspaceId: string, now = new Date()): Promise<AiGuard> {
    return this.db.aiBudget.guard(workspaceId, dayOf(now));
  }

  /** Sets the dollars a day the workspace's own key may spend; null resets. */
  async setDailyBudget(
    workspaceId: string,
    amount: number | null,
  ): Promise<void> {
    await this.db.aiBudget.setDailyBudget(workspaceId, amount);
  }

  /** The workspace's model for this use, and a key to run it on. */
  private async drafter(
    workspaceId: string,
    use: ModelUse = 'drafting',
  ): Promise<Drafter> {
    const model =
      use === 'reading'
        ? await this.readingModel(workspaceId)
        : await this.model(workspaceId);
    return this.connectFor(workspaceId, model);
  }

  /** A key to run `model` on for the workspace, or why there's none. */
  private async connectFor(
    workspaceId: string,
    model: ModelId,
  ): Promise<Drafter> {
    const keys = await this.storedKeys(workspaceId);
    const { provider } = modelInfo(model);
    const own = keys.find((key) => key.provider === provider);
    if (own) {
      const apiKey = this.unseal(own);
      if (apiKey) {
        return {
          model,
          connect: () => this.clients.connect(provider, apiKey),
          off: null,
          owner: 'own',
        };
      }
      return {
        model,
        connect: null,
        off: `Drafting is off. Dossier can’t read your ${providerInfo(provider).name} API key any more; add it again in Settings.`,
      };
    }
    const dossier = this.llm;
    if (provider === 'anthropic' && dossier) {
      return { model, connect: () => dossier, off: null, owner: 'shared' };
    }
    return { model, connect: null, off: needsKey(model) };
  }

  /**
   * A setting read on nearly every model call, remembered for half a minute:
   * a pass that reads 150 tickets asks the database once, not 600 times.
   */
  private settingsOf<T>(
    workspaceId: string,
    name: string,
    load: () => Promise<T>,
  ): Promise<T> {
    return this.remembered.get(`${workspaceId}:${name}`, load) as Promise<T>;
  }

  private storedKeys(workspaceId: string): Promise<StoredIntelligenceKey[]> {
    return this.settingsOf(workspaceId, 'keys', () =>
      this.db.intelligence.keys(workspaceId),
    );
  }

  /** After a write: the next read asks the database again. */
  private forget(workspaceId: string): void {
    for (const name of ['model', 'reading', 'preferences', 'keys']) {
      this.remembered.forget(`${workspaceId}:${name}`);
    }
  }

  /** The key in the clear, or null when it can't be read with this API's secret. */
  private unseal(key: StoredIntelligenceKey): string | null {
    if (!this.secrets.available) return null;
    try {
      const opened = this.secrets.decrypt(key.secret) as { apiKey?: unknown };
      return typeof opened.apiKey === 'string' ? opened.apiKey : null;
    } catch {
      return null;
    }
  }

  /** The workspace's choice, else this Dossier's default. */
  async model(workspaceId: string): Promise<ModelId> {
    const chosen = modelIdSchema.safeParse(
      await this.settingsOf(workspaceId, 'model', () =>
        this.db.intelligence.model(workspaceId),
      ),
    );
    return chosen.success ? chosen.data : this.defaultModel;
  }

  /**
   * The model that reads tickets and people: the workspace's choice while it
   * has a key to run on, else the cheapest of the drafting model's provider,
   * which runs on the same key.
   */
  async readingModel(workspaceId: string): Promise<ModelId> {
    const chosen = modelIdSchema.safeParse(
      await this.settingsOf(workspaceId, 'reading', () =>
        this.db.intelligence.readingModel(workspaceId),
      ),
    );
    if (
      chosen.success &&
      (await this.connectFor(workspaceId, chosen.data)).off === null
    ) {
      return chosen.data;
    }
    const drafting = await this.model(workspaceId);
    return READING_DEFAULT_MODEL[modelInfo(drafting).provider];
  }

  async setReadingModel(
    workspaceId: string,
    model: ModelId | null,
  ): Promise<void> {
    await this.db.intelligence.setReadingModel(workspaceId, model);
    this.forget(workspaceId);
  }

  /**
   * Asks the workspace's model and returns its answer. Logs the run either
   * way. Throws 503 when drafting is off, and IntelligenceFailure when the
   * model refuses, runs out of room or answers in the wrong shape.
   */
  async run<T>(workspaceId: string, request: RunRequest<T>): Promise<T> {
    const result = await this.logged(workspaceId, request, (llm, model) =>
      llm.generate({
        model,
        system: request.system,
        context: request.context,
        sharedContext: request.sharedContext,
        task: request.task,
        schema: request.schema,
        effort: request.effort,
      }),
    );
    return result.data;
  }

  /**
   * Like run, but the model may call `tools` to look things up first, for up
   * to `maxTurns` turns. Returns the answer with what it cost.
   */
  answer<T>(
    workspaceId: string,
    request: ToolRunRequest<T>,
  ): Promise<RunResult<T>> {
    return this.logged(workspaceId, request, (llm, model) => {
      if (!llm.answer) {
        throw new IntelligenceFailure(
          'failed',
          'This model can’t look records up.',
        );
      }
      return llm.answer({
        model,
        system: request.system,
        context: request.context,
        sharedContext: request.sharedContext,
        task: request.task,
        schema: request.schema,
        effort: request.effort,
        tools: request.tools,
        maxTurns: request.maxTurns,
      });
    });
  }

  /**
   * Whether reading that can wait may go out as a batch: the workspace reads
   * on its own key, at a provider that takes batches. On Dossier's key the
   * trial counts runs one at a time, so nothing waits.
   */
  async batches(workspaceId: string): Promise<boolean> {
    const drafter = await this.drafter(workspaceId, 'reading');
    return Boolean(
      drafter.connect &&
      drafter.owner === 'own' &&
      drafter.connect().submitBatch,
    );
  }

  /**
   * Sends reading work as one batch on the workspace's reading model.
   * Returns the provider's id for it and the model. Throws as a held run
   * does when the day's budget is spent or work is paused.
   */
  async submitBatch<T>(
    workspaceId: string,
    kind: IntelligenceKind,
    requests: BatchRequest<T>[],
  ): Promise<{ id: string; model: ModelId }> {
    const drafter = await this.drafter(workspaceId, 'reading');
    const llm =
      drafter.connect && drafter.owner === 'own' ? drafter.connect() : null;
    if (!llm?.submitBatch) {
      throw new IntelligenceFailure('failed', 'Batches aren’t available.');
    }
    const output = OUTPUT_OF_KIND[kind];
    if (!(await this.isOn(workspaceId, output))) {
      throw new IntelligenceFailure('failed', turnedOff(output));
    }
    const now = new Date();
    const held = limitOn(
      'own',
      await this.guard(workspaceId, now),
      true,
      now,
      this.trial,
    );
    if (held) {
      throw new IntelligenceFailure('failed', held.message, NO_USAGE, true);
    }
    const { model } = drafter;
    const id = await llm.submitBatch(
      requests.map((request) => ({
        id: request.id,
        request: {
          model,
          system: request.system,
          context: request.context,
          task: request.task,
          schema: request.schema,
          effort: request.effort,
        },
      })),
    );
    this.logger.log(
      `Sent ${requests.length} ${kind} to ${model} as batch ${id} for ${workspaceId}`,
    );
    return { id, model };
  }

  /**
   * A batch's answers once it has ended, each logged as a run at the batch
   * price; `running` until then, `gone` when the provider or the key that
   * sent it no longer has it. `sent` says what each request was for.
   */
  async collectBatch<T>(
    workspaceId: string,
    kind: IntelligenceKind,
    batch: { id: string; model: string; submittedAt: string },
    schema: z.ZodType<T>,
    sent: (id: string) => { clientId: string | null; inputHash: string } | null,
  ): Promise<BatchOutcome<T>[] | 'running' | 'gone'> {
    const model = modelIdSchema.safeParse(batch.model);
    if (!model.success) return 'gone';
    const drafter = await this.connectFor(workspaceId, model.data);
    const llm =
      drafter.connect && drafter.owner === 'own' ? drafter.connect() : null;
    if (!llm?.collectBatch) return 'gone';
    const outcomes = await llm.collectBatch(batch.id, schema, model.data);
    if (outcomes === 'running' || outcomes === 'gone') return outcomes;
    const finished = new Date();
    for (const outcome of outcomes) {
      const item = sent(outcome.id);
      const usage =
        'reply' in outcome ? outcome.reply.usage : outcome.failure.usage;
      const answeredBy = 'reply' in outcome ? outcome.reply.model : model.data;
      const cost = costOf(usage, answeredBy) * BATCH_PRICE;
      // One the provider never ran cost nothing: it isn't a run to count.
      if (!item || (!('reply' in outcome) && cost === 0)) continue;
      await this.db.aiBudget
        .record(
          workspaceId,
          {
            id: `run-${randomUUID()}`,
            clientId: item.clientId,
            kind,
            inputHash: item.inputHash,
            model: answeredBy,
            usage,
            cost,
            status: 'reply' in outcome ? 'ok' : outcome.failure.kind,
            error: 'reply' in outcome ? null : outcome.failure.message,
            startedAt: batch.submittedAt,
            finishedAt: finished.toISOString(),
          },
          {
            owner: 'own',
            day: dayOf(finished),
            now: finished.toISOString(),
            stop: false,
          },
        )
        .catch(this.warn);
    }
    this.logger.log(
      `Collected batch ${batch.id} for ${workspaceId}: ${outcomes.filter((o) => 'reply' in o).length} of ${outcomes.length} answered`,
    );
    return outcomes;
  }

  /** Runs `ask` on the workspace's model if its output is on, and logs the run. */
  private async logged<T>(
    workspaceId: string,
    request: RunRequest<T>,
    ask: (llm: IntelligenceModel, model: ModelId) => Promise<ModelReply<T>>,
  ): Promise<RunResult<T>> {
    const drafter = await this.drafter(workspaceId, request.use);
    if (!drafter.connect) throw new ServiceUnavailableException(drafter.off);
    // Turned off on the Intelligence page: no call, and so no run to log.
    const output = OUTPUT_OF_KIND[request.kind];
    if (!(await this.isOn(workspaceId, output))) {
      throw new IntelligenceFailure('failed', turnedOff(output));
    }
    const { model, owner } = drafter;
    // The limits, before anything is spent. Held work says so as a provider
    // asking Dossier to slow down does, so a batch stops at the first.
    const begun = new Date();
    const held = limitOn(
      owner,
      await this.guard(workspaceId, begun),
      BACKGROUND_KINDS.has(request.kind),
      begun,
      this.trial,
    );
    if (held) {
      throw new IntelligenceFailure('failed', held.message, NO_USAGE, true);
    }
    const llm = drafter.connect();
    const started = begun.toISOString();
    // Saved and counted in one step: the day's spend, the trial, the pause.
    const save = (
      fields: Pick<IntelligenceRun, 'model' | 'usage' | 'status' | 'error'>,
      hopeless = false,
    ) => {
      const finished = new Date();
      return this.db.aiBudget
        .record(
          workspaceId,
          {
            id: request.id ?? `run-${randomUUID()}`,
            clientId: request.clientId,
            kind: request.kind,
            inputHash: request.inputHash ?? null,
            cost: costOf(fields.usage, fields.model as ModelId),
            startedAt: started,
            finishedAt: finished.toISOString(),
            ...fields,
          },
          {
            owner,
            day: dayOf(finished),
            now: finished.toISOString(),
            stop: hopeless,
          },
        )
        .catch(this.warn);
    };

    try {
      const reply = await ask(llm, model);
      await save({
        model: reply.model,
        usage: reply.usage,
        status: 'ok',
        error: null,
      });
      this.logger.log(
        `${request.kind} for ${request.clientId ?? workspaceId} on ${reply.model}: ` +
          `${reply.usage.inputTokens} in, ${reply.usage.cacheReadTokens} cached, ` +
          `${reply.usage.cacheWriteTokens} cache-written, ${reply.usage.outputTokens} out`,
      );
      return {
        data: reply.data,
        model: reply.model,
        cost: costOf(reply.usage, reply.model),
      };
    } catch (error) {
      const failure =
        error instanceof IntelligenceFailure
          ? error
          : new IntelligenceFailure(
              'failed',
              `Something went wrong while drafting: ${(error as Error)?.message}`,
            );
      if (!(error instanceof IntelligenceFailure)) {
        this.logger.error(
          `${request.kind} for ${request.clientId ?? workspaceId} failed`,
          (error as Error)?.stack,
        );
      }
      await save(
        {
          model,
          usage: failure.usage,
          status: failure.kind,
          error: failure.message,
        },
        failure.hopeless,
      );
      throw failure;
    }
  }

  /** What the Intelligence page shows. */
  async settings(workspaceId: string): Promise<IntelligenceSettings> {
    const [
      chosen,
      drafter,
      keys,
      preferences,
      totals,
      recentDrafts,
      recentReads,
      reading,
      readingChosen,
      guard,
    ] = await Promise.all([
      this.db.intelligence.model(workspaceId),
      this.drafter(workspaceId),
      this.db.intelligence.keys(workspaceId),
      this.preferences(workspaceId),
      // Added up in the database: a busy month is tens of thousands of runs.
      this.db.intelligence.spend(
        workspaceId,
        new Date(Date.now() - SPEND_DAYS * DAY_MS).toISOString(),
      ),
      this.db.intelligence.recentUsage(workspaceId, 'recommendations', 50),
      this.db.intelligence.recentUsage(workspaceId, 'tickets', 50),
      this.readingModel(workspaceId),
      this.db.intelligence.readingModel(workspaceId),
      this.guard(workspaceId),
    ]);
    const owner = drafter.off === null ? drafter.owner : null;
    // On Dossier's key with the trial used up, nothing drafts: say so here
    // as a missing key does.
    const off =
      drafter.off ??
      (owner === 'shared'
        ? (limitOn('shared', guard, false, new Date(), this.trial)?.message ??
          null)
        : null);
    const limits: IntelligenceLimits = {
      trial:
        owner === 'shared'
          ? { used: guard.sharedCalls, limit: this.trial }
          : null,
      dailyBudget: guard.dailyBudget ?? DEFAULT_DAILY_BUDGET,
      dailyBudgetChosen: guard.dailyBudget,
      spentToday: guard.spentToday,
      waiting: owner
        ? (limitOn(owner, guard, true, new Date(), this.trial)?.message ?? null)
        : null,
    };

    const spend: IntelligenceSpend[] = intelligenceKindSchema.options.flatMap(
      (kind) => totals.filter((sum) => sum.kind === kind),
    );

    const typical = (measured: ModelUsage[], before: ModelUsage) =>
      measured.length === 0
        ? before
        : {
            inputTokens: median(measured.map((u) => u.inputTokens)),
            outputTokens: median(measured.map((u) => u.outputTokens)),
            cacheReadTokens: median(measured.map((u) => u.cacheReadTokens)),
            cacheWriteTokens: median(measured.map((u) => u.cacheWriteTokens)),
          };
    const typicalRun = typical(recentDrafts, TYPICAL_RUN);

    return {
      enabled: off === null,
      off,
      model: drafter.model,
      chosen: modelIdSchema.safeParse(chosen).data ?? null,
      defaultModel: this.defaultModel,
      keys: keys.map(shown),
      dossierKeys: this.llm ? ['anthropic'] : [],
      canStoreKeys: this.secrets.available,
      spend,
      typicalRun,
      readingModel: reading,
      readingChosen: modelIdSchema.safeParse(readingChosen).data ?? null,
      typicalRead: typical(recentReads, TYPICAL_READ),
      preferences,
      limits,
    };
  }

  /** What the workspace wants from Claude; anything it never chose is on. */
  async preferences(workspaceId: string): Promise<IntelligencePreferences> {
    const saved = intelligencePreferencesSchema.safeParse(
      await this.settingsOf(workspaceId, 'preferences', () =>
        this.db.intelligence.preferences(workspaceId),
      ),
    );
    return saved.data ?? intelligencePreferencesSchema.parse({});
  }

  async setPreferences(
    workspaceId: string,
    preferences: IntelligencePreferences,
  ): Promise<void> {
    // What's drafted or shared is different: every client is due again.
    await this.db.changes.forgetMarks(workspaceId).catch(this.warn);
    await this.db.intelligence.setPreferences(workspaceId, preferences);
    this.forget(workspaceId);
  }

  /** Whether the workspace wants this output, as set on the Intelligence page. */
  async isOn(
    workspaceId: string,
    output: IntelligenceOutput,
  ): Promise<boolean> {
    return (await this.preferences(workspaceId)).outputs[output];
  }

  /** Null goes back to the default. */
  async setModel(workspaceId: string, model: ModelId | null): Promise<void> {
    await this.db.intelligence.setModel(workspaceId, model);
    this.forget(workspaceId);
  }

  /**
   * Checks the key with its provider, then keeps it sealed in place of any
   * the workspace had for that provider. When the model in use couldn't run
   * before, switches to the provider's default and returns it.
   */
  async addKey(
    workspaceId: string,
    userId: string,
    provider: ProviderId,
    apiKey: string,
  ): Promise<{ switchedTo: ModelId | null }> {
    if (!this.secrets.available) {
      throw new ServiceUnavailableException(
        'This Dossier can’t keep API keys safe yet: CONNECTOR_SECRET_KEY isn’t set on the API.',
      );
    }
    try {
      await this.clients.check(provider, apiKey);
    } catch (error) {
      if (error instanceof IntelligenceFailure) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }
    const [before, user] = await Promise.all([
      this.drafter(workspaceId),
      this.db.users.get(userId),
    ]);
    await this.db.intelligence.saveKey(workspaceId, {
      provider,
      secret: this.secrets.encrypt({ apiKey }),
      hint: apiKey.slice(-4),
      addedBy: { userId, name: user?.name ?? 'Someone' },
      addedAt: new Date().toISOString(),
    });
    this.forget(workspaceId);
    // A new key may fix what paused Dossier's own drafting: try again now.
    await this.db.aiBudget.resume(workspaceId).catch(this.warn);
    if (before.off === null) return { switchedTo: null };
    const switchedTo =
      modelInfo(before.model).provider === provider
        ? null
        : PROVIDER_DEFAULT_MODEL[provider];
    if (switchedTo) await this.setModel(workspaceId, switchedTo);
    return { switchedTo };
  }

  /** Forgets the workspace's key for the provider. False when it had none. */
  async removeKey(workspaceId: string, provider: ProviderId): Promise<boolean> {
    const keys = await this.db.intelligence.keys(workspaceId);
    if (!keys.some((key) => key.provider === provider)) return false;
    await this.db.intelligence.removeKey(workspaceId, provider);
    this.forget(workspaceId);
    await this.db.aiBudget.resume(workspaceId).catch(this.warn);
    return true;
  }

  private readonly warn = (error: unknown) =>
    this.logger.warn((error as Error)?.message ?? String(error));
}
