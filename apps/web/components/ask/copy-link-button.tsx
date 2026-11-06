'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/** Copies the full address of `path`, and says so for two seconds. */
export function CopyLinkButton({
  path,
  className,
}: {
  path: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            new URL(path, window.location.origin).href,
          );
          setCopied(true);
        } catch {
          // Clipboard blocked (an insecure page, or permission refused): nothing to show.
        }
      }}
      className={cn(
        'min-w-[4.5rem] rounded-sm text-right text-small font-medium',
        className,
      )}
    >
      <span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span>
    </button>
  );
}
