'use client';

import { useLayoutEffect } from 'react';
import { useAppDispatch } from '@/lib/store/hooks';
import { sessionCleared } from '@/lib/store/session-slice';

/**
 * On the sign-in page nobody is signed in, so the browser's store forgets
 * whoever was: after signing out, or when a session ran out. The next
 * person's workspace then opens on a placeholder, never the last one's name.
 * Renders nothing.
 *
 * Forgetting here, not when Sign out is pressed, keeps the name in place
 * while the session ends.
 */
export function ForgetSession() {
  const dispatch = useAppDispatch();
  useLayoutEffect(() => {
    dispatch(sessionCleared());
  }, [dispatch]);
  return null;
}
