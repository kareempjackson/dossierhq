import type { Metadata } from 'next';
import { NothingToReview, ReviewPage } from '@/components/reports/review-page';
import { getWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Reports' };

/** To review, opening on the first of this week's drafts. */
export default function ReportsPage() {
  const first = getWorkspace().weekly.drafts[0];
  return first ? <ReviewPage draft={first} /> : <NothingToReview />;
}
