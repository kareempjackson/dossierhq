import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * A button's icon, or a spinner in its place while the button's work runs.
 * Swapping the icon, not the label, keeps the button the same width.
 */
export function BusyIcon({
  icon: Icon,
  busy,
  className,
}: {
  icon: LucideIcon;
  busy: boolean;
  className?: string;
}) {
  const Shown = busy ? LoaderCircle : Icon;
  return (
    <Shown
      aria-hidden
      strokeWidth={1.75}
      className={cn(
        'size-3.5 shrink-0',
        busy && 'motion-safe:animate-spin',
        className,
      )}
    />
  );
}
