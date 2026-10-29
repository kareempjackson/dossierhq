import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type {
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages';
import {
  addUsage,
  INTELLIGENCE_MODELS,
  modelInfo,
  NO_USAGE,
  type ModelId,
  type ModelUsage,
} from '@dossierhq/contracts';
import { z } from 'zod';

/** How hard the model thinks; more costs more. */
export type Effort = 'low' | 'medium' | 'high';

/** One request for a structured answer. */
export type ModelRequest<T> = {
  model: ModelId;
  /** Instructions that never change; cached. */
  system: string;
  /** What the model reads, e.g. a client's records; cached after `system`. */
  context: string;
  /** What to do this time; read after the cache. */
  task: string;
  /** The answer's shape, enforced by structured outputs. */
  schema: z.ZodType<T>;
  effort: Effort;
};

export type ModelReply<T> = {
  data: T;
  usage: ModelUsage;
  /** The model that answered: the one asked, unless a fallback stepped in. */
  model: ModelId;
};

/** Why a model gave no usable answer. `usage` is what it cost anyway. */
export class IntelligenceFailure extends Error {
  override readonly name = 'IntelligenceFailure';

  constructor(
    readonly kind: 'refused' | 'failed',
    message: string,
    readonly usage: ModelUsage = NO_USAGE,
  ) {
    super(message);
  }
}

/** A lookup the model can make while it works out an answer. */
export type ModelTool = {
  name: string;
  /** What it does and when to use it, as the model reads it. */
  description: string;
  /** Its input (zod v4), with no length or number limits: tools are strict. */
  input: z.ZodType;
  /** What goes back to the model. A throw tells the model the lookup failed. */
  run(input: unknown): Promise<string>;
};

/** A request the model answers after looking things up. */
export type ToolLoopRequest<T> = ModelRequest<T> & {
  tools: ModelTool[];
  /** The most turns the model takes; on the last it has to answer. */
  maxTurns: number;
};

/** Something that answers model requests: Claude, or a fake in tests. */
export interface IntelligenceModel {
  generate<T>(request: ModelRequest<T>): Promise<ModelReply<T>>;
  /** Optional, so a model that only drafts (like most fakes) needn't have it. */
  answer?<T>(request: ToolLoopRequest<T>): Promise<ModelReply<T>>;
}

/** Injection token for the IntelligenceModel (tests swap it). */
export const INTELLIGENCE_MODEL = Symbol('INTELLIGENCE_MODEL');

const isModelId = (id: string): id is ModelId =>
  INTELLIGENCE_MODELS.some((model) => model.id === id);

/**
 * Claude, through Anthropic's API. Everything model-specific comes from the
 * catalog in packages/contracts/src/models.ts, so switching models is data.
 */
export class ClaudeModel implements IntelligenceModel {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate<T>(request: ModelRequest<T>): Promise<ModelReply<T>> {
    const message = await this.call(() =>
      this.client.beta.messages.parse({
        ...this.base(request),
        messages: [opening(request)],
      }),
    );
    const usage = usageOf(message);
    finished(message, usage);
    if (message.parsed_output == null) throw misshapen(usage);
    return {
      data: message.parsed_output as T,
      usage,
      model: answeredBy(message, request.model),
    };
  }

  /**
   * Lets Claude look things up with the tools, then answer. Each turn sends
   * the whole conversation, appended to and never edited, so every turn
   * reads the turns before it from the cache. Tool calls made in one turn
   * run together, and their results go back in one message.
   */
  async answer<T>(request: ToolLoopRequest<T>): Promise<ModelReply<T>> {
    const byName = new Map(request.tools.map((tool) => [tool.name, tool]));
    // Sorted, so the definitions (and the cache after them) never move.
    const tools = [...request.tools]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((tool) => {
        const { $schema: _schema, ...schema } = z.toJSONSchema(tool.input);
        return {
          name: tool.name,
          description: tool.description,
          input_schema: { ...schema, type: 'object' as const },
          strict: true,
        };
      });
    const messages: BetaMessageParam[] = [opening(request)];
    let usage = NO_USAGE;
    for (let turn = 1; ; turn++) {
      const last = turn >= request.maxTurns;
      // The answer is parsed here rather than by the SDK, since a turn that
      // calls tools may say something first in plain words.
      const message = await this.call(() =>
        this.client.beta.messages.create({
          ...this.base(request),
          tools,
          tool_choice: last ? { type: 'none' } : { type: 'auto' },
          messages,
          // Caches the conversation so far, wherever it now ends.
          cache_control: { type: 'ephemeral' },
        }),
      );
      usage = addUsage(usage, usageOf(message));
      finished(message, usage);
      const calls = message.content.filter(
        (block): block is BetaToolUseBlock => block.type === 'tool_use',
      );
      if (message.stop_reason === 'tool_use' && calls.length > 0 && !last) {
        messages.push({ role: 'assistant', content: message.content });
        messages.push({
          role: 'user',
          content: await Promise.all(
            calls.map((call) => runTool(byName.get(call.name), call)),
          ),
        });
        continue;
      }
      const text = message.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('');
      let data: T;
      try {
        data = request.schema.parse(JSON.parse(text));
      } catch {
        throw misshapen(usage);
      }
      return { data, usage, model: answeredBy(message, request.model) };
    }
  }

  /** What every request has in common. */
  private base<T>(request: ModelRequest<T>) {
    // A declined request reruns on another model inside the same call, for
    // the models whose catalog entry says Anthropic can do that.
    const fallback = modelInfo(request.model).fallbacks === 'server';
    return {
      model: request.model,
      max_tokens: 16_000,
      thinking: { type: 'adaptive' as const },
      output_config: {
        effort: request.effort,
        format: betaZodOutputFormat(request.schema),
      },
      system: [
        {
          type: 'text' as const,
          text: request.system,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      ...(fallback && {
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default' as const,
      }),
    };
  }

  /** Makes a request, turning Anthropic's errors into plain words. */
  private async call<M>(send: () => Promise<M>): Promise<M> {
    try {
      return await send();
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new IntelligenceFailure(
          'failed',
          'Anthropic turned down the API key. Check ANTHROPIC_API_KEY.',
        );
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new IntelligenceFailure(
          'failed',
          'Anthropic is limiting how often Dossier can draft. It will try again later.',
        );
      }
      if (error instanceof Anthropic.APIError) {
        throw new IntelligenceFailure(
          'failed',
          `Anthropic answered with an error (${error.status ?? 'no status'}): ${error.message}`,
        );
      }
      throw error;
    }
  }
}

/** The first message: what to read (cached), then what to do. */
function opening<T>(request: ModelRequest<T>): BetaMessageParam {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: request.context,
        cache_control: { type: 'ephemeral' },
      },
      { type: 'text', text: request.task },
    ],
  };
}

