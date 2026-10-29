import type { Source } from '@dossierhq/contracts';
import { cn } from '@/lib/cn';
import { sourceName } from '@/lib/sources';
import { SourceChip } from './source-chip';
import { SourceLine } from './source-line';

/**
 * The records a statement rests on, numbered in the order given: what each
 * says (the words quoted, for meetings and notes) and where it came from.
 */
export function SourceList({
  sources,
  timeZone,
  className,
}: {
  sources: Source[];
  timeZone: string;
  className?: string;
}) {
  return (
    <ol className={cn('flex flex-col gap-3', className)}>
      {sources.map((source, index) => (
        <li key={source.id} className="flex gap-2.5">
          <SourceChip
            number={index + 1}
            label={sourceName(source)}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            {source.kind !== 'record' && source.quote ? (
              <blockquote className="text-meta text-ink">
                “{source.quote}”
              </blockquote>
            ) : (
              <p className="text-meta text-ink">{source.title}</p>
            )}
            <SourceLine
              source={source}
              timeZone={timeZone}
              className="mt-0.5"
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
