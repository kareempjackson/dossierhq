import 'server-only';
import {
  DEFAULT_WRITING_STYLE,
  WRITING_STYLE_COOKIE,
  writingStyleSchema,
  type WritingStyle,
} from '@dossierhq/contracts';
import { cookies } from 'next/headers';
import { getIntelligencePreferences } from './intelligence';

/**
 * Which version of Dossier's drafts someone reads: the one they last
 * picked, else their workspace's default, else technical.
 */
export async function readingStyle(): Promise<WritingStyle> {
  const picked = writingStyleSchema.safeParse(
    (await cookies()).get(WRITING_STYLE_COOKIE)?.value,
  );
  if (picked.success) return picked.data;
  const preferences = await getIntelligencePreferences().catch(() => null);
  return preferences?.style.default ?? DEFAULT_WRITING_STYLE;
}
