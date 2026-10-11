import { cn } from '@/lib/cn';

type SourceChipProps = {
  number: number;
  /** Spoken name of the source, e.g. "NinjaOne ALERT-48213". */
  label: string;
  selected?: boolean;
  /** Makes the chip a toggle button. Without it the chip is static. */
  onSelect?: () => void;
  className?: string;
};

/**
 * A numbered citation. Amber, because amber means "source" everywhere in
 * Dossier; the selected chip turns ink.
 */
export function SourceChip({
  number,
  label,
  selected = false,
  onSelect,
  className,
}: SourceChipProps) {
  const chipClass = cn(
    'inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 align-[0.1em] font-mono text-mono leading-none tabular-nums',
    selected ? 'bg-ink text-white' : 'bg-marker-soft text-ink',
    className,
  );

  if (!onSelect) {
    return (
      <span className={chipClass}>
        <span aria-hidden>{number}</span>
        <span className="sr-only">
          Source {number}: {label}
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Source ${number}: ${label}`}
      onClick={onSelect}
      className={cn(
        chipClass,
        'cursor-pointer transition-colors',
        !selected && 'hover:bg-marker',
      )}
    >
      {number}
    </button>
  );
}
