'use client';

import { useCallback, useState } from 'react';
import { markAllRead, markRead } from '@/app/(workspace)/notifications/actions';
import { useAppDispatch, useAppStore } from '@/lib/store/hooks';
import { notificationsMarkedRead, unreadLoaded } from '@/lib/store/shell-slice';

/**
 * Marks notifications read: at once on screen (the list and the bell's
 * badge, through the store), then with the API. If the API says no, the
 * count goes back and the reason shows.
 */
export function useMarkRead() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (which: string[] | 'all', stay: boolean) => {
      const before = store.getState().shell.unread;
      setError(null);
      dispatch(notificationsMarkedRead(which));
      const result =
        which === 'all' ? await markAllRead() : await markRead(which, stay);
      if (!result.ok) {
        if (before !== null) dispatch(unreadLoaded(before));
        setError(result.error);
      }
    },
    [dispatch, store],
  );

  return { mark: run, error };
}
