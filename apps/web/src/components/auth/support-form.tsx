'use client';

import { useActionState } from 'react';
import { redeemSupport, type SupportState } from '@/app/auth-actions';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

/**
 * Opens a support view with a button, not on page load, so a link checker
 * or a chat app's preview can't use up the one-time link.
 */
export function SupportForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<SupportState, FormData>(
    redeemSupport,
    {},
  );
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <div role="alert" className="rounded-tile bg-alert-soft px-4 py-3">
          <StatusDot
            tone="failure"
            label={state.error}
            className="text-meta text-ink"
          />
        </div>
      )}
      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        className="h-10 w-full"
      >
        {pending ? 'Opening…' : 'Open the support view'}
      </Button>
    </form>
  );
}
