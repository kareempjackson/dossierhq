import { ChevronRight } from 'lucide-react';
import { ViewButtonLink, ViewLink } from '@/components/ui/view-nav';
import { ApiError } from '@/lib/api';
import { getMe } from '@/lib/data/auth';
import { getNotifications } from '@/lib/data/notifications';
import { orNull } from '@/lib/data/safe';
import {
  notificationRows,
  notificationsHref,
  type NotificationView,
} from '@/lib/notification-views';
import { NotificationList } from './notification-list';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) =>
  typeof value === 'string' && value ? value : undefined;

/**
 * A page of the signed-in person's notifications from the API, newest
 * first. The view (All or Unread) and the page are in the URL, so Older is
 * a link that can be shared, reloaded or stepped back to.
 */
export async function NotificationFeed({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const view: NotificationView = query.view === 'unread' ? 'unread' : 'all';
  const before = one(query.before);
  const [me, page] = await Promise.all([
    getMe().catch(orNull),
    getNotifications(view, before).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 400) {
        return 'invalid-page' as const;
      }
      return orNull(error);
    }),
  ]);
  const newest = notificationsHref(view);

  // They're the owner's own, so the API keeps them from a support view.
  if (me?.support) {
    return (
      <Note
        title="Notifications aren’t shown in a support view."
        detail={`They’re ${me.user.name}’s own.`}
      />
    );
  }
  if (page === 'invalid-page') {
    return (
      <Note
        title="That page of notifications isn’t valid."
        detail="It may be from an old link."
        newest={newest}
      />
    );
  }
  if (!me || !page) {
    return (
      <p
        role="alert"
        className="rounded-xl bg-grey-1 px-5 py-10 text-center text-small text-muted"
      >
        Dossier couldn’t read your notifications just now. Reload the page to
        try again.
      </p>
    );
  }

  const rows = notificationRows(page.data, {
    timeZone: me.workspace.timeZone,
    now: new Date(),
  });

  if (rows.length === 0) {
    return before ? (
      <Note title="No older notifications." newest={newest} />
    ) : view === 'unread' ? (
      <Note title="Nothing unread." detail="You’re up to date." />
    ) : (
      <Note
        title="Nothing here yet."
        detail="When something happens in your workspace, it lands here."
      />
    );
  }

  return (
    <>
      <NotificationList rows={rows} />
      {(before || page.older) && (
        <div className="flex items-center justify-end gap-3 px-1 pt-3">
          {before && (
            <ViewLink
              href={newest}
              className="rounded-sm text-small text-muted underline-offset-[3px] hover:text-ink hover:underline"
            >
              Back to the newest
            </ViewLink>
          )}
          {page.older && (
            <ViewButtonLink
              href={notificationsHref(view, page.older)}
              variant="outline"
              size="sm"
            >
              Older
              <ChevronRight aria-hidden className="size-4" strokeWidth={1.75} />
            </ViewButtonLink>
          )}
        </div>
      )}
    </>
  );
}

function Note({
  title,
  detail,
  newest,
}: {
  title: string;
  detail?: string;
  newest?: string;
}) {
  return (
    <div className="rounded-xl bg-grey-1 px-5 py-10 text-center">
      <p className="font-display text-h3">{title}</p>
      {detail && <p className="mt-1 text-small text-muted">{detail}</p>}
      {newest && (
        <ViewLink
          href={newest}
          className="mt-3 inline-block rounded-sm text-small text-ink underline-offset-[3px] hover:underline"
        >
          Back to the newest
        </ViewLink>
      )}
    </div>
  );
}
