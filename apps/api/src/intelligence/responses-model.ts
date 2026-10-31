import {
  addUsage,
  modelInfo,
  NO_USAGE,
  providerInfo,
  type ModelId,
  type ModelUsage,
} from '@dossierhq/contracts';
import OpenAI from 'openai';
import type {
  Response,
  ResponseFunctionToolCall,
  ResponseInputItem,
} from 'openai/resources/responses/responses';
import { createHash } from 'node:crypto';
import {
  byToolName,
  callTool,
  IntelligenceFailure,
  keyRefused,
  misshapen,
  modelRefused,
  strictJsonSchema,
  type IntelligenceModel,
  type KeyHolder,
  type ModelReply,
  type ModelRequest,
  type ModelTool,
  type ToolLoopRequest,
} from './model.js';

/** The providers that speak OpenAI's Responses API. */
export type ResponsesProvider = 'openai' | 'xai';

export const RESPONSES_BASE_URLS: Record<
  ResponsesProvider,
  string | undefined
> = {
  openai: undefined,
  xai: 'https://api.x.ai/v1',
};

/** As for Claude: room for the thinking and the answer. */
const MAX_OUTPUT_TOKENS = 16_000;

/**
 * GPT through OpenAI's Responses API, and Grok through xAI's, which takes the
 * same requests. Nothing is stored at the provider: each turn sends the whole
 * conversation, with the model's reasoning sealed, and the provider caches
 * its unchanging start by itself.
 */
export class ResponsesModel implements IntelligenceModel {
  private readonly client: OpenAI;

  constructor(
    private readonly provider: ResponsesProvider,
    apiKey: string,
    private readonly holder: KeyHolder = 'workspace',
    baseURL = RESPONSES_BASE_URLS[provider],
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  generate<T>(request: ModelRequest<T>): Promise<ModelReply<T>> {
    return this.loop(request, [], 1);
  }

  answer<T>(request: ToolLoopRequest<T>): Promise<ModelReply<T>> {
    return this.loop(request, request.tools, request.maxTurns);
  }

  /**
   * Asks, runs the tools the model calls and asks again, until it answers
   * or reaches `maxTurns`, when it has to.
   */
  private async loop<T>(
    request: ModelRequest<T>,
    tools: ModelTool[],
    maxTurns: number,
  ): Promise<ModelReply<T>> {
    const name = modelInfo(request.model).name;
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const definitions = byToolName(tools).map((tool) => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description,
      parameters: strictJsonSchema(tool.input),
      strict: true,
    }));
    const input: ResponseInputItem[] = [
      { role: 'system', content: request.system },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: request.context },
          { type: 'input_text', text: request.task },
        ],
      },
    ];
    let usage = NO_USAGE;
    for (let turn = 1; ; turn++) {
      const last = turn >= maxTurns;
      const response = await this.call(request.model, () =>
        this.client.responses.create({
          model: request.model,
          input,
          text: {
            format: {
              type: 'json_schema',
              name: 'answer',
              schema: strictJsonSchema(request.schema),
              strict: true,
            },
          },
          reasoning: { effort: request.effort },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          store: false,
          include: ['reasoning.encrypted_content'],
          // Keeps every turn on the cache of what doesn't change.
          prompt_cache_key: cacheKey(request),
          ...(definitions.length > 0 && {
            tools: definitions,
            tool_choice: last ? ('none' as const) : ('auto' as const),
          }),
        }),
      );
      usage = addUsage(usage, usageOf(response));
      finished(response, usage, name);
      const calls = response.output.filter(
        (item): item is ResponseFunctionToolCall =>
          item.type === 'function_call',
      );
      if (calls.length > 0 && !last) {
        // Everything it said, reasoning included, then what the tools found.
        input.push(...(response.output as ResponseInputItem[]));
        input.push(
          ...(await Promise.all(
            calls.map(async (call) => {
              const result = await callTool(
                byName.get(call.name),
                call.name,
                parseArguments(call.arguments),
              );
              return {
                type: 'function_call_output' as const,
                call_id: call.call_id,
                output: result.content,
              };
            }),
          )),
        );
        continue;
      }
      let data: T;
      try {
        data = request.schema.parse(JSON.parse(response.output_text));
      } catch {
        throw misshapen(usage, name);
      }
      return { data, usage, model: request.model };
    }
  }

  /** Makes a request, turning the provider's errors into plain words. */
  private async call<M>(model: ModelId, send: () => Promise<M>): Promise<M> {
    const { name: provider } = providerInfo(this.provider);
    try {
      return await send();
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) {
        throw new IntelligenceFailure(
          'failed',
          keyRefused(this.provider, this.holder),
        );
      }
      if (
        error instanceof OpenAI.PermissionDeniedError ||
        error instanceof OpenAI.NotFoundError
      ) {
        throw new IntelligenceFailure('failed', modelRefused(model));
      }
      if (error instanceof OpenAI.RateLimitError) {
        throw new IntelligenceFailure(
          'failed',
          error.code === 'insufficient_quota'
            ? `${provider} says the account behind this key is out of credit.`
            : `${provider} is limiting how often Dossier can draft. It will try again later.`,
        );
      }
      if (error instanceof OpenAI.APIError) {
        throw new IntelligenceFailure(
          'failed',
          `${provider} answered with an error (${error.status ?? 'no status'}): ${error.message}`,
        );
      }
      throw error;
    }
  }
}

/** The same for every request that starts the same way, and on every turn. */
const cacheKey = <T>(request: ModelRequest<T>) =>
  createHash('sha256')
    .update(request.model)
    .update('\0')
    .update(request.system)
    .update('\0')
    .update(request.context)
    .digest('hex')
    .slice(0, 32);

const parseArguments = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

function usageOf(response: Response): ModelUsage {
  const usage = response.usage;
  if (!usage) return NO_USAGE;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const written = usage.input_tokens_details?.cache_write_tokens ?? 0;
  return {
    inputTokens: Math.max(0, usage.input_tokens - cached - written),
    // xAI may count reasoning apart from output_tokens; the total has it
    // either way, and it's billed as output.
    outputTokens: Math.max(
      usage.output_tokens,
      usage.total_tokens - usage.input_tokens,
    ),
    cacheReadTokens: cached,
    cacheWriteTokens: written,
  };
}

/** Throws when the model declined, stopped short or failed. */
function finished(response: Response, usage: ModelUsage, name: string) {
  const refused = response.output.some(
    (item) =>
      item.type === 'message' &&
      item.content.some((part) => part.type === 'refusal'),
  );
  if (refused || response.incomplete_details?.reason === 'content_filter') {
    throw new IntelligenceFailure(
      'refused',
      `${name} declined to answer this one.`,
      usage,
    );
  }
  if (response.incomplete_details?.reason === 'max_output_tokens') {
    throw new IntelligenceFailure(
      'failed',
      `${name} ran out of room before it finished.`,
      usage,
    );
  }
  if (response.status === 'failed' || response.error) {
    throw new IntelligenceFailure(
      'failed',
      `${name} couldn’t answer: ${response.error?.message ?? 'no reason given'}`,
      usage,
    );
  }
}
