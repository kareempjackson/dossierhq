import type { Embedder, EmbeddingPurpose } from '../src/memory/embedder.js';

/** A word's slot among the 1024 dimensions. */
function slotOf(word: string): number {
  let hash = 2166136261;
  for (let i = 0; i < word.length; i++) {
    hash ^= word.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 1024;
}

/** Text as a unit vector of its words: texts that share words point alike. */
export function vectorOf(text: string): number[] {
  const vector = Array.from({ length: 1024 }, () => 0);
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word.length > 2) vector[slotOf(word)]! += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}

/**
 * Stands in for Voyage in tests: no network, deterministic, and word
 * overlap is similarity. Counts its calls.
 */
export class HashingEmbedder implements Embedder {
  readonly model = 'voyage-4';
  readonly dimensions = 1024;
  readonly calls: { texts: string[]; purpose: EmbeddingPurpose }[] = [];

  async embed(texts: string[], purpose: EmbeddingPurpose) {
    this.calls.push({ texts, purpose });
    return {
      vectors: texts.map(vectorOf),
      tokens: texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0),
    };
  }

  /** Texts embedded as documents, across every call. */
  get documents(): string[] {
    return this.calls
      .filter((call) => call.purpose === 'document')
      .flatMap((call) => call.texts);
  }
}
