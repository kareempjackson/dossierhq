import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ReadFailed } from '@/components/clients/client-tab';
import { NothingToReview } from '@/components/reports/review-page';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { getReportQueue } from '@/lib/data/reports';
import { orNull } from '@/lib/data/safe';

export const metadata: Metadata = { title: 'Reports' };

/** To review: opens the first draft waiting, those with exceptions first. */
export default function ReportsPage() {
  return (
    <Reveal
      fallback={
        <IndexLoader className="h-[19rem]" label="Loading the reports" />
      }
    >
      <First />
    </Reveal>
  );
}

async function First() {
  const queue = await getReportQueue().catch(orNull);
  if (queue === null) return <ReadFailed what="the reports to review" />;
  const first = queue[0];
  if (first) redirect(`/reports/${encodeURIComponent(first.id)}`);
  return <NothingToReview />;
}
