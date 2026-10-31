import { ApiError } from '@google/genai';
import OpenAI from 'openai';
import { z } from 'zod';
import { GeminiModel } from './gemini-model.js';
import {
  IntelligenceFailure,
  strictJsonSchema,
  type ModelTool,
} from './model.js';
import { ResponsesModel } from './responses-model.js';

type Item = Record<string, unknown>;

const schema = z.object({ answer: z.string() });

function tools(ran: string[]): ModelTool[] {
  return [
    {
      name: 'zebra_lookup',
      description: 'Looks a zebra up.',
      input: z.object({ name: z.string() }),
      run: async (input) => {
        ran.push(`zebra ${(input as { name: string }).name}`);
        return 'Stripes.';
      },
    },
    {
      name: 'apple_lookup',
      description: 'Fails.',
      input: z.object({ id: z.string() }),
      run: async () => {
        throw new Error('The orchard is closed');
      },
    },
  ];
}

const request = <M extends string>(model: M, ran: string[], maxTurns = 5) => ({
  model: model as never,
  system: 'You answer.',
  context: '<client_directory>…</client_directory>',
  task: 'What is it?',
  schema,
  effort: 'medium' as const,
  tools: tools(ran),
  maxTurns,
});

/** What a request sent, as it was then: the loop appends to the same input later. */
const copy = (params: unknown) =>
  JSON.parse(JSON.stringify(params)) as Record<string, unknown>;

describe('strictJsonSchema', () => {
  it('closes every object, requires every property and lists null as a type', () => {
    const point = z.object({
      text: z.string().describe('What they said.'),
      quote: z.string().nullable().describe('Their words, or null.'),
      kinds: z.array(z.enum(['a', 'b'])),
    });
    expect(strictJsonSchema(z.object({ points: z.array(point) }))).toEqual({
      type: 'object',
      properties: {
        points: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'What they said.' },
              quote: {
                type: ['string', 'null'],
                description: 'Their words, or null.',
              },
              kinds: {
                type: 'array',
                items: { type: 'string', enum: ['a', 'b'] },
              },
            },
            required: ['text', 'quote', 'kinds'],
            additionalProperties: false,
          },
        },
      },
      required: ['points'],
      additionalProperties: false,
    });
  });
});

// OpenAI and xAI ---------------------------------------------------------------

type Reply = {
  output: Item[];
  status?: string;
  incomplete_details?: { reason: string } | null;
};

/** A model whose Responses API answers each request with the next of `replies`. */
function responses(
  replies: (Reply | Error)[],
  provider: 'openai' | 'xai' = 'openai',
) {
  const model = new ResponsesModel(provider, 'test-key');
  const sent: Record<string, unknown>[] = [];
  (model as unknown as { client: unknown }).client = {
    responses: {
      create: async (params: unknown) => {
        sent.push(copy(params));
        const reply = replies.shift();
        if (!reply) throw new Error('No more replies');
        if (reply instanceof Error) throw reply;
        const text = reply.output
          .flatMap((item) =>
            item.type === 'message'
              ? (item.content as Item[]).flatMap((part) =>
                  part.type === 'output_text' ? [part.text as string] : [],
                )
              : [],
          )
          .join('');
        return {
          id: `resp-${sent.length}`,
          status: 'completed',
          incomplete_details: null,
          error: null,
          output_text: text,
          ...reply,
          usage: {
            input_tokens: 1_100,
            input_tokens_details: {
              cached_tokens: 1_000,
              cache_write_tokens: 0,
            },
            output_tokens: 20,
            output_tokens_details: { reasoning_tokens: 5 },
            total_tokens: 1_120,
          },
        };
      },
    },
  };
  return { model, sent };
}

