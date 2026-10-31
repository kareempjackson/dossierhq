import { cn } from '@/lib/cn';

const sizes = {
  md: 'size-9 text-meta',
  lg: 'size-12 text-section',
} as const;

const tones = {
  soft: 'bg-brand-soft text-brand-deep',
  /** The signed-in person, as in the sidebar. */
  deep: 'bg-brand-deep text-white',
} as const;

/** "Ada Lovelace" is "AL"; "Ada" is "A". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const ends = words.length > 1 ? [words[0]!, words.at(-1)!] : words;
  return (
    ends
      .map((word) => Array.from(word)[0])
      .join('')
      .toUpperCase() || '?'
  );
}

/** Someone's initials in a circle. Decorative: show their name beside it. */
export function Avatar({
  name,
  size = 'md',
  tone = 'soft',
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold select-none',
        sizes[size],
        tones[tone],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
