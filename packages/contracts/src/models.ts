import { z } from 'zod';

/**
 * The models Dossier can draft with, who runs them, and what each costs. The
 * one place model facts live: to offer another model or change a price, edit
 * these lists.
 */

/** Who runs the models. Each takes its own API key, which a workspace brings. */
export const providerIdSchema = z.enum([
  'anthropic',
  'openai',
  'google',
  'xai',
]);
export type ProviderId = z.infer<typeof providerIdSchema>;

export type ProviderInfo = {
  id: ProviderId;
  /** "OpenAI". */
  name: string;
  /** What people know its models as: "ChatGPT". */
  product: string;
  /** Where an account owner makes a key. */
  keysUrl: string;
  /** What a key looks like, for the field it's pasted into. */
  keyPlaceholder: string;
  pricingUrl: string;
  /** When the prices below were last checked against pricingUrl. */
  pricesAsOf: string;
};

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    product: 'Claude',
    keysUrl: 'https://platform.claude.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    pricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
    pricesAsOf: '2026-10-06',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    product: 'ChatGPT',
    keysUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    pricingUrl: 'https://developers.openai.com/api/docs/pricing',
    pricesAsOf: '2026-10-31',
  },
  {
    id: 'google',
    name: 'Google',
    product: 'Gemini',
    keysUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    pricesAsOf: '2026-10-31',
  },
  {
    id: 'xai',
    name: 'xAI',
    product: 'Grok',
    keysUrl: 'https://console.x.ai',
    keyPlaceholder: 'xai-…',
    pricingUrl: 'https://docs.x.ai/docs/models',
    pricesAsOf: '2026-10-31',
  },
];

export function providerInfo(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((provider) => provider.id === id)!;
}

/** US dollars per million tokens. */
export type ModelPrices = {
  input: number;
  output: number;
  /** Reading a prompt prefix back from the cache. */
  cacheRead: number;
  /**
   * Writing a prefix to the cache: 1.25× input at Anthropic, for its
   * 5-minute cache. The others cache by themselves at the input price.
   */
  cacheWrite: number;
};

export type ModelInfo = {
  id: string;
  provider: ProviderId;
  name: string;
  /** What it's good for, in one line. */
  summary: string;
  prices: ModelPrices;
  /** Some models cost more once a prompt passes a size. */
  longPrompt?: { overTokens: number; prices: ModelPrices };
  /**
   * 'server': Anthropic retries a declined request on another model inside
   * the same call. 'none': a declined request just fails, as at every other
   * provider.
   */
  fallbacks: 'server' | 'none';
  /** Anything a workspace owner should know before choosing it. */
  note?: string;
};

const MODELS = [
  {
    provider: 'anthropic',
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    summary:
      'The default. Careful judgement across many records, at a middle price.',
    prices: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
    fallbacks: 'server',
  },
  {
    provider: 'anthropic',
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    summary: 'Half the price of Opus 5.5, and quicker.',
    prices: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    fallbacks: 'server',
  },
  {
    provider: 'anthropic',
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
    provider: 'anthropic',
    id: 'claude-fable-5-1',
    name: 'Claude Fable 5.1',
    summary: 'Anthropic’s most capable model, at 2.5× the price of Opus 5.5.',
    prices: { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
    fallbacks: 'server',
    note: 'Needs an Anthropic account with 30-day data retention; it isn’t available under zero data retention.',
  },
  {
    provider: 'openai',
    id: 'gpt-6-astra',
    name: 'GPT-6 Astra',
    summary: 'OpenAI’s most capable model, at 2.5× the price of Opus 5.5.',
    prices: { input: 10, output: 50, cacheRead: 1, cacheWrite: 10 },
    longPrompt: {
      overTokens: 272_000,
      prices: { input: 20, output: 75, cacheRead: 2, cacheWrite: 20 },
    },
    fallbacks: 'none',
    note: 'Prompts over 272K tokens cost twice as much to read.',
  },
  {
    provider: 'openai',
    id: 'gpt-6.1-sol',
    name: 'GPT-6.1 Sol',
    summary: 'OpenAI’s balance of judgement and price: half of Opus 5.5.',
    prices: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2 },
    longPrompt: {
      overTokens: 272_000,
      prices: { input: 4, output: 15, cacheRead: 0.2, cacheWrite: 4 },
    },
    fallbacks: 'none',
    note: 'Prompts over 272K tokens cost twice as much to read.',
  },
  {
    provider: 'openai',
    id: 'gpt-6-luna',
    name: 'GPT-6 Luna',
    summary: 'OpenAI’s cheapest and quickest. Best for short answers.',
    prices: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.1 },
    longPrompt: {
      overTokens: 272_000,
      prices: { input: 0.2, output: 0.75, cacheRead: 0.02, cacheWrite: 0.2 },
    },
    fallbacks: 'none',
    note: 'Prompts over 272K tokens cost twice as much to read.',
  },
  {
    provider: 'google',
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    summary: 'Google’s most capable model, at half the price of Opus 5.5.',
    prices: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2 },
    fallbacks: 'none',
    note: 'An introductory price: Google doubles it on 1 December 2026.',
  },
  {
    provider: 'google',
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    summary: 'Quicker and cheaper than Argon, and good at most drafting.',
    prices: { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0.75 },
    fallbacks: 'none',
    note: 'An introductory price: Google doubles it on 1 January 2027.',
  },
  {
    provider: 'google',
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    summary: 'Google’s cheapest and quickest. Best for short answers.',
    prices: { input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: 0.3 },
    fallbacks: 'none',
  },
  {
    provider: 'xai',
    id: 'grok-4.7',
    name: 'Grok 4.7',
    summary: 'xAI’s most capable model, with cheaper output than most.',
    prices: { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 2 },
    longPrompt: {
      overTokens: 199_999,
      prices: { input: 4, output: 12, cacheRead: 1, cacheWrite: 4 },
    },
    fallbacks: 'none',
    note: 'Prompts of 200K tokens or more cost twice as much.',
  },
  {
    provider: 'xai',
    id: 'grok-4.3',
    name: 'Grok 4.3',
    summary: 'Cheaper than Grok 4.7, and quicker.',
    prices: { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 1.25 },
    longPrompt: {
      overTokens: 199_999,
      prices: { input: 2.5, output: 5, cacheRead: 0.4, cacheWrite: 2.5 },
    },
    fallbacks: 'none',
    note: 'Prompts of 200K tokens or more cost twice as much.',
  },
] as const satisfies readonly ModelInfo[];

export type ModelId = (typeof MODELS)[number]['id'];

export const INTELLIGENCE_MODELS: readonly (ModelInfo & { id: ModelId })[] =
  MODELS;

export const modelIdSchema = z.enum(
  INTELLIGENCE_MODELS.map((model) => model.id) as [ModelId, ...ModelId[]],
);

export const DEFAULT_MODEL: ModelId = 'claude-opus-5-5';

/**
 * What a workspace drafts with once it brings a provider's key, if the model
 * it had can't run: each provider's balance of judgement and price.
 */
export const PROVIDER_DEFAULT_MODEL: Record<ProviderId, ModelId> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-6.1-sol',
  google: 'gemini-4-argon',
  xai: 'grok-4.7',
};

export function modelInfo(id: ModelId): ModelInfo {
  return INTELLIGENCE_MODELS.find((model) => model.id === id)!;
}

/** The models a provider runs, in the order Settings shows them. */
export const modelsOf = (provider: ProviderId) =>
  INTELLIGENCE_MODELS.filter((model) => model.provider === provider);

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
