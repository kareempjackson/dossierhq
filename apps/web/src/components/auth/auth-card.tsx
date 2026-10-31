import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type AuthCardProps = {
  title: string;
  description: string;
  /** The way across to the other page, under the card. */
  footer: ReactNode;
  /** For longer forms. */
  wide?: boolean;
  children: ReactNode;
};

/** Sign-in and sign-up: the wordmark back to the start, then one card on the ground. */
export function AuthCard({
  title,
  description,
  footer,
  wide = false,
  children,
}: AuthCardProps) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className={cn('w-full', wide ? 'max-w-md' : 'max-w-sm')}>
        <p className="mb-6 text-center">
          <Link
            href="/"
            className="rounded-row text-wordmark font-semibold text-ink"
          >
            Dossier
          </Link>
        </p>
        <div className="rounded-card bg-sheet p-6 shadow-sheet sm:p-8">
          <h1 className="text-title-compact">{title}</h1>
          <p className="mt-2 text-text">{description}</p>
          {children}
        </div>
        <p className="mt-6 text-center text-meta text-muted-on-ground">
          {footer}
        </p>
      </div>
    </main>
  );
}

const SIGN_UP_STEPS = ['Create account', 'Confirm email', 'Set up'] as const;

/** Where someone is on the way in: account, email, then onboarding. */
export function SignUpSteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol aria-label="Getting started" className="mt-5 flex items-center gap-2">
      {SIGN_UP_STEPS.map((step, index) => (
        <li
          key={step}
          aria-current={index === current ? 'step' : undefined}
          className="flex min-w-0 flex-1 flex-col gap-1.5"
        >
          <span
            aria-hidden
            className={cn(
              'h-1 rounded-full',
              index <= current ? 'bg-brand' : 'bg-surface',
            )}
          />
          <span
            className={cn(
              'truncate text-meta-sm',
              index === current ? 'font-medium text-ink' : 'text-muted',
            )}
          >
            <span className="sr-only">
              {index < current
                ? 'Done: '
                : index === current
                  ? 'Now: '
                  : 'Next: '}
            </span>
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** An inline text link, readable on the ground and on soft fills. */
export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        'rounded-row font-medium text-ink underline decoration-border-strong underline-offset-2 transition-colors hover:decoration-ink',
        className,
      )}
      {...props}
    />
  );
}
