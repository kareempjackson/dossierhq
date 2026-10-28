'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';

/** The workspace's forwarding address, ready to copy. */
export function CopyAddress({ address }: { address: string }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-meta font-medium text-ink">
        Forward to
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={address}
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 w-full min-w-0 rounded-input bg-surface px-3 font-mono text-mono text-ink"
        />
        <Button
          onClick={() =>
            void navigator.clipboard.writeText(address).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
