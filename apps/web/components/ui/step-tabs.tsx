import { cn } from '@/lib/cn';

/**
 * Where someone is in a short flow, as folder tabs on a shelf: the current
 * step lime, finished steps ticked, the rest grey.
 */
export function StepTabs({
  steps,
  current,
}: {
  steps: readonly string[];
  current: number;
}) {
  return (
    <ol
      aria-label="Steps"
      className="flex flex-wrap items-end gap-1.5 border-b-[3px] border-grey-2"
    >
      {steps.map((label, index) => {
        const done = index < current;
        return (
          <li
            key={label}
            aria-current={index === current ? 'step' : undefined}
            className={cn(
              'rounded-t-lg px-3 py-1.5 text-small whitespace-nowrap',
              index === current && 'bg-lime text-ink',
              done && 'bg-grey-3 text-ink',
              index > current && 'bg-grey-2 text-muted',
            )}
          >
            <span className="sr-only">Step {index + 1}: </span>
            <span aria-hidden>{done ? '✓' : index + 1}</span> {label}
            {done && <span className="sr-only"> (done)</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Signing up: this page, the email, then setting up the workspace. */
export const SIGN_UP_STEPS = [
  'Create account',
  'Confirm email',
  'Set up',
] as const;
