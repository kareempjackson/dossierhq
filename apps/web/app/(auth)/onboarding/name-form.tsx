'use client';

import { useActionState, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveName, type SetUpState } from './actions';

/** Someone who was invited: the name their team will see. */
export function NameForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState<SetUpState, FormData>(
    saveName,
    {},
  );
  const id = useId();
  const ids = { name: `${id}-name`, error: `${id}-error` };

  return (
    <form action={action} className="mt-8 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.name} className="text-small font-medium">
          Your name
        </label>
        <Input
          id={ids.name}
          name="name"
          required
          autoFocus
          maxLength={100}
          autoComplete="name"
          defaultValue={defaultName}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? ids.error : undefined}
        />
      </div>

      {state.error && (
        <p id={ids.error} role="alert" className="text-small text-attention">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        variant="act"
        size="lg"
        disabled={pending}
        className="mt-1 w-full"
      >
        {pending ? 'Saving…' : 'Continue'}
      </Button>
    </form>
  );
}
