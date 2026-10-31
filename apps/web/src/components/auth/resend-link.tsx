'use client';

import { useActionState, useEffect, useState } from 'react';
import { resendSignUpLink, type ResendState } from '@/app/auth-actions';
import { Button } from '@/components/ui/button';

/** How long to wait before offering another link. */
const WAIT_SECONDS = 30;

/**
 * Sends the sign-up link again: to `email`, or without one to the address
 * this browser signed up with. Waits a little between sends.
 */
export function ResendLink({
  email,
  className,
}: {
  email?: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState<ResendState, FormData>(
    resendSignUpLink,
    {},
  );
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!state.sentAt) return;
    const tick = () =>
      setLeft(
        Math.max(
          0,
          WAIT_SECONDS - Math.floor((Date.now() - state.sentAt!) / 1000),
        ),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [state.sentAt]);

  return (
    <form action={action} className={className}>
      {email && <input type="hidden" name="email" value={email} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="submit" disabled={pending || left > 0}>
          {pending
            ? 'Sending…'
            : left > 0
              ? `Send again in ${left}s`
              : 'Send the link again'}
        </Button>
        <p role="status" className="text-meta text-muted">
          {state.sentAt && !pending ? 'A new link is on its way.' : ''}
        </p>
      </div>
      {state.error && (
        <p role="alert" className="mt-2 text-meta text-alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
