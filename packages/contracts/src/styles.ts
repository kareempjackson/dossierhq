import { z } from 'zod';

/**
 * How Dossier writes up what it drafts. Each draft comes in both styles,
 * from the same model call and the same records, and a switch picks which
 * one people read:
 * - technical: for a senior engineer at the MSP who will do the work;
 * - executive: for the client's leadership (an owner, CEO, CFO or practice
 *   manager), in plain words they could be sent as written.
 */
export const WRITING_STYLES = ['technical', 'executive'] as const;
export const writingStyleSchema = z.enum(WRITING_STYLES);
export type WritingStyle = z.infer<typeof writingStyleSchema>;

export const STYLE_NAMES: Record<WritingStyle, string> = {
  technical: 'Technical',
  executive: 'Executive',
};

/** What people read until they or their workspace choose otherwise. */
export const DEFAULT_WRITING_STYLE: WritingStyle = 'technical';

/** The cookie that remembers which style each person reads. */
export const WRITING_STYLE_COOKIE = 'dossier-style';

/**
 * The executive version of something Dossier drafted, written for a
 * client's leadership: what it means for the business, what is recommended,
 * and the decision needed. It rests on the same records as the technical
 * version, so it carries no citations of its own.
 */
export const executiveBriefSchema = z.object({
  /** The point in one plain line. */
  headline: z.string(),
  /** Two to four short lines: impact, what we recommend, disruption. */
  points: z.array(z.string()),
  /** What the reader is asked to decide or approve, and by when. */
  decision: z.string().nullable(),
});
export type ExecutiveBrief = z.infer<typeof executiveBriefSchema>;

/** An executive version as someone edits it. */
export const executiveBriefUpdateSchema = z.object({
  headline: z
    .string()
    .trim()
    .min(1, 'Headline is required')
    .max(200, 'Keep the headline to 200 characters'),
  points: z
    .array(
      z.string().trim().min(1).max(400, 'Keep each point to 400 characters'),
    )
    .max(6, 'Keep it to 6 points or fewer'),
  decision: z
    .string()
    .trim()
    .max(300, 'Keep the decision to 300 characters')
    .nullable()
    .transform((decision) => decision || null),
});
export type ExecutiveBriefUpdate = z.input<typeof executiveBriefUpdateSchema>;

/** Plain text to paste into an email to the client's leadership. */
export function briefText(brief: ExecutiveBrief): string {
  return [
    brief.headline,
    ...(brief.points.length > 0
      ? ['', ...brief.points.map((p) => `- ${p}`)]
      : []),
    ...(brief.decision ? ['', `Decision needed: ${brief.decision}`] : []),
  ].join('\n');
}
