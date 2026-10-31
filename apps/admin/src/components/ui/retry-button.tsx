'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from './button';

/** Re-requests the page's data without a full reload. */
export function RetryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="h-8 px-3 text-meta"
    >
      {pending ? 'Trying…' : 'Try again'}
    </Button>
  );
}
