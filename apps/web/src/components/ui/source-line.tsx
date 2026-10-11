import type { Source } from '@dossierhq/contracts';
import { cn } from '@/lib/cn';
import { sourceLineText } from '@/lib/sources';

type SourceLineProps = {
  source: Source;
  timeZone: string;
  /** How many more sources back the same statement. */
  more?: number;
  className?: string;
};

/** Where a statement came from, in mono: tool, record and time. */
export function SourceLine({
  source,
  timeZone,
  more = 0,
  className,
}: SourceLineProps) {
  return (
    <p className={cn('font-mono text-mono break-words text-muted', className)}>
      {sourceLineText(source, timeZone)}
      {more > 0 && <span> · +{more} more</span>}
    </p>
  );
}
