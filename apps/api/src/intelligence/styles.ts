import type { ExecutiveBrief } from '@dossierhq/contracts';
import { z } from 'zod';
import { oneLine } from '../integrations/ids.js';

/** The fewest words in a row that count as copying an internal note. */
const COPIED_WORDS = 8;
/** The most lines an executive version keeps under its headline. */
const MAX_POINTS = 4;

/** What a model writes for an executive version. */
export const executiveOutputSchema = z.object({
  headline: z
    .string()
    .describe(
      'The point in one plain line, for leadership rather than engineers.',
    ),
  points: z
    .array(z.string())
    .describe(
      'Two to four short lines: what it means for the business and what happens if it is left, what is recommended, and how disruptive it is.',
    ),
  decision: z
    .string()
    .nullable()
    .describe(
      'What they are asked to decide or approve, and by when; null (not the word "None") when nothing is needed from them.',
    ),
});
export type ExecutiveOutput = z.infer<typeof executiveOutputSchema>;

/** Words a model writes when it means there's nothing to say. */
const NOTHING =
  /^(none|n\/?a|null|nil|nothing|not applicable|no decision( is)? needed|-+)\.?$/i;

/** Handles a model left in its words, e.g. "(E1)" or "[S3, S7]". */
const HANDLES = /\s*[[(]\s*(?:[ESW]\d+\s*,?\s*)+[\])]/g;

/** Text without the record handles a model cited inline. */
export const withoutHandles = (text: string) => text.replace(HANDLES, '');

/**
 * One tidy line, or null when it's empty or only says there's nothing
 * (models sometimes write "None" where they mean null). Handles cited
 * inline go: citations live beside the words, not in them.
 */
export function lineOrNull(
  text: string | null | undefined,
  max: number,
): string | null {
  const line = oneLine(withoutHandles(text ?? ''), max);
  return line && !NOTHING.test(line) ? line : null;
}

/** A text's words, lowercased, without accents or punctuation. */
function wordsOf(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Every run of `COPIED_WORDS` words in a row. */
function runsOf(text: string): string[] {
  const words = wordsOf(text);
  const runs: string[] = [];
  for (let i = 0; i + COPIED_WORDS <= words.length; i++) {
    runs.push(words.slice(i, i + COPIED_WORDS).join(' '));
  }
  return runs;
}

/**
 * Whether any of `texts` repeats eight or more words in a row from one of
 * the MSP's internal notes. Paraphrase gets past it; the prompt and the
 * review before anything is copied out are the other guards.
 */
export function leaksInternal(texts: string[], internal: string[]): boolean {
  if (internal.length === 0) return false;
  const copied = new Set(internal.flatMap(runsOf));
  if (copied.size === 0) return false;
  return texts.some((text) => runsOf(text).some((run) => copied.has(run)));
}

/** The lines of an executive version, as a reader sees them. */
export const briefLines = (brief: ExecutiveBrief): string[] => [
  brief.headline,
  ...brief.points,
  ...(brief.decision ? [brief.decision] : []),
];

/**
 * A model's executive version, tidied. Null when it says nothing, or when it
 * copies an internal note: it may be sent to the client as written.
 */
export function executiveBrief(
  written: ExecutiveOutput | undefined,
  internal: string[] = [],
): ExecutiveBrief | null {
  if (!written) return null;
  const headline = oneLine(written.headline, 200);
  if (!headline) return null;
  const brief: ExecutiveBrief = {
    headline,
    points: written.points
      .flatMap((point) => lineOrNull(point, 400) ?? [])
      .slice(0, MAX_POINTS),
    decision: lineOrNull(written.decision, 300),
  };
  return leaksInternal(briefLines(brief), internal) ? null : brief;
}
