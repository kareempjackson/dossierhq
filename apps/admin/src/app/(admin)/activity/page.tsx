import { Suspense } from 'react';
import { StaffLogTable } from '@/components/log/staff-log-table';
import { Pager } from '@/components/ui/pager';
import { Sheet } from '@/components/ui/sheet';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import { getActivity } from '@/lib/data';
import { orNull } from '@/lib/data/safe';

export const metadata = { title: 'Activity' };

export default function ActivityPage({ searchParams }: PageProps<'/activity'>) {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-240">
        <header>
          <h1 className="text-title-compact sm:text-title">Activity</h1>
          <p className="mt-3 max-w-2xl text-text">
            Everything staff did here, newest first: sign-ins, support views,
            and every change to a workspace, a person or the staff. Changes to a
            workspace also show in that workspace’s own audit log. Times are
            UTC.
          </p>
        </header>
        <Suspense fallback={<LogSkeleton />}>
          <Activity searchParams={searchParams} />
        </Suspense>
      </div>
    </Sheet>
  );
}

const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

async function Activity({
  searchParams,
}: Pick<PageProps<'/activity'>, 'searchParams'>) {
  const params = await searchParams;
  const page = await getActivity({
    before: one(params.before),
    after: one(params.after),
  }).catch(orNull);
  if (!page) return <ErrorState what="the activity log" className="mt-8" />;
  if (page.data.length === 0) {
    return (
      <EmptyState title="Nothing yet" className="mt-8">
        Sign-ins and changes will appear here.
      </EmptyState>
    );
  }
  return (
    <div className="mt-8">
      <StaffLogTable entries={page.data} />
      <Pager
        label="Activity pages"
        newer={page.newer && `/activity?after=${page.newer}`}
        older={page.older && `/activity?before=${page.older}`}
      />
    </div>
  );
}

function LogSkeleton() {
  return (
    <div className="mt-8">
      <LoadingLabel what="the activity log" />
      <div className="flex flex-col gap-3 rounded-card bg-sheet p-4 shadow-card">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
