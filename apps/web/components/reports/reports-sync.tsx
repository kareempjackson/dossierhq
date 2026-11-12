'use client';

import { useLayoutEffect } from 'react';
import type { ReportsData } from '@/lib/report-views';
import { useAppDispatch } from '@/lib/store/hooks';
import { reportsFailed, reportsLoaded } from '@/lib/store/reports-slice';

/**
 * Hands what the server read for the Reports tabs to the browser's store;
 * null when the API couldn't be reached. Each refresh sends a new one,
 * which replaces the last in place. Renders nothing.
 */
export function ReportsSync({ data }: { data: ReportsData | null }) {
  const dispatch = useAppDispatch();
  // Compared by content: each server render sends a fresh object.
  const key = JSON.stringify(data);
  useLayoutEffect(() => {
    const parsed = JSON.parse(key) as ReportsData | null;
    dispatch(parsed ? reportsLoaded(parsed) : reportsFailed());
  }, [dispatch, key]);
  return null;
}
