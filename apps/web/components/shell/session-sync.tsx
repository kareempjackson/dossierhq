'use client';

import { useLayoutEffect } from 'react';
import type { SessionMe } from '@/lib/session-me';
import { useAppDispatch } from '@/lib/store/hooks';
import { sessionLoaded } from '@/lib/store/session-slice';

/**
 * Hands the session the server read to the browser's store. Renders
 * nothing. When the server reads it again (after an action refreshes the
 * page), the new one replaces the old.
 */
export function SessionSync({ me }: { me: SessionMe }) {
  const dispatch = useAppDispatch();
  // Compared by content: each server render sends a fresh object.
  const key = JSON.stringify(me);
  useLayoutEffect(() => {
    dispatch(sessionLoaded(JSON.parse(key) as SessionMe));
  }, [dispatch, key]);
  return null;
}
