'use client';

import { useLayoutEffect } from 'react';
import { useAppDispatch } from '@/lib/store/hooks';
import {
  paletteLoaded,
  unreadLoaded,
  type ShellState,
} from '@/lib/store/shell-slice';

/**
 * Hand what the workspace layout read to the browser's store. They render
 * nothing. When the server reads again (after an action refreshes the
 * page), the new values replace the old.
 */

export function UnreadSync({ unread }: { unread: number }) {
  const dispatch = useAppDispatch();
  useLayoutEffect(() => {
    dispatch(unreadLoaded(unread));
  }, [dispatch, unread]);
  return null;
}

export function PaletteSync({ palette }: { palette: ShellState['palette'] }) {
  const dispatch = useAppDispatch();
  // Compared by content: each server render sends a fresh object.
  const key = JSON.stringify(palette);
  useLayoutEffect(() => {
    dispatch(paletteLoaded(JSON.parse(key) as ShellState['palette']));
  }, [dispatch, key]);
  return null;
}
