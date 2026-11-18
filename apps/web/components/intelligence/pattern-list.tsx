import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { PatternCard } from '@/lib/today-views';

/** Patterns shown open; any more fold under "more". */
const OPEN = 3;

const clientHref = (id: string) => `/clients/${encodeURIComponent(id)}`;

/**
 * The same problem at several clients, as Dossier found it when it looked
 * across them. Nothing shows until it has found one.
 */
export function PatternList({
  patterns,
  compact = false,
  className,
}: {
  patterns: PatternCard[];
  /** One column, for a narrow side panel. */
  compact?: boolean;
  className?: string;
}) {
  if (patterns.length === 0) return null;
  const open = patterns.slice(0, OPEN);
  const folded = patterns.slice(OPEN);
  const columns = compact
    ? 'grid grid-cols-[minmax(0,1fr)] gap-3'
    : 'grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2';

  return (
    <section
      aria-labelledby="patterns"
      className={cn(compact ? null : 'mt-10', className)}
    >
      <h2
        id="patterns"
        className="font-sans text-small font-normal tracking-normal text-muted"
      >
        Across several clients
      </h2>
      <ul className={cn('mt-3', columns)}>
        {open.map((pattern) => (
          <Pattern key={pattern.id} pattern={pattern} />
        ))}
      </ul>
      {folded.length > 0 && (
        <details className="group mt-3">
          <summary className="w-fit cursor-pointer list-none rounded-sm text-small text-ink underline-offset-[3px] hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              {folded.length === 1
                ? '1 more pattern'
                : `${folded.length} more patterns`}
            </span>
            <span className="hidden group-open:inline">Fewer patterns</span>
          </summary>
          <ul className={cn('mt-3', columns)}>
            {folded.map((pattern) => (
              <Pattern key={pattern.id} pattern={pattern} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Pattern({ pattern }: { pattern: PatternCard }) {
  return (
    <li className="flex flex-col rounded-2xl bg-grey-1 p-5">
      <p className="text-[0.75rem] text-muted">
        {pattern.clients.length} clients ·{' '}
        <span title={pattern.foundFull}>found {pattern.found}</span>
      </p>
      <h3 className="mt-1 font-sans text-base font-medium tracking-normal">
        {pattern.title}
      </h3>
      <p className="mt-1 text-small text-muted">{pattern.why}</p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {pattern.clients.map((client) => (
          <li
            key={client.id}
            className="rounded-lg bg-white px-3 py-2 text-small"
          >
            <Link
              href={clientHref(client.id)}
              className="rounded-sm font-medium underline decoration-ink/30 underline-offset-[3px] transition-colors hover:decoration-ink"
            >
              {client.name}
            </Link>{' '}
            {client.detail}
            {client.source && (
              <>
                {' '}
                <a
                  href={client.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm text-[0.75rem] text-muted underline decoration-ink/20 underline-offset-[3px] hover:text-ink"
                >
                  {client.source.name}
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-small">
        <span className="font-medium">What to do: </span>
        {pattern.suggestion}
      </p>
    </li>
  );
}
