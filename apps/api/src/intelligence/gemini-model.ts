import {
  addUsage,
  modelInfo,
  NO_USAGE,
  type ModelId,
  type ModelUsage,
} from '@dossierhq/contracts';
import {
  ApiError,
  FinishReason,
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentResponse,
} from '@google/genai';
import {
  byToolName,
  callTool,
  IntelligenceFailure,
  keyRefused,
  misshapen,
  modelRefused,
  strictJsonSchema,
  type Effort,
  type IntelligenceModel,
  type KeyHolder,
  type ModelReply,
  type ModelRequest,
  type ModelTool,
  type ToolLoopRequest,
} from './model.js';

/** As for Claude: room for the thinking and the answer. */
const MAX_OUTPUT_TOKENS = 16_000;

const THINKING: Record<Effort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/** Why Gemini stops when it won't say something. */
const DECLINED = new Set<FinishReason | undefined>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

/**
 * Gemini, through Google's Gemini API. Each turn sends the whole
 * conversation, the model's own turns exactly as they came (their thought
 * signatures included), and Google caches its unchanging start by itself.
 */
export class GeminiModel implements IntelligenceModel {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly holder: KeyHolder = 'workspace',
    baseUrl?: string,
  ) {
    this.client = new GoogleGenAI({
      apiKey,
      ...(baseUrl && { httpOptions: { baseUrl } }),
    });
  }

  generate<T>(request: ModelRequest<T>): Promise<ModelReply<T>> {
    return this.loop(request, [], 1);
  }

  answer<T>(request: ToolLoopRequest<T>): Promise<ModelReply<T>> {
    return this.loop(request, request.tools, request.maxTurns);
  }

  private async loop<T>(
    request: ModelRequest<T>,
    tools: ModelTool[],
    maxTurns: number,
  ): Promise<ModelReply<T>> {
    const name = modelInfo(request.model).name;
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const declarations = byToolName(tools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: strictJsonSchema(tool.input),
    }));
    const contents: Content[] = [
      {
        role: 'user',
        parts: [{ text: request.context }, { text: request.task }],
      },
    ];
    let usage = NO_USAGE;
    for (let turn = 1; ; turn++) {
      const last = turn >= maxTurns;
      const response = await this.call(request.model, () =>
        this.client.models.generateContent({
          model: request.model,
          contents,
          config: {
            systemInstruction: request.system,
            responseMimeType: 'application/json',
            responseJsonSchema: strictJsonSchema(request.schema),
            thinkingConfig: { thinkingLevel: THINKING[request.effort] },
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            ...(declarations.length > 0 && {
              tools: [{ functionDeclarations: declarations }],
              toolConfig: {
                functionCallingConfig: {
                  mode: last
                    ? FunctionCallingConfigMode.NONE
                    : FunctionCallingConfigMode.AUTO,
                },
              },
            }),
          },
        }),
      );
      usage = addUsage(usage, usageOf(response));
      const said = finished(response, usage, name);
      const calls = (said.parts ?? []).flatMap((part) =>
        part.functionCall ? [part.functionCall] : [],
      );
      if (calls.length > 0 && !last) {
        contents.push(said);
        contents.push({
          role: 'user',
          parts: await Promise.all(
            calls.map(async (call) => {
              const result = await callTool(
                byName.get(call.name ?? ''),
                call.name ?? '',
                call.args ?? {},
              );
              return {
                functionResponse: {
                  id: call.id,
                  name: call.name,
                  response: result.isError
                    ? { error: result.content }
                    : { output: result.content },
                },
              };
            }),
          ),
        });
        continue;
      }
      // Its words, without the thinking it may show.
      const text = (said.parts ?? [])
        .flatMap((part) => (part.text && !part.thought ? [part.text] : []))
        .join('');
      let data: T;
      try {
        data = request.schema.parse(JSON.parse(text));
      } catch {
        throw misshapen(usage, name);
      }
      return { data, usage, model: request.model };
    }
  }

  /** Makes a request, turning Google's errors into plain words. */
  private async call<M>(model: ModelId, send: () => Promise<M>): Promise<M> {
    try {
      return await send();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      // A key Google doesn't know comes back as a bad request.
      if (
        error.status === 401 ||
        (error.status === 400 && /API[ _]?key/i.test(error.message))
      ) {
        throw new IntelligenceFailure(
          'failed',
          keyRefused('google', this.holder),
        );
      }
      if (error.status === 403 || error.status === 404) {
        throw new IntelligenceFailure('failed', modelRefused(model));
      }
      if (error.status === 429) {
        throw new IntelligenceFailure(
          'failed',
          'Google is limiting how often Dossier can draft, or the key’s quota is used up. It will try again later.',
        );
      }
      throw new IntelligenceFailure(
        'failed',
        `Google answered with an error (${error.status}): ${error.message}`,
      );
    }
  }
}

function usageOf(response: GenerateContentResponse): ModelUsage {
  const usage = response.usageMetadata;
  if (!usage) return NO_USAGE;
  const cached = usage.cachedContentTokenCount ?? 0;
  return {
    inputTokens:
      Math.max(0, (usage.promptTokenCount ?? 0) - cached) +
      (usage.toolUsePromptTokenCount ?? 0),
    // Thinking is billed as output.
    outputTokens:
      (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
}

/**
 * What the model said, once it finished. Throws when it declined, stopped
 * short or said nothing.
 */
function finished(
  response: GenerateContentResponse,
  usage: ModelUsage,
  name: string,
): Content {
  const candidate = response.candidates?.[0];
  if (
    response.promptFeedback?.blockReason ||
    DECLINED.has(candidate?.finishReason)
  ) {
    throw new IntelligenceFailure(
      'refused',
      `${name} declined to answer this one.`,
      usage,
    );
  }
  if (candidate?.finishReason === FinishReason.MAX_TOKENS) {
    throw new IntelligenceFailure(
      'failed',
      `${name} ran out of room before it finished.`,
      usage,
    );
  }
  if (!candidate?.content) {
    throw new IntelligenceFailure(
      'failed',
      `${name} didn’t answer${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}.`,
      usage,
    );
  }
  return candidate.content;
}
