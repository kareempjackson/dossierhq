'use client';

import type { ProgressWatch } from '@dossierhq/contracts';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** How soon the first look is, and how soon the next after something moved. */
const FIRST_MS = 2_500;
const AFTER_CHANGE_MS = 5_000;
/** Looks slow down to this while nothing moves. */
const SLOWEST_MS = 10_000;

/**
 * While a sync runs, asks the API every few seconds where it stands, and
 * draws the page again when that has changed or the work is over. The
 * question costs a few bytes; drawing the page costs every request the
 * page makes, so it happens only when there's something new to show.
 * Waits longer while nothing moves, and not at all in a hidden tab.
 * Renders nothing.
 */
export function RefreshWhileSyncing({
  syncing,
  watch,
  id,
}: {
  syncing: boolean;
  /** What the page is waiting on. */
  watch: ProgressWatch;
  /** The answer, for `ask`. */
  id?: string;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!syncing) return;
    const url = `/progress?watch=${watch}${id ? `&id=${encodeURIComponent(id)}` : ''}`;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seen: string | null = null;
    let wait = FIRST_MS;

    const look = async () => {
      if (stopped) return;
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (stopped) return;
        if (res.ok) {
          const { busy, stamp } = (await res.json()) as {
            busy: boolean;
            stamp: string;
          };
          // Over, though the page still shows it under way; or moved on.
          if (!busy || (seen !== null && stamp !== seen)) {
            router.refresh();
            wait = AFTER_CHANGE_MS;
          } else {
            wait = Math.min(wait * 1.5, SLOWEST_MS);
          }
          seen = stamp;
        }
      } catch {
        // Offline, or the API is away: ask again later.
        wait = SLOWEST_MS;
      }
      if (!stopped) timer = setTimeout(look, wait);
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      wait = FIRST_MS;
      void look();
    };

    timer = setTimeout(look, wait);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [syncing, watch, id, router]);
  return null;
}
