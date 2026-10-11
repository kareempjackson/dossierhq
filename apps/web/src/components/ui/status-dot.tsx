import { cn } from '@/lib/cn';

const tones = {
  positive: 'bg-brand',
  failure: 'bg-alert',
  strong: 'bg-ink',
  neutral: 'bg-border-strong',
} as const;

export type StatusTone = keyof typeof tones;

type StatusDotProps = {
  tone: StatusTone;
  className?: string;
} & (VisibleLabel | ScreenReaderLabel | Decorative);

/** Text shown beside the dot. */
type VisibleLabel = { label: string; srLabel?: never; decorative?: never };

/** Text for screen readers when the dot's meaning is clear from where it sits. */
type ScreenReaderLabel = { label?: never; srLabel: string; decorative?: never };

/** Only when text right beside it already states the status. */
type Decorative = { label?: never; srLabel?: never; decorative: true };

/** A quiet status marker. Colour is never the only signal, so it always carries text. */
export function StatusDot({ tone, label, srLabel, className }: StatusDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        aria-hidden
        className={cn('size-2 shrink-0 rounded-full', tones[tone])}
      />
      {label ? (
        <span>{label}</span>
      ) : srLabel ? (
        <span className="sr-only">{srLabel}</span>
      ) : null}
    </span>
  );
}
