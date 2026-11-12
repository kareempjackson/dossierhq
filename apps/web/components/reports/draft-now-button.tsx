'use client';

import { Sparkles } from 'lucide-react';
import { useActionState } from 'react';
import {
  draftReportsNow,
  type DraftState,
} from '@/app/(workspace)/reports/actions';
import { Button } from '@/components/ui/button';
import { BusyIcon } from '@/components/ui/spinner';

/**
 * Drafts every client's report now instead of waiting for the schedule.
 * Approved and skipped reports for the week stay as they are.
 */
export function DraftNowButton() {
  const [state, action, pending] = useActionState<DraftState>(
    draftReportsNow,
    {},
  );
  return (
    <form action={action} className="flex items-center gap-3">
      {state.error && (
        <p role="alert" className="text-[0.75rem] text-attention">
          {state.error}
        </p>
      )}
      {state.drafted !== undefined && !pending && (
        <p role="status" className="text-[0.75rem] text-healthy">
          {state.drafted === 1
            ? 'Drafted 1 report.'
            : `Drafted ${state.drafted} reports.`}
        </p>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <BusyIcon icon={Sparkles} busy={pending} />
        Draft reports now
      </Button>
    </form>
  );
}
