'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Mark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/**
 * A work email and a button that starts signing up with it filled in
 * (/sign-up?email=). Nothing is sent from here.
 */
export function EmailStart({
  button = 'Create free account',
  variant = 'act',
  withMark = false,
  className,
}: {
  button?: string;
  variant?: 'act' | 'ink';
  withMark?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const id = useId();
  return (
    <form
      className={cn('flex flex-wrap gap-2', className)}
      onSubmit={(event) => {
        event.preventDefault();
        const address = email.trim();
        router.push(
          address
            ? `/sign-up?email=${encodeURIComponent(address)}`
            : '/sign-up',
        );
      }}
    >
      <label htmlFor={`${id}-email`} className="sr-only">
        Work email
      </label>
      <input
        id={`${id}-email`}
        type="email"
        autoComplete="email"
        placeholder="Work email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="h-12 min-w-0 flex-1 basis-56 rounded-full bg-white px-5 text-body text-ink ring-1 ring-grey-3 outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-lilac-deep"
      />
      <Button type="submit" variant={variant} size="lg">
        {withMark && <Mark height={14} />}
        {button}
      </Button>
    </form>
  );
}
