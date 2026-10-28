import { z } from 'zod';

/**
 * The Claude models Dossier can draft with, and what each costs. The one place
 * model facts live: to offer another model or change a price, edit this list.
 */

/** US dollars per million tokens. */
export type ModelPrices = {
  input: number;
  output: number;
  /** Reading a prompt prefix back from the cache. */
  cacheRead: number;
  /** Writing a prefix to the 5-minute cache: 1.25× input. */
  cacheWrite: number;
};

export type ModelInfo = {
  id: string;
  name: string;
  /** What it's good for, in one line. */
  summary: string;
  prices: ModelPrices;
  /** Some models cost more once a prompt passes a size. */
  longPrompt?: { overTokens: number; prices: ModelPrices };
  /**
   * 'server': Anthropic retries a declined request on another model inside
   * the same call. 'none': a declined request just fails.
   */
  fallbacks: 'server' | 'none';
  /** Anything a workspace owner should know before choosing it. */
  note?: string;
};

const MODELS = [
  {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    summary:
      'The default. Careful judgement across many records, at a middle price.',
    prices: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
    fallbacks: 'server',
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    summary: 'Half the price of Opus 5.5, and quicker.',
    prices: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    fallbacks: 'server',
  },
  {
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    summary: 'The cheapest and quickest. Best for short answers.',
    // Cache prices are 0.1× and 1.25× input; check them on the pricing page.
    prices: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
    longPrompt: {
      overTokens: 100_000,
      prices: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
    },
    fallbacks: 'none',
    note: 'Prompts over 100K tokens cost 5× more. Counts the same text as about 30% more tokens.',
  },
  {
    id: 'claude-fable-5-1',
    name: 'Claude Fable 5.1',
    summary: 'Anthropic’s most capable model, at 2.5× the price of Opus 5.5.',
    prices: { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
    fallbacks: 'server',
    note: 'Needs an Anthropic account with 30-day data retention; it isn’t available under zero data retention.',
  },
] as const satisfies readonly ModelInfo[];

export type ModelId = (typeof MODELS)[number]['id'];

export const INTELLIGENCE_MODELS: readonly (ModelInfo & { id: ModelId })[] =
  MODELS;

export const modelIdSchema = z.enum(
  INTELLIGENCE_MODELS.map((model) => model.id) as [ModelId, ...ModelId[]],
);

export const DEFAULT_MODEL: ModelId = 'claude-opus-5-5';

/** When the prices above were last checked against PRICING_URL. */
export const PRICES_AS_OF = '2026-10-06';
export const PRICING_URL =
  'https://platform.claude.com/docs/en/about-claude/pricing';

export function modelInfo(id: ModelId): ModelInfo {
  return INTELLIGENCE_MODELS.find((model) => model.id === id)!;
}

/** Tokens one or more requests used. */
export const modelUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
});
export type ModelUsage = z.infer<typeof modelUsageSchema>;

export const NO_USAGE: ModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export const addUsage = (a: ModelUsage, b: ModelUsage): ModelUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

/** What one request cost in US dollars, at `model`'s prices. */
export function costOf(usage: ModelUsage, model: ModelId): number {
  const info = modelInfo(model);
  const prompt =
    usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const prices =
    info.longPrompt && prompt > info.longPrompt.overTokens
      ? info.longPrompt.prices
      : info.prices;
  return (
    (usage.inputTokens * prices.input +
      usage.outputTokens * prices.output +
      usage.cacheReadTokens * prices.cacheRead +
      usage.cacheWriteTokens * prices.cacheWrite) /
    1_000_000
  );
}
