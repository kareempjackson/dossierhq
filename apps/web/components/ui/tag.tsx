import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Status is a word in a soft tag, never a coloured dot or icon alone. */
export type TagTone = 'attention' | 'act' | 'drafted' | 'healthy' | 'neutral';

const tones: Record<TagTone, string> = {
  attention: 'bg-attention-soft text-attention',
  act: 'bg-lime-soft text-lime-ink',
  drafted: 'bg-lilac-soft text-lilac-ink',
  healthy: 'bg-healthy-soft text-healthy',
  neutral: 'bg-grey-1 text-muted',
};

export function Tag({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: TagTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[1.375rem] shrink-0 items-center rounded-md px-2 text-small whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
