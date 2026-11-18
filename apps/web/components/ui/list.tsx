import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A table's rows on a phone, where five columns don't fit: one grey card
 * per row, the main line first and the details under it. Pair it with the
 * table, which takes over from `md` up (`hidden md:block` around the table).
 */
export function MobileList({
  label,
  className,
  children,
}: {
  /** Names the list for screen readers, as the table's caption would. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ul
      aria-label={label}
      className={cn('flex flex-col gap-1.5 md:hidden', className)}
    >
      {children}
    </ul>
  );
}

/**
 * One row. With `href` the whole card opens it, with a chevron and a press,
 * as a native list does; then nothing inside may be a link. Without it,
 * links can sit in `meta` or `children`.
 */
export function MobileRow({
  href,
  title,
  meta,
  aside,
  leading,
  children,
  className,
}: {
  href?: string;
  /** The row's name: a client, a device, a ticket's subject. */
  title: ReactNode;
  /** The details, joined into a line or two of muted text. */
  meta?: ReactNode;
  /** A tag or a count, at the right. */
  aside?: ReactNode;
  /** An icon or avatar, at the left. */
  leading?: ReactNode;
  /** Anything else under the title and meta, such as a row's buttons. */
  children?: ReactNode;
  className?: string;
}) {
  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-medium break-words">{title}</p>
          {aside && <div className="shrink-0 pt-px">{aside}</div>}
        </div>
        {meta && (
          <div className="mt-0.5 text-small break-words text-muted">{meta}</div>
        )}
        {children}
      </div>
    </>
  );
  const shape =
    'flex min-h-14 items-center gap-3 rounded-xl bg-grey-1 px-4 py-3';
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(
            shape,
            'press transition-colors active:bg-grey-2',
            className,
          )}
        >
          {body}
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-muted"
            strokeWidth={1.75}
          />
        </Link>
      ) : (
        <div className={cn(shape, className)}>{body}</div>
      )}
    </li>
  );
}

/** Joins a row's details with a middle dot, skipping the empty ones. */
export function joinMeta(
  ...parts: Array<ReactNode | false | null | undefined>
) {
  return parts
    .filter(
      (part) =>
        part !== false && part !== null && part !== undefined && part !== '',
    )
    .map((part, index) => (
      <Fragment key={index}>
        {index > 0 && ' · '}
        {part}
      </Fragment>
    ));
}
