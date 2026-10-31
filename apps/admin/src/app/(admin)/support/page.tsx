import { Suspense } from 'react';
import { SupportViews } from '@/components/support/support-views';
import { SegmentedFilter } from '@/components/ui/segmented-filter';
import { Sheet } from '@/components/ui/sheet';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import { getSupportViews } from '@/lib/data';
import { orNull } from '@/lib/data/safe';

export const metadata = { title: 'Support' };

export default function SupportPage({ searchParams }: PageProps<'/support'>) {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-260">
        <header>
          <h1 className="text-title-compact sm:text-title">Support views</h1>
          <p className="mt-3 max-w-2xl text-text">
            Staff looking at a workspace read-only, as its owner sees it. Open
            one from a workspace’s Support tab. Each lasts at most an hour, and
            any of the staff can end one early. Times are UTC.
          </p>
        </header>
        <Suspense
          fallback={
            <div className="mt-8">
              <LoadingLabel what="support views" />
              <Skeleton className="h-40 w-full rounded-card" />
            </div>
          }
        >
          <Views searchParams={searchParams} />
        </Suspense>
      </div>
    </Sheet>
  );
}

async function Views({
  searchParams,
}: Pick<PageProps<'/support'>, 'searchParams'>) {
  const recent = (await searchParams).show === 'recent';
  const views = await getSupportViews(!recent).catch(orNull);
  const now = new Date().toISOString();
  return (
    <div className="mt-8">
      <SegmentedFilter
        label="Which support views"
        value={recent ? 'recent' : 'running'}
        options={[
          { value: 'running', label: 'Running now', href: '/support' },
          { value: 'recent', label: 'Recent', href: '/support?show=recent' },
        ]}
      />
      {views === null ? (
        <ErrorState what="support views" className="mt-4" />
      ) : views.length === 0 ? (
        <EmptyState
          title={
            recent ? 'No support views yet' : 'Nobody is looking right now'
          }
          className="mt-4"
        />
      ) : (
        <div className="mt-4">
          <SupportViews views={views} showWorkspace now={now} />
        </div>
      )}
    </div>
  );
}
