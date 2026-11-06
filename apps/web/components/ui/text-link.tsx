import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** An inline link: ink, underlined, the line darkening on hover. */
export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        'rounded-sm font-medium text-ink underline decoration-ink/30 underline-offset-[3px] transition-colors hover:decoration-ink',
        className,
      )}
      {...props}
    />
  );
}
