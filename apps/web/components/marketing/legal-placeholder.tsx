import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CONTAINER } from './container';

/** The company's address for anything legal, until the full pages exist. */
export const LEGAL_EMAIL = 'hello@dossierhq.com';

/**
 * A legal page that isn't written yet: it says so plainly, says who makes
 * Dossier and how to reach them, and adds only what's already true.
 */
export function LegalPlaceholder({
  title,
  status,
  children,
}: {
  title: string;
  /** Where the full page stands, e.g. "Our terms of service are being prepared." */
  status: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="legal-title"
      className={cn(CONTAINER, 'py-20 lg:py-28')}
    >
      <div className="max-w-2xl">
        <p className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted">
          LEGAL
        </p>
        <h1 id="legal-title" className="mt-3 text-h1">
          {title}
        </h1>
        <p className="mt-6 text-body">
          {status} Dossier is made by Ghost Savvy.
        </p>
        {children}
        <p className="mt-6 text-body">
          Questions in the meantime:{' '}
          <a
            href={`mailto:${LEGAL_EMAIL}`}
            className="rounded-sm underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink"
          >
            {LEGAL_EMAIL}
          </a>
          .
        </p>
      </div>
    </section>
  );
}
