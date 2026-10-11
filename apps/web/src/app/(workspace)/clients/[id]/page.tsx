import { Suspense } from 'react';
import {
  AttentionSection,
  AttentionSectionSkeleton,
} from '@/components/attention/attention-section';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import {
  ClientSourcesPanel,
  ContractPanel,
  DevicesPanel,
  LastMeetingPanel,
  PanelSkeleton,
} from '@/components/client/overview-panels';
import {
  CommitmentsSection,
  RecommendationsSection,
  SectionSkeleton,
} from '@/components/client/overview-sections';
import { getClient } from '@/lib/data';

// Client pages are per workspace and read at request time, so there is no
// generateStaticParams: the shell prerenders and the client streams in.

export async function generateMetadata({ params }: PageProps<'/clients/[id]'>) {
  const client = await getClient((await params).id).catch(() => null);
  return { title: client?.name ?? 'Client' };
}

export default function ClientOverviewPage({
  params,
}: PageProps<'/clients/[id]'>) {
  return (
    <Suspense fallback={<ClientSheetSkeleton />}>
      <ClientOverview params={params} />
    </Suspense>
  );
}

async function ClientOverview({
  params,
}: Pick<PageProps<'/clients/[id]'>, 'params'>) {
  const client = await loadClient(params);

  return (
    <ClientSheet client={client} tab="overview">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-10">
          <Suspense fallback={<AttentionSectionSkeleton />}>
            <AttentionSection clientId={client.id} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton title="Recommendations" />}>
            <RecommendationsSection clientId={client.id} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton title="Open commitments" />}>
            <CommitmentsSection clientId={client.id} />
          </Suspense>
        </div>

        <aside aria-label="Client details" className="flex flex-col gap-4">
          <Suspense fallback={<PanelSkeleton title="Last meeting" />}>
            <LastMeetingPanel clientId={client.id} />
          </Suspense>
          <Suspense fallback={<PanelSkeleton title="Devices" />}>
            <DevicesPanel clientId={client.id} />
          </Suspense>
          <Suspense fallback={<PanelSkeleton title="Contract" />}>
            <ContractPanel client={client} />
          </Suspense>
          <Suspense fallback={<PanelSkeleton title="Sources" />}>
            <ClientSourcesPanel clientId={client.id} />
          </Suspense>
        </aside>
      </div>
    </ClientSheet>
  );
}
