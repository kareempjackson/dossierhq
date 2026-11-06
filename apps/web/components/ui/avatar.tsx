import { initials } from '@/lib/client-paths';
import { cn } from '@/lib/cn';

/** Whose side someone is on: the client's people lilac, the MSP's ink. */
export type AvatarTone = 'client' | 'msp' | 'neutral';

const TONES: Record<AvatarTone, string> = {
  client: 'bg-lilac-soft text-lilac-ink',
  msp: 'bg-ink text-paper',
  neutral: 'bg-grey-2 text-muted',
};

const SIZES = {
  sm: 'size-7 text-[0.6875rem]',
  md: 'size-9 text-small',
};

/** Someone's initials in a circle. Decorative: their name is always beside it. */
export function Avatar({
  name,
  tone = 'neutral',
  size = 'md',
  className,
}: {
  name: string;
  tone?: AvatarTone;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium tracking-normal select-none',
        TONES[tone],
        SIZES[size],
        className,
      )}
    >
      {initials(name) || '·'}
    </span>
  );
}
