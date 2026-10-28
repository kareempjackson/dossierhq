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
  const router = useRouter();

  useEffect(() => {
    if (!syncing) return;
    const timer = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(timer);
  }, [syncing, router]);

  return (
    <p role="status" className={className}>
      {syncing ? `Syncing ${tool}…` : ''}
    </p>
  );
}
