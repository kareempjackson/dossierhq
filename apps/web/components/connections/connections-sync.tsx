'use client';

import { useLayoutEffect } from 'react';
import { useAppDispatch } from '@/lib/store/hooks';
import {
  connectionsFailed,
  connectionsLoaded,
  type ConnectionsData,
} from '@/lib/store/connections-slice';

/**
 * Hands what the server read about the workspace's tools to the browser's
 * store; null when the API couldn't be reached. Each refresh sends a new
 * one, which replaces the last in place. Renders nothing.
 */
export function ConnectionsSync({ data }: { data: ConnectionsData | null }) {
  const dispatch = useAppDispatch();
  // Compared by content: each server render sends a fresh object.
  const key = JSON.stringify(data);
  useLayoutEffect(() => {
    const parsed = JSON.parse(key) as ConnectionsData | null;
    dispatch(parsed ? connectionsLoaded(parsed) : connectionsFailed());
  }, [dispatch, key]);
  return null;
}
