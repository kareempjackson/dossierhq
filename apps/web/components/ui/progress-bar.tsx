import { cn } from '@/lib/cn';

/**
 * A thin bar for work that's running with no known end, such as a sync. A
 * short runner glides along the track, fading in and out at its ends rather
 * than hitting the edges. For people who ask for less motion it stays still,
 * filled.
 */
export function ProgressBar({
  label,
  className,
}: {
  /** What's running, for screen readers, e.g. "Syncing Hudu". */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      className={cn(
        'relative h-0.5 animate-enter overflow-hidden rounded-full bg-lilac-soft',
        className,
      )}
    >
      <div className="absolute inset-0 [mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)] motion-reduce:[mask-image:none]">
        <div className="absolute inset-y-0 left-0 w-1/4 animate-progress rounded-full bg-lilac-deep motion-reduce:w-full" />
      </div>
    </div>
  );
}