const said = (answer: unknown): Item => ({
  type: 'message',
  role: 'assistant',
  content: [{ type: 'output_text', text: JSON.stringify(answer) }],
});
const reasoning: Item = {
  type: 'reasoning',
  id: 'rs-1',
  summary: [],
  encrypted_content: 'sealed-thoughts',
};
const call = (call_id: string, name: string, args: unknown): Item => ({
  type: 'function_call',
  call_id,
  name,
  arguments: JSON.stringify(args),
});

describe('ResponsesModel', () => {
  it('stores nothing, sends every tool result back with the reasoning, and answers', async () => {
    const ran: string[] = [];
    const { model, sent } = responses([
      {
        output: [
          reasoning,
          call('call-1', 'zebra_lookup', { name: 'Zed' }),
          call('call-2', 'apple_lookup', { id: 'a1' }),
          call('call-3', 'pear_lookup', {}),
        ],
      },
      { output: [said({ answer: 'A zebra.' })] },
    ]);
    const reply = await model.answer(request('gpt-6.1-sol', ran));
    expect(reply).toEqual({
      data: { answer: 'A zebra.' },
      model: 'gpt-6.1-sol',
      // Cached tokens come out of the input, and usage adds up across turns.
      usage: {
        inputTokens: 200,
        outputTokens: 40,
        cacheReadTokens: 2_000,
        cacheWriteTokens: 0,
      },
    });
    expect(ran).toEqual(['zebra Zed']);

    const [first, second] = sent as {
      input: Item[];
      tools: Item[];
      tool_choice: string;
      store: boolean;
      include: string[];
      prompt_cache_key: string;
      reasoning: Item;
      text: { format: Item };
    }[];
    expect(first!.store).toBe(false);
    expect(first!.include).toEqual(['reasoning.encrypted_content']);
    expect(first!.reasoning).toEqual({ effort: 'medium' });
    expect(first!.text.format).toMatchObject({
      type: 'json_schema',
      strict: true,
      schema: { additionalProperties: false, required: ['answer'] },
    });
    expect(first!.tools.map((t) => [t.name, t.strict])).toEqual([
      ['apple_lookup', true],
      ['zebra_lookup', true],
    ]);
    expect(first!.tool_choice).toBe('auto');
    expect(first!.input.slice(0, 1)).toEqual([
      { role: 'system', content: 'You answer.' },
    ]);
    // Every turn starts the same way, on the same cache.
    expect(second!.prompt_cache_key).toBe(first!.prompt_cache_key);
    expect(second!.input.slice(0, 2)).toEqual(first!.input);
    expect(second!.input[2]).toEqual(reasoning);
    const results = second!.input.filter(
      (item) => item.type === 'function_call_output',
    );
    expect(results.map((r) => r.call_id)).toEqual([
      'call-1',
      'call-2',
      'call-3',
    ]);
    expect(results[0]!.output).toBe('Stripes.');
    expect(results[1]!.output).toMatch(/The orchard is closed/);
    expect(results[2]!.output).toMatch(/no tool called pear_lookup/);
  });

  it('makes the model answer on its last turn, and drafts without tools', async () => {
    const { model, sent } = responses([
      { output: [call('call-1', 'zebra_lookup', { name: 'Zed' })] },
      { output: [said({ answer: 'With what I have.' })] },
      { output: [said({ answer: 'Drafted.' })] },
    ]);
    await model.answer(request('grok-4.7', [], 2));
    expect(sent.map((s) => s.tool_choice)).toEqual(['auto', 'none']);
    const {
      tools: _tools,
      maxTurns: _turns,
      ...draft
    } = request('gpt-6-luna', []);
    await expect(model.generate(draft)).resolves.toMatchObject({
      data: { answer: 'Drafted.' },
    });
    expect(sent[2]).not.toHaveProperty('tools');
  });

  it('counts reasoning xAI leaves out of output_tokens', async () => {
    const { model } = responses([{ output: [said({ answer: 'Hi.' })] }], 'xai');
    (
      model as unknown as {
        client: { responses: { create: (p: unknown) => Promise<Item> } };
      }
    ).client.responses.create = async () => ({
      status: 'completed',
      incomplete_details: null,
      error: null,
      output: [said({ answer: 'Hi.' })],
      output_text: JSON.stringify({ answer: 'Hi.' }),
      usage: {
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 20,
        output_tokens_details: { reasoning_tokens: 300 },
        total_tokens: 420,
      },
    });
    const {
      tools: _tools,
      maxTurns: _turns,
      ...draft
    } = request('grok-4.3', []);
    await expect(model.generate(draft)).resolves.toMatchObject({
      usage: { inputTokens: 100, outputTokens: 320 },
    });
  });

  it('turns refusals, cut-off answers and refused keys into plain words', async () => {
    const fail = (
      reply: Reply | Error,
      provider: 'openai' | 'xai' = 'openai',
    ) =>
      responses([reply], provider)
        .model.answer(request('gpt-6.1-sol', []))
        .catch((error: IntelligenceFailure) => error);

    const refused = await fail({
      output: [
        {
          type: 'message',
          content: [{ type: 'refusal', refusal: 'No.' }],
        },
      ],
    });
    expect(refused).toMatchObject({
      kind: 'refused',
      message: 'GPT-6.1 Sol declined to answer this one.',
    });
    await expect(
      fail({
        output: [],
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      }),
    ).resolves.toMatchObject({
      message: 'GPT-6.1 Sol ran out of room before it finished.',
    });
    await expect(
      fail({ output: [said({ wrong: true })] }),
    ).resolves.toMatchObject({
      message: 'GPT-6.1 Sol’s answer wasn’t in the expected shape.',
    });
    await expect(
      fail(OpenAI.APIError.generate(401, {}, 'Bad key', new Headers()), 'xai'),
    ).resolves.toMatchObject({
      message:
        'xAI turned down your workspace’s API key. Replace it in Settings.',
    });
    await expect(
      fail(
        OpenAI.APIError.generate(
          429,
          { error: { code: 'insufficient_quota' } },
          'Quota',
          new Headers(),
        ),
      ),
    ).resolves.toMatchObject({
      message: 'OpenAI says the account behind this key is out of credit.',
    });
    await expect(
      fail(OpenAI.APIError.generate(404, {}, 'No model', new Headers())),
    ).resolves.toMatchObject({
      message: expect.stringMatching(
        /^OpenAI won’t let this key use GPT-6.1 Sol\./,
      ),
    });
  });
});

