import { describe, expect, it } from 'vitest';
import { batches, EmbedderFailure, VoyageEmbedder } from './embedder.js';

const vector = (n: number) => Array.from({ length: 1024 }, () => n);

function fakeVoyage(answers: ((body: { input: string[] }) => Response)[]) {
  const requests: {
    url: string;
    headers: Headers;
    body: Record<string, unknown>;
  }[] = [];
  const slept: number[] = [];
  let call = 0;
  const embedder = new VoyageEmbedder('voyage-key', {
    url: 'https://voyage.example/',
    sleep: async (ms) => {
      slept.push(ms);
    },
    fetch: (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requests.push({ url, headers: new Headers(init.headers), body });
      return answers[Math.min(call++, answers.length - 1)]!(body);
    }) as unknown as typeof fetch,
  });
  return { embedder, requests, slept };
}

const ok = ({ input }: { input: string[] }) =>
  Response.json({
    object: 'list',
    // Out of order on purpose: Voyage says which is which by index.
    data: input
      .map((_, index) => ({
        object: 'embedding',
        embedding: vector(index),
        index,
      }))
      .reverse(),
    model: 'voyage-4',
    usage: { total_tokens: input.length * 10 },
  });

describe('VoyageEmbedder', () => {
  it('asks for 1024-dimension voyage-4 vectors, in order', async () => {
    const { embedder, requests } = fakeVoyage([ok]);
    const reply = await embedder.embed(['first', 'second'], 'query');
    expect(reply.tokens).toBe(20);
    expect(reply.vectors.map((v) => v[0])).toEqual([0, 1]);
    expect(requests[0]!.url).toBe('https://voyage.example/v1/embeddings');
    expect(requests[0]!.headers.get('authorization')).toBe('Bearer voyage-key');
    expect(requests[0]!.body).toEqual({
      input: ['first', 'second'],
      model: 'voyage-4',
      input_type: 'query',
      output_dimension: 1024,
      truncation: true,
    });
  });

  it('waits and tries again when told to slow down', async () => {
    const { embedder, slept } = fakeVoyage([
      () =>
        new Response('{}', { status: 429, headers: { 'retry-after': '2' } }),
      () => new Response('{}', { status: 503 }),
      ok,
    ]);
    await expect(embedder.embed(['text'], 'document')).resolves.toMatchObject({
      tokens: 10,
    });
    expect(slept).toEqual([2000, 4000]);
  });

  it('says plainly when the key is refused or the answer is wrong', async () => {
    const refused = fakeVoyage([() => new Response('{}', { status: 401 })]);
    await expect(refused.embedder.embed(['x'], 'document')).rejects.toThrow(
      'Voyage AI turned down Dossier’s key.',
    );
    const busy = fakeVoyage([() => new Response('{}', { status: 429 })]);
    const failure = await busy.embedder
      .embed(['x'], 'document')
      .catch((e) => e);
    expect(failure).toBeInstanceOf(EmbedderFailure);
    expect(failure.rateLimited).toBe(true);
    const short = fakeVoyage([
      () =>
        Response.json({
          data: [{ embedding: [1, 2, 3], index: 0 }],
          usage: { total_tokens: 1 },
        }),
    ]);
    await expect(short.embedder.embed(['x'], 'document')).rejects.toThrow(
      'unexpected',
    );
  });

  it('sends at most 128 texts and about 100K tokens at once', () => {
    expect(
      batches(Array.from({ length: 300 }, () => 'x')).map((b) => b.length),
    ).toEqual([128, 128, 44]);
    // About 80K tokens each: two don't fit together; a short one joins in.
    const long = 'y'.repeat(240_000);
    expect(batches([long, long, 'z']).map((b) => b.length)).toEqual([1, 2]);
  });
});
