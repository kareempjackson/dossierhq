import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, ButtonLink } from './button';

/** Newer and Older, with the end the reader is at shown but unavailable. */
export function Pager({
  label,
  newer,
  older,
}: {
  label: string;
  /** Where Newer goes, or null at the newest page. */
  newer: string | null;
  older: string | null;
}) {
  if (!newer && !older) return null;
  return (
    <nav
      aria-label={label}
      className="mt-4 flex items-center justify-between gap-3"
    >
      <PageLink href={newer}>
        <ChevronLeft aria-hidden strokeWidth={1.75} />
        Newer
      </PageLink>
      <PageLink href={older}>
        Older
        <ChevronRight aria-hidden strokeWidth={1.75} />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  children,
}: {
  href: string | null;
  children: ReactNode;
}) {
  return href ? (
    <ButtonLink href={href}>{children}</ButtonLink>
  ) : (
    <Button disabled>{children}</Button>
  );
}
