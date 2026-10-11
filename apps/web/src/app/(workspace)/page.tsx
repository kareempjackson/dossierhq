import { Suspense } from 'react';
import {
  AttentionSection,
  AttentionSectionSkeleton,
} from '@/components/attention/attention-section';
import { HomeHeader, HomeHeaderSkeleton } from '@/components/home/home-header';
import {
  NewRecommendations,
  NewRecommendationsSkeleton,
} from '@/components/home/new-recommendations';
import {
  SourceTiles,
  SourceTilesSkeleton,
} from '@/components/home/source-tiles';
import {
  WeeklyReports,
  WeeklyReportsSkeleton,
} from '@/components/home/weekly-reports';
import { AskBox } from '@/components/ui/ask-box';
import { Sheet } from '@/components/ui/sheet';

export const metadata = { title: 'Home' };

export default function HomePage() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto flex max-w-220 flex-col gap-12">
        <div className="flex flex-col gap-6">
          <Suspense fallback={<HomeHeaderSkeleton />}>
            <HomeHeader />
          </Suspense>
          <AskBox />
        </div>

        <Suspense fallback={<AttentionSectionSkeleton />}>
          <AttentionSection />
        </Suspense>

        <Suspense fallback={<NewRecommendationsSkeleton />}>
          <NewRecommendations />
        </Suspense>

        <Suspense fallback={<WeeklyReportsSkeleton />}>
          <WeeklyReports />
        </Suspense>

        <Suspense fallback={<SourceTilesSkeleton />}>
          <SourceTiles />
        </Suspense>
      </div>
    </Sheet>
  );
}
