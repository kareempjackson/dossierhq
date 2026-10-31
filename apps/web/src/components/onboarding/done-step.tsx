'use client';

import { TOOL_NAMES, type Tool } from '@dossierhq/contracts';
import { ArrowRight, Check, Minus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { finishOnboarding } from '@/app/onboarding-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import {
  StepError,
  StepFooter,
  StepHeader,
  type StepProps,
} from './step-parts';

export type SummaryLine = { label: string; done: boolean };

/**
 * The end: what was set up, then on into Dossier. Finishing is what tells
 * the API onboarding is done; it says no while two-factor is off.
 */
export function DoneStep({
  back,
  firstName,
  summary,
  tool,
  canConnect,
  onTwoFactorMissing,
}: Pick<StepProps, 'back'> & {
  firstName: string;
  summary: SummaryLine[];
  /** The first tool they said they use, to connect first. */
  tool: Tool | null;
  /** Owners and admins connect tools; others go straight in. */
  canConnect: boolean;
  /** Finishing failed because two-factor is off: go back to it. */
  onTwoFactorMissing: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [going, setGoing] = useState<string | null>(null);

  function finish(next: string) {
    setError(null);
    setGoing(next);
    startTransition(async () => {
      const result = await finishOnboarding(next);
      // On success the action redirects, so only a refusal comes back.
      if (!result.ok) {
        setError(result.error);
        setGoing(null);
        if (/two-factor/i.test(result.error)) onTwoFactorMissing();
      }
    });
  }

  return (
    <div>
      <span className="mb-6 grid size-14 place-items-center rounded-full bg-brand text-white shadow-glow motion-safe:animate-pop">
        <Check aria-hidden className="size-7" strokeWidth={2.5} />
      </span>
      <StepHeader eyebrow="All set" title={`You’re ready, ${firstName}`}>
        {!canConnect
          ? 'Dossier shows what needs attention at each client, with the record behind every line.'
          : tool
            ? `Connect ${TOOL_NAMES[tool]} next and Dossier starts reading: what needs attention at each client shows up within minutes.`
            : 'Connect a tool next and Dossier starts reading: what needs attention at each client shows up within minutes.'}
      </StepHeader>

      <ul className="mt-8 flex flex-col divide-y divide-hairline rounded-tile ring-1 ring-hairline ring-inset">
        {summary.map((line) => (
          <li key={line.label} className="flex items-center gap-3 px-4 py-3">
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full',
                line.done ? 'bg-brand text-white' : 'bg-surface text-muted',
              )}
            >
              {line.done ? (
                <Check aria-hidden className="size-3" strokeWidth={3} />
              ) : (
                <Minus aria-hidden className="size-3" strokeWidth={3} />
              )}
            </span>
            <span
              className={cn('text-body', line.done ? 'text-ink' : 'text-muted')}
            >
              <span className="sr-only">
                {line.done ? 'Done: ' : 'Skipped: '}
              </span>
              {line.label}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <StepError message={error} />
      </div>

      <StepFooter back={back}>
        <Button
          variant={canConnect ? 'ghost' : 'primary'}
          disabled={pending}
          onClick={() => finish('/')}
        >
          {going === '/' ? 'Opening…' : 'Go to Dossier'}
        </Button>
        {canConnect && (
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              finish(tool ? `/connections#tool-${tool}` : '/connections')
            }
          >
            {going && going !== '/'
              ? 'Opening…'
              : tool
                ? `Connect ${TOOL_NAMES[tool]}`
                : 'Connect a tool'}
            <ArrowRight aria-hidden />
          </Button>
        )}
      </StepFooter>
    </div>
  );
}
