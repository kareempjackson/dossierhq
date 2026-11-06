'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * While a sync runs, draws the page again every few seconds with the
 * latest from the API, until it finishes. The API has no progress to
 * listen to, so this asks. Renders nothing.
 */
export function RefreshWhileSyncing({ syncing }: { syncing: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!syncing) return;
    const timer = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(timer);
  }, [syncing, router]);
  return null;
}
