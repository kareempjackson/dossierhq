'use client';

import Link from 'next/link';
import { useActionState, useId } from 'react';
import {
  subscribeToUpdates,
  type UpdatesState,
} from '@/app/(marketing)/actions';
import { Button } from '@/components/ui/button';
import { LEGAL_EMAIL } from './legal-placeholder';

/**
 * The footer's product-updates sign-up. It keeps the address, the page and
 * the time, and says so under the box.
 */
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
          // React resets the form after it's sent; an error keeps what was typed.
          defaultValue={state.email}
          key={state.email ?? ''}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={`${id}-consent`}
          className="h-10 min-w-0 flex-1 basis-48 border-b border-paper/20 bg-transparent text-small text-paper outline-none placeholder:text-paper/50 focus-visible:border-lime"
        />
        <Button type="submit" variant="act" disabled={pending}>
          {pending ? 'Signing you up…' : 'Get product updates'}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-[0.75rem] text-attention-soft">
          {state.error}
        </p>
      )}
      {state.done && !pending && (
        <p role="status" className="text-[0.75rem] text-lime">
          Thanks, you’re on the list.
        </p>
      )}
      <p id={`${id}-consent`} className="text-[0.75rem] text-paper/60">
        Only news about Dossier. We keep your email, the page and when; see{' '}
        <Link href="/privacy" className="rounded-sm underline">
          Privacy
        </Link>
        . To be taken off, email {LEGAL_EMAIL}.
      </p>
    </form>
  );
}
