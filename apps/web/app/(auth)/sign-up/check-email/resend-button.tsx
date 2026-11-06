'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { resendSignUpLink, type ResendState } from '../../actions';

/** How long to wait before offering another link. */
const WAIT_SECONDS = 30;

/** Sends the link again to the address this browser signed up with. */
export function ResendButton() {
  const [state, action, pending] = useActionState<ResendState, FormData>(
    resendSignUpLink,
    {},
  );
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!state.sentAt) return;
    const sentAt = state.sentAt;
    const tick = () =>
      setLeft(
        Math.max(0, WAIT_SECONDS - Math.floor((Date.now() - sentAt) / 1000)),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [state.sentAt]);

  return (
    <form action={action} className="contents">
      <Button type="submit" variant="outline" disabled={pending || left > 0}>
        {pending
          ? 'Sending…'
          : left > 0
            ? `Resend in ${left}s`
            : 'Resend the link'}
      </Button>
      <p role="status" className="w-full text-small text-muted empty:hidden">
        {state.sentAt && !pending ? 'A new link is on its way.' : ''}
      </p>
      {state.error && (
        <p role="alert" className="w-full text-small text-attention">
          {state.error}
        </p>
      )}
    </form>
  );
}
