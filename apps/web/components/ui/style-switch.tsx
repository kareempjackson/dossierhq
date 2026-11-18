'use client';

import { STYLE_COOKIE, type Style } from '@/lib/client-paths';
import { cn } from '@/lib/cn';

const STYLES: { value: Style; label: string }[] = [
  { value: 'technical', label: 'Technical' },
  { value: 'executive', label: 'Executive' },
];

/** Remembers which version someone reads, for every page after this one. */
function remember(style: Style) {
  document.cookie = `${STYLE_COOKIE}=${style}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Technical, for the engineer who'll do the work, or executive, for the
 * client's leadership. The choice carries to the next page.
 */
export function StyleSwitch({
  value,
  onChange,
  className,
}: {
  value: Style;
  onChange: (style: Style) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Which version"
      className={cn('flex gap-1 rounded-full bg-white/60 p-0.5', className)}
    >
      {STYLES.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => {
            remember(option.value);
            onChange(option.value);
          }}
          className={cn(
            'rounded-full px-3 py-1 text-small transition-colors',
            value === option.value
              ? 'bg-white font-medium text-ink ring-1 ring-grey-3'
              : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
