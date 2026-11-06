import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/cn';

/**
 * Signing in and its next steps: the form on white, and a panel beside it on
 * wide screens. Each page brings its own panel.
 */
export function AuthShell({
  panel,
  children,
}: {
  panel: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <div className="flex min-h-dvh w-full flex-col px-4 py-6 sm:px-10 sm:py-8 lg:w-1/2 lg:px-14">
        <Link href="/" aria-label="Dossier" className="self-start rounded-sm">
          <Logo height={26} />
        </Link>
        <main className="flex flex-1 items-center justify-center py-12 lg:items-start lg:pt-[14vh]">
          <div className="w-full max-w-[27rem]">{children}</div>
        </main>
        <p className="text-small text-muted">
          Dossier only reads your tools. Nothing sends itself.
        </p>
      </div>

      <aside className="hidden p-4 lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-1/2">
        {panel}
      </aside>
    </div>
  );
}

const tones = {
  lime: 'bg-linear-to-br from-lime from-35% to-lime-soft',
  lilac: 'bg-linear-to-br from-lilac-soft to-lilac-mist',
  /** Stone deep warming toward olive, for the last step of setting up. */
  stone:
    'bg-linear-to-br from-stone-deep to-[color-mix(in_oklab,var(--color-stone-deep)_86%,var(--color-lime))] text-paper',
};

/** The rounded panel beside the form. */
export function AuthPanel({
  tone,
  className,
  children,
}: {
  tone: keyof typeof tones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-3xl',
        tones[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The panel's statement: Bricolage, two short lines. */
export function AuthPanelTitle({ children }: { children: ReactNode }) {
  return (
    <p className="font-display text-h1 2xl:text-[3.25rem] 2xl:leading-[1.05]">
      {children}
    </p>
  );
}
