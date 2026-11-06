'use client';

import { useAppSelector } from '@/lib/store/hooks';
import { selectFirstName } from '@/lib/store/session-slice';

/**
 * The signed-in person's first name, for greetings. Empty until the session
 * is known, so "Welcome, ." never shows: the punctuation goes with it.
 */
export function FirstName({ before = ', ' }: { before?: string }) {
  const name = useAppSelector(selectFirstName);
  return name ? (
    <>
      {before}
      {name}
    </>
  ) : null;
}
