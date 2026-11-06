'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { TextLink } from '@/components/ui/text-link';
import { safeNextPath } from '@/lib/safe-next-path';

/**
 * Where to go once signed in, as sent by the page that asked (`?next=`). The
 * URL is only known in the browser, so the rest of the page prerenders.
 */
export function NextField() {
  return (
    <Suspense fallback={null}>
      <NextFieldInput />
    </Suspense>
  );
}

function NextFieldInput() {
  const next = safeNextPath(useSearchParams().get('next'));
  return <input type="hidden" name="next" value={next} />;
}

/**
 * A link to another step of signing in that keeps `?next=`, so wherever the
 * person was headed survives the detour.
 */
export function TextLinkKeepingNext({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<TextLink href={href}>{children}</TextLink>}>
      <TextLinkWithNext href={href}>{children}</TextLinkWithNext>
    </Suspense>
  );
}

function TextLinkWithNext({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const next = useSearchParams().get('next');
  const target = next
    ? `${href}?next=${encodeURIComponent(safeNextPath(next))}`
    : href;
  return <TextLink href={target}>{children}</TextLink>;
}
