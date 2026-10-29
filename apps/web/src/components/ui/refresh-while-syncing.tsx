'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** While a tool syncs, says so and looks again every few seconds. */
export function RefreshWhileSyncing({
  syncing,
  tool,
  className,
}: {
  syncing: boolean;
  /** The tool's name, e.g. "Fathom". */
  tool: string;
  className?: string;
}) {
  return (
    <RefreshWhile
      active={syncing}
      status={`Syncing ${tool}…`}
      className={className}
    />
  );
}

/** While something is under way, says what and looks again every `everyMs`. */
export function RefreshWhile({
  active,
  status,
  everyMs = 2500,
  className,
}: {
  active: boolean;
  /** What's under way, e.g. "Reading Harbour Dental…". */
  status: string;
  everyMs?: number;
  className?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs, router]);

  return (
    <p role="status" className={className}>
      {active ? status : ''}
    </p>
  );
}
