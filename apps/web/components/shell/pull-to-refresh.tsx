'use client';

import { LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { Mark } from '@/components/brand/logo';
import { cn } from '@/lib/cn';

/** How far to pull before letting go reads the page again, in pixels. */
const THRESHOLD = 72;
const MOST = 110;

/**
 * Pull down from the top of a page to read it again, as a native app does.
 * Only in Dossier installed on a home screen: there's no reload button
 * there, and a browser's own pull-to-refresh would fight this one. Not
 * from inside a sheet or dialog.
 */
export function PullToRefresh() {
  const router = useRouter();
  const installed = useInstalledOnTouch();
  const [pull, setPull] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const pulled = useRef(0);

  useEffect(() => {
    if (!installed) return;
    let startY: number | null = null;
    const set = (distance: number) => {
      pulled.current = distance;
      setPull(distance);
    };
    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null;
      if (
        window.scrollY > 0 ||
        event.touches.length !== 1 ||
        target?.closest('dialog, [data-no-pull]')
      ) {
        return;
      }
      startY = event.touches[0].clientY;
    };
    const onMove = (event: TouchEvent) => {
      if (startY === null) return;
      const delta = event.touches[0].clientY - startY;
      // Resists more the further it goes, as a rubber band would.
      set(delta > 0 && window.scrollY <= 0 ? Math.min(delta * 0.55, MOST) : 0);
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      if (pulled.current >= THRESHOLD) {
        startRefresh(() => router.refresh());
      }
      set(0);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [installed, router]);

  if (!installed) return null;
  const shown = refreshing ? THRESHOLD : pull;
  const ready = pull >= THRESHOLD;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 flex justify-center lg:hidden"
    >
      <span className="sr-only">
        {refreshing ? 'Reading the page again' : ''}
      </span>
      <span
        aria-hidden
        className={cn(
          'grid size-10 place-items-center rounded-full bg-white text-ink shadow-float',
          pull === 0 && 'transition-[translate,opacity] duration-300',
        )}
        style={{
          translate: `0 ${shown - 44}px`,
          opacity: shown === 0 ? 0 : Math.min(1, shown / THRESHOLD + 0.2),
        }}
      >
        {refreshing ? (
          <LoaderCircle
            className="size-5 motion-safe:animate-spin"
            strokeWidth={1.75}
          />
        ) : (
          <Mark
            height={16}
            className={cn('transition-colors', ready && 'text-lilac-deep')}
          />
        )}
      </span>
    </div>
  );
}

const noSubscription = () => () => {};

/** Dossier opened from a home screen, on a touch screen; neither changes. */
function useInstalledOnTouch() {
  return useSyncExternalStore(
    noSubscription,
    () =>
      (window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone ===
          true) &&
      window.matchMedia('(pointer: coarse)').matches,
    () => false,
  );
}
