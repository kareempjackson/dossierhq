import type { Metadata } from 'next';
import { NotificationFeed } from '@/components/notifications/notification-feed';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { ViewEntries } from '@/components/ui/view-nav';

export const metadata: Metadata = { title: 'Notifications' };

/**
 * Your notifications from the API, a page at a time. The view and the page
 * are in the URL, read inside Suspense so the frame (the layout's title and
 * tabs) shows at once.
 */
export default function NotificationsPage({
  searchParams,
}: PageProps<'/notifications'>) {
  return (
    <ViewEntries>
      <Reveal
        fallback={
          <IndexLoader className="h-[26rem]" label="Loading notifications" />
        }
      >
        <NotificationFeed searchParams={searchParams} />
      </Reveal>
    </ViewEntries>
  );
}
