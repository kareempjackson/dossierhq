import {
  addUsage,
  costOf,
  DEFAULT_MODEL,
  INTELLIGENCE_OUTPUTS,
  intelligenceKindSchema,
  intelligencePreferencesSchema,
  modelIdSchema,
  NO_USAGE,
  OUTPUT_OF_KIND,
  type IntelligenceKind,
  type IntelligenceOutput,
  type IntelligencePreferences,
  type IntelligenceSettings,
  type IntelligenceSpend,
  type ModelId,
  type ModelUsage,
} from '@dossierhq/contracts';
import type { DatabaseAdapter, IntelligenceRun } from '@dossierhq/database';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { DAY_MS } from '../integrations/ids.js';
import {
  INTELLIGENCE_MODEL,
  IntelligenceFailure,
  type Effort,
  type IntelligenceModel,
  type ModelReply,
  type ModelTool,
} from './model.js';

export { IntelligenceFailure } from './model.js';

/** One piece of work for the workspace's model. */
export type RunRequest<T> = {
  kind: IntelligenceKind;
  /** Null for work across the workspace. */
  clientId: string | null;
  /** A hash of what the model reads, kept on the run. */
  inputHash?: string | null;
  /** Instructions that never change; cached. */
  system: string;
  /** What the model reads, e.g. a client pack's text; cached after `system`. */
  context: string;
  /** What to do this time; read after the cache. */
  task: string;
  /** The answer's shape (zod v4), enforced by structured outputs. */
  schema: z.ZodType<T>;
  effort: Effort;
  /** The run's ID, when the caller needs to know it beforehand. */
  id?: string;
};

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

const NOT_ENABLED =
  'Drafting with Claude is off. Set ANTHROPIC_API_KEY on the API to turn it on.';

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
};

/**
 * Runs work on the model each workspace chose, and keeps a record of every
 * run: what it cost, and a hash of what it read.
 */
@Injectable()
export class IntelligenceService {
  private readonly logger = new Logger(IntelligenceService.name);
  private readonly defaultModel: ModelId;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    @Inject(INTELLIGENCE_MODEL)
    private readonly llm: IntelligenceModel | null,
    config: ConfigService<AppConfig, true>,
  ) {
    this.defaultModel =
      config.get('INTELLIGENCE_MODEL', { infer: true }) ?? DEFAULT_MODEL;
  }

  /** False until the API has an Anthropic API key. */
  get enabled(): boolean {
    return this.llm !== null;
  }

  /** The workspace's choice, else this Dossier's default. */
  async model(workspaceId: string): Promise<ModelId> {
    const chosen = modelIdSchema.safeParse(
      await this.db.intelligence.model(workspaceId),
    );
    return chosen.success ? chosen.data : this.defaultModel;
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
        task: request.task,
        schema: request.schema,
        effort: request.effort,
        tools: request.tools,
        maxTurns: request.maxTurns,
      });
    });
  }

  /** Runs `ask` on the workspace's model if its output is on, and logs the run. */
  private async logged<T>(
    workspaceId: string,
    request: RunRequest<T>,
    ask: (llm: IntelligenceModel, model: ModelId) => Promise<ModelReply<T>>,
  ): Promise<RunResult<T>> {
    if (!this.llm) throw new ServiceUnavailableException(NOT_ENABLED);
    // Turned off on the Intelligence page: no call, and so no run to log.
    const output = OUTPUT_OF_KIND[request.kind];
    if (!(await this.isOn(workspaceId, output))) {
      throw new IntelligenceFailure('failed', turnedOff(output));
    }
    const model = await this.model(workspaceId);
    const started = new Date().toISOString();
    const save = (
      fields: Pick<IntelligenceRun, 'model' | 'usage' | 'status' | 'error'>,
    ) =>
      this.db.intelligence
        .saveRun(workspaceId, {
          id: request.id ?? `run-${randomUUID()}`,
          clientId: request.clientId,
          kind: request.kind,
          inputHash: request.inputHash ?? null,
          cost: costOf(fields.usage, fields.model as ModelId),
          startedAt: started,
          finishedAt: new Date().toISOString(),
          ...fields,
        })
        .catch(this.warn);

    try {
      const reply = await ask(this.llm, model);
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
      await save({
        model,
        usage: failure.usage,
        status: failure.kind,
        error: failure.message,
      });
      throw failure;
    }
  }

  /** What the Intelligence page shows. */
  async settings(workspaceId: string): Promise<IntelligenceSettings> {
    const [chosen, model, preferences, runs] = await Promise.all([
      this.db.intelligence.model(workspaceId),
      this.model(workspaceId),
      this.preferences(workspaceId),
      this.db.intelligence.runs(
        workspaceId,
        new Date(Date.now() - SPEND_DAYS * DAY_MS).toISOString(),
      ),
    ]);

    const spend: IntelligenceSpend[] = intelligenceKindSchema.options.flatMap(
      (kind) => {
        const ofKind = runs.filter((run) => run.kind === kind);
        if (ofKind.length === 0) return [];
        return [
          {
            kind,
            runs: ofKind.length,
            ...ofKind.reduce((sum, run) => addUsage(sum, run.usage), NO_USAGE),
            cost: ofKind.reduce((sum, run) => sum + run.cost, 0),
          },
        ];
      },
    );

    const measured = runs
      .filter((run) => run.kind === 'recommendations' && run.status === 'ok')
      .slice(0, 50)
      .map((run) => run.usage);
    const typicalRun: ModelUsage =
      measured.length === 0
        ? TYPICAL_RUN
        : {
            inputTokens: median(measured.map((u) => u.inputTokens)),
            outputTokens: median(measured.map((u) => u.outputTokens)),
            cacheReadTokens: median(measured.map((u) => u.cacheReadTokens)),
            cacheWriteTokens: median(measured.map((u) => u.cacheWriteTokens)),
          };

    return {
      enabled: this.enabled,
      model,
      chosen: modelIdSchema.safeParse(chosen).data ?? null,
      defaultModel: this.defaultModel,
      spend,
      typicalRun,
      preferences,
    };
  }

  /** What the workspace wants from Claude; anything it never chose is on. */
  async preferences(workspaceId: string): Promise<IntelligencePreferences> {
    const saved = intelligencePreferencesSchema.safeParse(
      await this.db.intelligence.preferences(workspaceId),
    );
    return saved.data ?? intelligencePreferencesSchema.parse({});
  }

  async setPreferences(
    workspaceId: string,
    preferences: IntelligencePreferences,
  ): Promise<void> {
    await this.db.intelligence.setPreferences(workspaceId, preferences);
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
  }

  private readonly warn = (error: unknown) =>
    this.logger.warn((error as Error)?.message ?? String(error));
}
