import { TOOL_NAMES } from '@dossierhq/contracts';
import { Suspense } from 'react';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { DataList, type DataRow } from '@/components/ui/data-list';
import { ListCardRow } from '@/components/ui/list-card';
import { SourceLine } from '@/components/ui/source-line';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { getClient, getClientSources, getWorkspace } from '@/lib/data';
import { formatLongDay } from '@/lib/format';
import { orNull } from '@/lib/data/safe';
import { presentOptions } from '@/lib/list-options';

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]/timeline'>) {
  const client = await getClient((await params).id).catch(orNull);
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
    getClientSources(client.id).catch(orNull),
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

  const rows: DataRow[] = events.map((event) => ({
    id: event.id,
    // Fields too, so a Fathom summary or a Hudu asset's details can be found.
    text: [
      event.title,
      event.recordType,
      TOOL_NAMES[event.tool],
      event.recordId,
      ...event.fields.map((field) => field.value),
      ...(event.kind === 'meeting' ? [event.speakerName, event.quote] : []),
    ].join(' '),
    values: { tool: event.tool, type: event.recordType },
    group: formatLongDay(event.recordedAt, workspace.timeZone),
    node: (
      <ListCardRow className="items-start">
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
    ),
  }));
  const recordTypes = [...new Set(events.map((e) => e.recordType))].sort();

  return (
    <ClientSheet client={client} tab="timeline">
      <p className="text-meta text-muted">
        Everything Dossier has read about {client.name}, newest first.
      </p>
      <div className="mt-4">
        {sources === null ? (
          <ErrorState what="the timeline" />
        ) : events.length === 0 ? (
          <EmptyState title="Nothing read yet.">
            Records from NinjaOne, Hudu, SharePoint and Fathom appear here as
            Dossier reads them.
          </EmptyState>
        ) : (
          <DataList
            rows={rows}
            noun={['record', 'records']}
            placeholder="Search everything read"
            pageSize={50}
            filters={[
              {
                name: 'tool',
                label: 'Tool',
                options: presentOptions(
                  events.map((e) => e.tool),
                  TOOL_NAMES,
                ),
              },
              {
                name: 'type',
                label: 'Record type',
                as: 'menu',
                options: recordTypes.map((type) => ({
                  value: type,
                  label: type,
                })),
              },
            ]}
            layout={{ kind: 'groups' }}
          />
        )}
      </div>
    </ClientSheet>
  );
}
