import { Suspense } from 'react';
import {
  AttentionSection,
  AttentionSectionSkeleton,
} from '@/components/attention/attention-section';
import { AskSection } from '@/components/home/ask-section';
import { GetStarted } from '@/components/home/get-started';
import { HomeHeader, HomeHeaderSkeleton } from '@/components/home/home-header';
import {
  NewRecommendations,
  NewRecommendationsSkeleton,
} from '@/components/home/new-recommendations';
import { Patterns } from '@/components/home/patterns';
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
import { getConnectors } from '@/lib/data';
import { orNull } from '@/lib/data/safe';

export const metadata = { title: 'Home' };

export default function HomePage() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto flex max-w-220 flex-col gap-12">
        <Suspense fallback={<HomeHeaderSkeleton />}>
          <Home />
        </Suspense>
      </div>
    </Sheet>
  );
}

/** Getting started until a tool is connected; then what needs attention. */
async function Home() {
  const connectors = await getConnectors().catch(orNull);
  if (connectors?.length === 0) return <GetStarted />;

  return (
    <>
      <div className="flex flex-col gap-6">
        <Suspense fallback={<HomeHeaderSkeleton />}>
          <HomeHeader />
        </Suspense>
        <Suspense fallback={<AskBox />}>
          <AskSection />
        </Suspense>
      </div>

      <Suspense fallback={<AttentionSectionSkeleton />}>
        <AttentionSection />
      </Suspense>

      <Suspense fallback={<NewRecommendationsSkeleton />}>
        <NewRecommendations />
      </Suspense>

      {/* Nothing until Dossier finds a pattern, so nothing while it looks. */}
      <Suspense fallback={null}>
        <Patterns />
      </Suspense>

      <Suspense fallback={<WeeklyReportsSkeleton />}>
        <WeeklyReports />
      </Suspense>

      <Suspense fallback={<SourceTilesSkeleton />}>
        <SourceTiles />
      </Suspense>
    </>
  );
}
