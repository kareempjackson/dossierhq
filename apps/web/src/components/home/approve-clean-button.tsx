'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Approves every clean report in one go. UI only for now: the approved state
 * lives in this component until the reports API exists.
 */
export function ApproveCleanButton({ count }: { count: number }) {
  const [approved, setApproved] = useState(false);

  if (approved) {
    return (
      <span className="flex items-center gap-1">
        <span
          role="status"
          className="inline-flex h-9 items-center gap-1.5 px-2 text-body font-medium text-brand-deep"
        >
          <Check aria-hidden className="size-4" strokeWidth={2} />
          {count} approved
        </span>
        <Button variant="ghost" onClick={() => setApproved(false)}>
          Undo
        </Button>
      </span>
    );
  }

  return (
    <Button variant="primary" onClick={() => setApproved(true)}>
      Approve {count} clean
    </Button>
  );
}
