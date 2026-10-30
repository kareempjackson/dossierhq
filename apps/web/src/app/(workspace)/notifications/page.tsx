import type { Notification } from '@dossierhq/contracts';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  MarkAllRead,
  NotificationItem,
} from '@/components/notifications/notification-list';
import { ButtonLink } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { SegmentedFilter } from '@/components/ui/segmented-filter';
import { Sheet } from '@/components/ui/sheet';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import {
  getNotifications,
  getNow,
  getUnreadNotificationCount,
  getWorkspace,
} from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { calendarDateIn, formatLongDay, formatRelative } from '@/lib/format';

export const metadata = { title: 'Notifications' };

export default function NotificationsPage({
  searchParams,
}: PageProps<'/notifications'>) {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-180">
        <header>
          <h1 className="text-title-compact sm:text-title">Notifications</h1>
          <p className="mt-3 max-w-2xl text-text">
            What has happened in your workspace that you asked to hear about,
            newest first. Choose what you hear about, and what’s emailed to you,
            in{' '}
            <Link
              href="/settings#notifications"
              className="underline underline-offset-2"
            >
              Settings
            </Link>
            .
          </p>
        </header>
        <Suspense fallback={<FeedSkeleton />}>
          <Feed searchParams={searchParams} />
        </Suspense>
      </div>
    </Sheet>
  );
}

const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

function feedHref({ unread, before }: { unread: boolean; before?: string }) {
  const params = new URLSearchParams();
  if (unread) params.set('show', 'unread');
  if (before) params.set('before', before);
  const search = params.toString();
  return search ? `/notifications?${search}` : '/notifications';
}

async function Feed({
  searchParams,
}: Pick<PageProps<'/notifications'>, 'searchParams'>) {
  const query = await searchParams;
  const unread = one(query.show) === 'unread';
  const before = one(query.before);
  const [page, count, workspace, now] = await Promise.all([
    getNotifications({ unread, before }).catch(orNull),
    getUnreadNotificationCount().catch(orNull),
    getWorkspace(),
    getNow(),
  ]);
  const { timeZone } = workspace;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedFilter
          label="Show notifications"
          value={unread ? 'unread' : 'all'}
          options={[
            { value: 'all', label: 'All', href: feedHref({ unread: false }) },
            {
              value: 'unread',
              label: 'Unread',
              href: feedHref({ unread: true }),
              count: count ?? undefined,
            },
          ]}
        />
        {Boolean(count) && <MarkAllRead />}
      </div>
      <div className="mt-4">
        {page === null ? (
          <ErrorState what="your notifications" />
        ) : page.data.length === 0 ? (
          <EmptyState
            title={
              before
                ? 'Nothing older.'
                : unread
                  ? 'You’re up to date.'
                  : 'Nothing yet.'
            }
          >
            {before
              ? 'Notifications are kept for 90 days.'
              : unread
                ? 'Everything here has been read.'
                : 'When a sync stops, a report is ready or goes out, or someone joins, it shows here.'}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-6">
            {byDay(page.data, timeZone).map(([day, notifications]) => (
              <section key={day} aria-label={dayLabel(day, now, timeZone)}>
                <h2 className="text-meta font-medium text-muted">
                  {dayLabel(day, now, timeZone)}
                </h2>
                <ListCard className="mt-2">
                  {notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      when={formatRelative(notification.at, now, timeZone)}
                    />
                  ))}
                </ListCard>
              </section>
            ))}
          </div>
        )}
        {page && (page.older || before) && (
          <nav
            aria-label="Notification pages"
            className="mt-4 flex items-center justify-between gap-3"
          >
            {before ? (
              <ButtonLink href={feedHref({ unread })}>Newest</ButtonLink>
            ) : (
              <span />
            )}
            {page.older && (
              <ButtonLink href={feedHref({ unread, before: page.older })}>
                Older
                <ChevronRight aria-hidden strokeWidth={1.75} />
              </ButtonLink>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}

/** Notifications grouped by the day they happened, where the workspace is. */
function byDay(notifications: Notification[], timeZone: string) {
  const days = new Map<string, Notification[]>();
  for (const notification of notifications) {
    const day = calendarDateIn(notification.at, timeZone);
    days.set(day, [...(days.get(day) ?? []), notification]);
  }
  return [...days];
}

/** "Today", "Yesterday", or "Friday 9 October". */
function dayLabel(day: string, now: string, timeZone: string) {
  const today = calendarDateIn(now, timeZone);
  const yesterday = calendarDateIn(
    new Date(Date.parse(now) - 86_400_000).toISOString(),
    timeZone,
  );
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  return formatLongDay(`${day}T12:00:00Z`, 'UTC');
}

function FeedSkeleton() {
  return (
    <div className="mt-8">
      <LoadingLabel what="your notifications" />
      <Skeleton className="h-9 w-48 rounded-full" />
      <div className="mt-4 flex flex-col gap-4 rounded-card bg-sheet p-4 shadow-card">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex gap-3">
            <Skeleton className="size-9 rounded-tile" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-64 max-w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
