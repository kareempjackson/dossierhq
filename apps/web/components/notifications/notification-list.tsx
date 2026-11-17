'use client';

import { ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { NotificationRow } from '@/lib/notification-views';
import { useAppSelector } from '@/lib/store/hooks';
import { selectMarkedRead } from '@/lib/store/shell-slice';
import { useMarkRead } from './use-mark-read';

/**
 * A page of notifications, newest first. Unread ones are white with a lime
 * edge. Opening one's page marks it read; one with no page has Mark read.
 * What's marked read here shows at once, ahead of the API.
 */
export function NotificationList({ rows }: { rows: NotificationRow[] }) {
  const marked = useAppSelector(selectMarkedRead);
  const { mark, error } = useMarkRead();
  const isUnread = (row: NotificationRow) =>
    row.unread && marked !== 'all' && !marked.includes(row.id);

  return (
    <>
      {error && (
        <p role="alert" className="mb-2 px-1 text-small text-attention">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const unread = isUnread(row);
          return (
            <li
              key={row.id}
              className={cn(
                'relative flex flex-wrap items-center gap-x-6 gap-y-2 overflow-hidden rounded-xl px-5 py-3.5',
                unread ? 'bg-white' : 'bg-grey-1',
              )}
            >
              {unread && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[3px] bg-lime"
                />
              )}
              <div className="min-w-[14rem] flex-1 basis-full sm:basis-0">
                <p className={unread ? 'font-semibold' : undefined}>
                  {unread && <span className="sr-only">Unread: </span>}
                  {row.title}
                </p>
                {row.body && (
                  <p className="text-small text-muted">{row.body}</p>
                )}
              </div>
              <p
                title={row.at}
                className="text-small text-muted sm:w-24 sm:text-right"
              >
                {row.when}
              </p>
              <div className="ml-auto sm:ml-0 sm:flex sm:w-28 sm:justify-end">
                {row.link ? (
                  <ButtonLink
                    href={row.link}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (unread) void mark([row.id], false);
                    }}
                  >
                    Open
                  </ButtonLink>
                ) : (
                  unread && (
                    <button
                      type="button"
                      onClick={() => void mark([row.id], true)}
                      className="rounded-sm text-small text-muted transition-colors hover:text-ink"
                    >
                      Mark read
                    </button>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
