'use client';

import { useActionState, useId } from 'react';
import {
  subscribeToUpdates,
  type UpdatesState,
} from '@/app/(marketing)/actions';
import { Button } from '@/components/ui/button';

/** The footer's product-updates sign-up. */
export function UpdatesForm() {
  const [state, action, pending] = useActionState<UpdatesState, FormData>(
    subscribeToUpdates,
    {},
  );
  const id = useId();
  return (
    <form action={action} className="flex w-full max-w-md flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${id}-email`} className="sr-only">
          Work email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Work email"
          className="h-10 min-w-0 flex-1 basis-48 border-b border-paper/20 bg-transparent text-small text-paper outline-none placeholder:text-paper/50 focus-visible:border-lime"
        />
        <Button type="submit" variant="act" disabled={pending}>
          {pending ? 'Signing you up…' : 'Get product updates'}
        </Button>
      </div>
      {state.message && (
        <p role="status" className="text-[0.75rem] text-paper/70">
          {state.message}
        </p>
      )}
    </form>
  );
}
