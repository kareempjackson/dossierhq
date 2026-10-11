import { TOOL_NAMES, type Source } from '@dossierhq/contracts';
import { Suspense } from 'react';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { ListCard, ListCardRow } from '@/components/ui/list-card';
import { SourceLine } from '@/components/ui/source-line';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { getClient, getClientSources, getWorkspace } from '@/lib/data';
import { formatLongDay } from '@/lib/format';

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]/timeline'>) {
  const client = await getClient((await params).id).catch(() => null);
  return { title: client ? `${client.name} timeline` : 'Timeline' };
}

export default function TimelinePage({
  params,
}: PageProps<'/clients/[id]/timeline'>) {
  return (
    <Suspense fallback={<ClientSheetSkeleton />}>
      <Timeline params={params} />
    </Suspense>
  );
}

async function Timeline({
  params,
}: Pick<PageProps<'/clients/[id]/timeline'>, 'params'>) {
  const client = await loadClient(params);
  const [sources, workspace] = await Promise.all([
    getClientSources(client.id).catch(() => null),
    getWorkspace(),
  ]);

  // One row per meeting rather than one per quote.
  const seenMeetings = new Set<string>();
  const events = (sources ?? []).filter((source) => {
    if (source.kind !== 'meeting') return true;
    if (seenMeetings.has(source.meetingId)) return false;
    seenMeetings.add(source.meetingId);
    return true;
  });

  const days = new Map<string, Source[]>();
  for (const event of events) {
    const day = formatLongDay(event.recordedAt, workspace.timeZone);
    days.set(day, [...(days.get(day) ?? []), event]);
  }

  return (
    <ClientSheet client={client} tab="timeline">
      <p className="text-meta text-muted">
        Everything Dossier has read about {client.name}, newest first.
      </p>
      <div className="mt-6">
        {sources === null ? (
          <ErrorState what="the timeline" />
        ) : events.length === 0 ? (
          <EmptyState title="Nothing read yet.">
            Records from NinjaOne, Hudu, SharePoint and Fathom appear here as
            Dossier reads them.
          </EmptyState>
        ) : (
          <ol className="flex flex-col gap-8">
            {[...days].map(([day, dayEvents]) => (
              <li key={day}>
                <h2 className="text-meta font-medium text-muted">{day}</h2>
                <ListCard className="mt-2">
                  {dayEvents.map((event) => (
                    <ListCardRow key={event.id} className="items-start">
                      <ConnectorTile tool={event.tool} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-ink">
                          <a
                            href={event.url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-row underline-offset-2 hover:underline"
                          >
                            {event.title}
                          </a>
                        </p>
                        <p className="text-meta text-muted">
                          {event.recordType} in {TOOL_NAMES[event.tool]}
                        </p>
                        <SourceLine
                          source={event}
                          timeZone={workspace.timeZone}
                          className="mt-0.5"
                        />
                      </div>
                    </ListCardRow>
                  ))}
                </ListCard>
              </li>
            ))}
          </ol>
        )}
      </div>
    </ClientSheet>
  );
}
