import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/**
 * A grey field with no border. Focused, it turns white with a lilac ring;
 * invalid, it turns attention-soft.
 */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-xl bg-grey-1 px-4 text-body text-ink transition-colors placeholder:text-muted aria-invalid:bg-attention-soft focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-lilac-deep focus-visible:outline-none focus-visible:ring-inset',
        className,
      )}
      {...props}
    />
  );
}
