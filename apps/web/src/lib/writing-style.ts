import 'server-only';
import {
  DEFAULT_WRITING_STYLE,
  WRITING_STYLE_COOKIE,
  writingStyleSchema,
  type WritingStyle,
} from '@dossierhq/contracts';
import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { getIntelligence } from '@/lib/data';

/**
 * The version of Dossier's drafts this person reads: the one they last
 * chose, or their workspace's default until they choose. Sections that show
 * drafts start in it; the switch takes over on the page.
 */
export const readingStyle = cache(async (): Promise<WritingStyle> => {
  const chosen = writingStyleSchema.safeParse(
    (await cookies()).get(WRITING_STYLE_COOKIE)?.value,
  ).data;
  if (chosen) return chosen;
  try {
    return (await getIntelligence()).preferences.style.default;
  } catch (error) {
    // Signing in again goes through; anything else reads the default.
    unstable_rethrow(error);
    return DEFAULT_WRITING_STYLE;
  }
});