const usageOf = (message: BetaMessage): ModelUsage => ({
  inputTokens: message.usage.input_tokens,
  outputTokens: message.usage.output_tokens,
  cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
  cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
});

const answeredBy = (message: BetaMessage, asked: ModelId): ModelId =>
  isModelId(message.model) ? message.model : asked;

/** Throws when Claude declined, or stopped before it finished. */
function finished(message: BetaMessage, usage: ModelUsage) {
  if (message.stop_reason === 'refusal') {
    throw new IntelligenceFailure(
      'refused',
      'Claude declined to answer this one.',
      usage,
    );
  }
  if (message.stop_reason === 'max_tokens') {
    throw new IntelligenceFailure(
      'failed',
      'Claude ran out of room before it finished.',
      usage,
    );
  }
}

const misshapen = (usage: ModelUsage) =>
  new IntelligenceFailure(
    'failed',
    'Claude’s answer wasn’t in the expected shape.',
    usage,
  );

/** One tool call's result. Bad input and failures go back marked as errors. */
async function runTool(
  tool: ModelTool | undefined,
  call: BetaToolUseBlock,
): Promise<BetaToolResultBlockParam> {
  const result = (content: string, isError = false) => ({
    type: 'tool_result' as const,
    tool_use_id: call.id,
    content,
    ...(isError && { is_error: true }),
  });
  if (!tool) return result(`There is no tool called ${call.name}.`, true);
  const input = tool.input.safeParse(call.input);
  if (!input.success) {
    return result(
      `That input isn’t valid: ${z.prettifyError(input.error)}`,
      true,
    );
  }
  try {
    return result(await tool.run(input.data));
  } catch (error) {
    return result(`That lookup failed: ${(error as Error).message}`, true);
  }
}
