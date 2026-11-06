'use client';

import { useActionState } from 'react';
import { draftReportsNow, type FormState } from '@/app/(workspace)/actions';
import { Button } from '@/components/ui/button';

/** Drafts every client's report now instead of waiting for Monday. */
export function DraftNowButton() {
  const [state, action, pending] = useActionState<FormState, FormData>(
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
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? 'Drafting…' : 'Draft reports now'}
      </Button>
    </form>
  );
}
