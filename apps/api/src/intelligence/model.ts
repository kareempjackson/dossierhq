import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  INTELLIGENCE_MODELS,
  modelInfo,
  NO_USAGE,
  type ModelId,
  type ModelUsage,
} from '@dossierhq/contracts';
import type { z } from 'zod';

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

/** Something that answers model requests: Claude, or a fake in tests. */
export interface IntelligenceModel {
  generate<T>(request: ModelRequest<T>): Promise<ModelReply<T>>;
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
    // A declined request reruns on another model inside the same call, for
    // the models whose catalog entry says Anthropic can do that.
    const fallback = modelInfo(request.model).fallbacks === 'server';
    let message;
    try {
      message = await this.client.beta.messages.parse({
        model: request.model,
        max_tokens: 16_000,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: request.effort,
          format: betaZodOutputFormat(request.schema),
        },
        system: [
          {
            type: 'text',
            text: request.system,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: request.context,
                cache_control: { type: 'ephemeral' },
              },
              { type: 'text', text: request.task },
            ],
          },
        ],
        ...(fallback && {
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default' as const,
        }),
      });
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

    const usage: ModelUsage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    };
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
    if (message.parsed_output == null) {
      throw new IntelligenceFailure(
        'failed',
        'Claude’s answer wasn’t in the expected shape.',
        usage,
      );
    }
    return {
      data: message.parsed_output as T,
      usage,
      model: isModelId(message.model) ? message.model : request.model,
    };
  }
}
