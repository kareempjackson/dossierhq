'use client';

import { useState, useTransition } from 'react';
import { TwoFactorSetup } from '@/components/auth/two-factor-setup';
import { Button } from '@/components/ui/button';
import { finishOnboarding } from '../actions';

const TOOL_NAMES: Record<string, string> = {
  '/connections/ninjaone': 'NinjaOne',
  '/connections/hudu': 'Hudu',
};

/**
 * Two-factor sign-in, then finishing: saving the recovery codes finishes
 * setting up and goes on to `next` (the first tool's connect page, or home).
 */
export function FinishSetUp({
  email,
  available,
  enabled,
  next,
}: {
  email: string;
  /** False until the API can check codes (it needs CONNECTOR_SECRET_KEY). */
  available: boolean;
  enabled: boolean;
  next: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tool = TOOL_NAMES[next];
  const label = tool ? `Finish and connect ${tool}` : 'Finish';

  function finish() {
    setError(null);
    startTransition(async () => {
      const result = await finishOnboarding(next);
      if (result.error) setError(result.error);
    });
  }

  const finishButton = (
    <>
      {error && (
        <p role="alert" className="text-small text-attention">
          {error}
        </p>
      )}
      <Button
        variant="act"
        size="lg"
        disabled={pending}
        onClick={finish}
        className="w-full"
      >
        {pending ? 'Finishing…' : label}
      </Button>
    </>
  );

  if (!available || enabled) {
    return (
      <div className="mt-8 flex flex-col gap-5">
        <p className="rounded-xl bg-grey-1 px-4 py-3 text-small text-muted">
          {enabled
            ? 'Two-factor sign-in is on. Signing in asks for a code from your app as well as your password.'
            : 'This Dossier server can’t do two-factor sign-in yet. You can turn it on in Settings once it can.'}
        </p>
        {finishButton}
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-5">
      {error ? (
        // The codes are saved and it's on; only finishing went wrong.
        finishButton
      ) : (
        <TwoFactorSetup
          email={email}
          savedLabel={pending ? 'Finishing…' : label}
          onSaved={finish}
        />
      )}
    </div>
  );
}
