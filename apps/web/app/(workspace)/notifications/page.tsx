import type { Metadata } from 'next';
import { NotificationList } from '@/components/notifications/notification-list';
import { TopBar } from '@/components/shell/top-bar';
import { getWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Notifications' };

export default function NotificationsPage() {
  const { notifications } = getWorkspace();
  return (
    <>
      <TopBar
        title="Notifications"
        subtitle="What happened in your workspace, newest first"
      />
      <div className="mt-6">
        <NotificationList notifications={notifications} />
      </div>
    </>
  );
}