// Gemini -----------------------------------------------------------------------

type Candidate = {
  content?: { role: string; parts: Item[] };
  finishReason?: string;
};

/** A Gemini whose API answers each request with the next of `replies`. */
function gemini(replies: (Candidate | Error)[]) {
  const model = new GeminiModel('test-key');
  const sent: Record<string, unknown>[] = [];
  (model as unknown as { client: unknown }).client = {
    models: {
      generateContent: async (params: unknown) => {
        sent.push(copy(params));
        const reply = replies.shift();
        if (!reply) throw new Error('No more replies');
        if (reply instanceof Error) throw reply;
        return {
          candidates: [{ finishReason: 'STOP', ...reply }],
          usageMetadata: {
            promptTokenCount: 1_100,
            cachedContentTokenCount: 1_000,
            candidatesTokenCount: 15,
            thoughtsTokenCount: 5,
          },
        };
      },
    },
  };
  return { model, sent };
}

const modelTurn = (...parts: Item[]) => ({
  content: { role: 'model', parts },
});

describe('GeminiModel', () => {
  it('sends its turns back as they came, with every tool result, and answers', async () => {
    const ran: string[] = [];
    const calling = modelTurn(
      { thought: true, text: 'Let me look.', thoughtSignature: 'sig-1' },
      {
        functionCall: { id: 'c1', name: 'zebra_lookup', args: { name: 'Zed' } },
      },
      { functionCall: { id: 'c2', name: 'apple_lookup', args: { id: 'a1' } } },
    );
    const { model, sent } = gemini([
      calling,
      modelTurn(
        { thought: true, text: 'Done thinking.' },
        { text: JSON.stringify({ answer: 'A zebra.' }) },
      ),
    ]);
    const reply = await model.answer(request('gemini-4-argon', ran));
    expect(reply).toEqual({
      data: { answer: 'A zebra.' },
      model: 'gemini-4-argon',
      // Thinking is billed as output.
      usage: {
        inputTokens: 200,
        outputTokens: 40,
        cacheReadTokens: 2_000,
        cacheWriteTokens: 0,
      },
    });
    expect(ran).toEqual(['zebra Zed']);

    const [first, second] = sent as {
      contents: { role: string; parts: Item[] }[];
      config: {
        systemInstruction: string;
        responseMimeType: string;
        responseJsonSchema: Item;
        thinkingConfig: Item;
        tools: { functionDeclarations: Item[] }[];
        toolConfig: { functionCallingConfig: { mode: string } };
      };
    }[];
    expect(first!.config).toMatchObject({
      systemInstruction: 'You answer.',
      responseMimeType: 'application/json',
      responseJsonSchema: { additionalProperties: false },
      thinkingConfig: { thinkingLevel: 'MEDIUM' },
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    });
    expect(
      first!.config.tools[0]!.functionDeclarations.map((d) => d.name),
    ).toEqual(['apple_lookup', 'zebra_lookup']);
    expect(second!.contents[0]).toEqual(first!.contents[0]);
    // Its own turn exactly, thought signature and all.
    expect(second!.contents[1]).toEqual(calling.content);
    expect(second!.contents[2]!.parts).toEqual([
      {
        functionResponse: {
          id: 'c1',
          name: 'zebra_lookup',
          response: { output: 'Stripes.' },
        },
      },
      {
        functionResponse: {
          id: 'c2',
          name: 'apple_lookup',
          response: {
            error: expect.stringMatching(/The orchard is closed/),
          },
        },
      },
    ]);
  });

  it('makes Gemini answer on its last turn', async () => {
    const { model, sent } = gemini([
      modelTurn({
        functionCall: { name: 'zebra_lookup', args: { name: 'Z' } },
      }),
      modelTurn({ text: JSON.stringify({ answer: 'With what I have.' }) }),
    ]);
    await model.answer(request('gemini-3.8-flash', [], 2));
    expect(
      sent.map(
        (s) =>
          (s.config as { toolConfig: { functionCallingConfig: Item } })
            .toolConfig.functionCallingConfig.mode,
      ),
    ).toEqual(['AUTO', 'NONE']);
  });

  it('turns blocks, cut-off answers and refused keys into plain words', async () => {
    const fail = (reply: Candidate | Error) =>
      gemini([reply])
        .model.answer(request('gemini-4-argon', []))
        .catch((error: IntelligenceFailure) => error);
    await expect(fail({ finishReason: 'SAFETY' })).resolves.toMatchObject({
      kind: 'refused',
      message: 'Gemini 4 Argon declined to answer this one.',
    });
    await expect(
      fail({ ...modelTurn({ text: '{"ans' }), finishReason: 'MAX_TOKENS' }),
    ).resolves.toMatchObject({
      message: 'Gemini 4 Argon ran out of room before it finished.',
    });
    await expect(
      fail(
        new ApiError({
          status: 400,
          message: 'API key not valid. Please pass a valid API key.',
        }),
      ),
    ).resolves.toMatchObject({
      message:
        'Google turned down your workspace’s API key. Replace it in Settings.',
    });
    await expect(
      fail(new ApiError({ status: 429, message: 'Quota exceeded' })),
    ).resolves.toMatchObject({
      message: expect.stringMatching(/^Google is limiting/),
    });
  });
});
