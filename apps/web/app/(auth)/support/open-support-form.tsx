'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { openSupportView, type SupportViewState } from '../actions';

/**
 * Swaps the one-time link for the support view's session and opens the
 * workspace. A link that can't be used again says so, and the button goes.
 */
export function OpenSupportForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<SupportViewState, FormData>(
    openSupportView,
    {},
  );

  if (state.spent) {
    return (
      <p
        role="alert"
        className="mt-8 rounded-xl bg-attention-soft px-4 py-3 text-small text-attention"
      >
        {state.error}
      </p>
    );
  }

  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p role="alert" className="text-small text-attention">
          {state.error}
        </p>
      )}
      <Button
        type="submit"
        variant="act"
        size="lg"
        disabled={pending}
        className="w-full"
      >
        {pending ? 'Opening…' : 'Open the support view'}
      </Button>
      <p className="text-small text-muted">
        The link works once, within two minutes of opening it in Dossier Admin.
        It replaces any Dossier session in this browser.
      </p>
    </form>
  );
}
