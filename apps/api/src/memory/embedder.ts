import { DEFAULT_EMBEDDING_MODEL } from '@dossierhq/contracts';

/** Nest token for the embedder; null when Dossier has no Voyage AI key. */
export const EMBEDDER = Symbol('EMBEDDER');

/** What a passage is embedded as: stored to be found, or a question looking. */
export type EmbeddingPurpose = 'document' | 'query';

/** Turns text into vectors that are near each other when meanings are. */
export interface Embedder {
  readonly model: string;
  readonly dimensions: number;
  /** One vector per text, in order, and the tokens it cost. */
  embed(
    texts: string[],
    purpose: EmbeddingPurpose,
  ): Promise<{ vectors: number[][]; tokens: number }>;
}

/** Embedding failed; `rateLimited` when Voyage asked to slow down. */
export class EmbedderFailure extends Error {
  override readonly name = 'EmbedderFailure';
  constructor(
    message: string,
    readonly rateLimited = false,
  ) {
    super(message);
  }
}

/** Texts per request: well under Voyage's 1,000. */
const BATCH_TEXTS = 128;
/** Estimated tokens per request: well under voyage-4's 320K. */
const BATCH_TOKENS = 100_000;
/** Characters per token, guessed low so batches stay under the limit. */
const CHARS_PER_TOKEN = 3;
const TRIES = 4;

export type VoyageOptions = {
  url?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Voyage AI, which Anthropic recommends for embeddings: voyage-4 at 1024
 * dimensions. Dossier's own key, for every workspace, so all of a
 * workspace's passages are embedded alike and compare.
 */
export class VoyageEmbedder implements Embedder {
  readonly model = DEFAULT_EMBEDDING_MODEL;
  readonly dimensions = 1024;
  private readonly url: string;
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly key: string,
    options: VoyageOptions = {},
  ) {
    this.url = `${(options.url ?? 'https://api.voyageai.com').replace(/\/+$/, '')}/v1/embeddings`;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? wait;
  }

  async embed(texts: string[], purpose: EmbeddingPurpose) {
    const vectors: number[][] = [];
    let tokens = 0;
    for (const batch of batches(texts)) {
      const reply = await this.request(batch, purpose);
      vectors.push(...reply.vectors);
      tokens += reply.tokens;
    }
    return { vectors, tokens };
  }

  private async request(
    input: string[],
    purpose: EmbeddingPurpose,
  ): Promise<{ vectors: number[][]; tokens: number }> {
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetch(this.url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.key}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            input,
            model: this.model,
            input_type: purpose,
            output_dimension: this.dimensions,
            truncation: true,
          }),
        });
      } catch (error) {
        if (attempt < TRIES) {
          await this.sleep(backoff(attempt));
          continue;
        }
        throw new EmbedderFailure(
          `Couldn’t reach Voyage AI: ${(error as Error).message}`,
        );
      }
      if (response.ok) return this.read(await response.json(), input.length);
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < TRIES) {
        const after = Number(response.headers.get('retry-after'));
        await this.sleep(
          Number.isFinite(after) && after > 0
            ? Math.min(after * 1000, 60_000)
            : backoff(attempt),
        );
        continue;
      }
      const detail = await response
        .json()
        .then((body: unknown) => (body as { detail?: string }).detail)
        .catch(() => undefined);
      throw new EmbedderFailure(
        response.status === 401 || response.status === 403
          ? 'Voyage AI turned down Dossier’s key.'
          : `Voyage AI answered ${response.status}${detail ? `: ${detail}` : ''}.`,
        response.status === 429,
      );
    }
  }

  private read(body: unknown, count: number) {
    const reply = body as {
      data?: { embedding?: number[]; index?: number }[];
      usage?: { total_tokens?: number };
    };
    const data = [...(reply.data ?? [])].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    );
    if (
      data.length !== count ||
      data.some((d) => d.embedding?.length !== this.dimensions)
    ) {
      throw new EmbedderFailure('Voyage AI sent back something unexpected.');
    }
    return {
      vectors: data.map((d) => d.embedding!),
      tokens: reply.usage?.total_tokens ?? 0,
    };
  }
}

const backoff = (attempt: number) => 1000 * 4 ** (attempt - 1);

/** Texts in requests Voyage takes: by count and by rough size. */
export function batches(texts: string[]): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const text of texts) {
    const tokens = Math.ceil(text.length / CHARS_PER_TOKEN);
    if (
      current.length > 0 &&
      (current.length >= BATCH_TEXTS || size + tokens > BATCH_TOKENS)
    ) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(text);
    size += tokens;
  }
  if (current.length > 0) out.push(current);
  return out;
}
