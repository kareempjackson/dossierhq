import { z } from 'zod';
import { ClaudeModel, IntelligenceFailure, type ModelTool } from './model.js';

type Block = Record<string, unknown>;

/** A Claude whose API answers each request with the next of `replies`. */
function stubbed(replies: { content: Block[]; stop_reason: string }[]) {
  const model = new ClaudeModel('test-key');
  const sent: Record<string, unknown>[] = [];
  (model as unknown as { client: unknown }).client = {
    beta: {
      messages: {
        create: async (params: unknown) => {
          // As it was sent: the loop appends to the same messages later.
          sent.push(JSON.parse(JSON.stringify(params)));
          const reply = replies.shift();
          if (!reply) throw new Error('No more replies');
          return {
            id: `msg-${sent.length}`,
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5-5',
            ...reply,
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              cache_read_input_tokens: 1_000,
              cache_creation_input_tokens: 50,
            },
          };
        },
      },
    },
  };
  return { model, sent };
}

const schema = z.object({ answer: z.string() });
const final = (answer: string) => ({
  content: [{ type: 'text', text: JSON.stringify({ answer }) }],
  stop_reason: 'end_turn',
});
const calls = (...uses: [string, string, unknown][]) => ({
  content: uses.map(([id, name, input]) => ({
    type: 'tool_use',
    id,
    name,
    input,
  })),
  stop_reason: 'tool_use',
});

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

const request = (ran: string[], maxTurns = 5) => ({
  model: 'claude-opus-5-5' as const,
  system: 'You answer.',
  context: '<client_directory>…</client_directory>',
  task: 'What is it?',
  schema,
  effort: 'medium' as const,
  tools: tools(ran),
  maxTurns,
});

describe('ClaudeModel.answer', () => {
  it('runs every tool call in a turn, sends the results back together, and answers', async () => {
    const ran: string[] = [];
    const { model, sent } = stubbed([
      calls(
        ['call-1', 'zebra_lookup', { name: 'Zed' }],
        ['call-2', 'apple_lookup', { id: 'a1' }],
        ['call-3', 'zebra_lookup', { name: 42 }],
        ['call-4', 'pear_lookup', {}],
      ),
      final('A zebra.'),
    ]);
    const reply = await model.answer(request(ran));
    expect(reply.data).toEqual({ answer: 'A zebra.' });
    expect(reply.model).toBe('claude-opus-5-5');
    // Usage adds up across turns.
    expect(reply.usage).toEqual({
      inputTokens: 200,
      outputTokens: 40,
      cacheReadTokens: 2_000,
      cacheWriteTokens: 100,
    });
    expect(ran).toEqual(['zebra Zed']);

    const [first, second] = sent as {
      tools: { name: string; strict: boolean; input_schema: Block }[];
      tool_choice: Block;
      cache_control: Block;
      messages: { role: string; content: Block[] }[];
    }[];
    // Sorted and strict, so the definitions never move in the cache.
    expect(first!.tools.map((t) => t.name)).toEqual([
      'apple_lookup',
      'zebra_lookup',
    ]);
    expect(first!.tools.every((t) => t.strict)).toBe(true);
    expect(first!.tools[0]!.input_schema).not.toHaveProperty('$schema');
    expect(first!.tool_choice).toEqual({ type: 'auto' });
    expect(first!.cache_control).toEqual({ type: 'ephemeral' });

    // The conversation is appended to: the turn as Claude gave it, then
    // every result in one message, failures marked.
    expect(second!.messages).toHaveLength(3);
    expect(second!.messages[0]).toEqual(first!.messages[0]);
    expect(second!.messages[1]!.role).toBe('assistant');
    const results = second!.messages[2]!.content;
    expect(results.map((r) => [r.tool_use_id, r.is_error ?? false])).toEqual([
      ['call-1', false],
      ['call-2', true],
      ['call-3', true],
      ['call-4', true],
    ]);
    expect(results[0]!.content).toBe('Stripes.');
    expect(results[1]!.content).toMatch(/The orchard is closed/);
    expect(results[3]!.content).toMatch(/no tool called pear_lookup/);
  });

  it('makes Claude answer on its last turn', async () => {
    const ran: string[] = [];
    const { model, sent } = stubbed([
      calls(['call-1', 'zebra_lookup', { name: 'Zed' }]),
      final('With what I have.'),
    ]);
    await model.answer(request(ran, 2));
    expect(sent.map((s) => s.tool_choice)).toEqual([
      { type: 'auto' },
      { type: 'none' },
    ]);
  });

  it('fails on an answer in the wrong shape, or a refusal, saying what it cost', async () => {
    const wrong = stubbed([
      {
        content: [{ type: 'text', text: 'Not JSON' }],
        stop_reason: 'end_turn',
      },
    ]);
    const failure = await wrong.model.answer(request([])).catch((e) => e);
    expect(failure).toBeInstanceOf(IntelligenceFailure);
    expect(failure.kind).toBe('failed');
    expect(failure.usage.inputTokens).toBe(100);

    const refused = stubbed([
      calls(['call-1', 'zebra_lookup', { name: 'Zed' }]),
      { content: [], stop_reason: 'refusal' },
    ]);
    const refusal = await refused.model.answer(request([])).catch((e) => e);
    expect(refusal).toBeInstanceOf(IntelligenceFailure);
    expect(refusal.kind).toBe('refused');
    expect(refusal.usage.inputTokens).toBe(200);
  });
});
