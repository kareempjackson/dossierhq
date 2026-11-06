'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Copies the forwarding address, and says so for two seconds. */
export function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant="ink"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setCopied(true);
        } catch {
          // Clipboard blocked: the address is on screen to copy by hand.
        }
      }}
    >
      <span aria-live="polite">{copied ? 'Copied' : 'Copy address'}</span>
    </Button>
  );
}
