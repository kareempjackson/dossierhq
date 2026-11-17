import { Suspense, type ReactNode } from 'react';
import { NotificationTabs } from '@/components/notifications/notification-tabs';
import { TopBar } from '@/components/shell/top-bar';
import { ViewNavProvider } from '@/components/ui/view-nav';

/**
 * The Notifications frame: its title, tabs and sheet. A layout outlasts the
 * pages under it, so moving between All, Unread and older pages leaves
 * these in place, and only the notifications change.
 */
export default function NotificationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ViewNavProvider>
      <TopBar
        title="Notifications"
        subtitle="What happened in your workspace, newest first"
      />
      <div className="mt-6 rounded-3xl bg-grey-2 p-2.5 sm:p-3 lg:min-h-[calc(100dvh-10rem)]">
        {/* Holds the row's height until the URL is known. */}
        <Suspense fallback={<div aria-hidden className="h-[3.25rem]" />}>
          <NotificationTabs />
        </Suspense>
        {children}
      </div>
    </ViewNavProvider>
  );
}
