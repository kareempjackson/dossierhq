import { SUMMARY_FIELD, type Meeting, type Source } from '@dossierhq/contracts';
import { ChevronRight } from 'lucide-react';
import { Suspense } from 'react';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import {
  AttachMeeting,
  DetachMeeting,
  type AttachableMeeting,
} from '@/components/client/attach-meeting';
import { MeetingSummary } from '@/components/client/meeting-summary';
import { DataList, type DataRow } from '@/components/ui/data-list';
import { Markdown } from '@/components/ui/markdown';
import { RefreshWhileSyncing } from '@/components/ui/refresh-while-syncing';
import { SourceLine } from '@/components/ui/source-line';
import { EmptyState, ErrorState } from '@/components/ui/states';
import {
  getClient,
  getConnectors,
  getMeetingAttachments,
  getMeetings,
  getSources,
  getWorkspace,
} from '@/lib/data';
import { formatDate, plural } from '@/lib/format';
import { sourceField } from '@/lib/sources';
import { orEmpty, orNull } from '@/lib/data/safe';

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]/meetings'>) {
  const client = await getClient((await params).id).catch(orNull);
  return { title: client ? `${client.name} meetings` : 'Meetings' };
}

export default function MeetingsPage({
  params,
}: PageProps<'/clients/[id]/meetings'>) {
  return (
    <Suspense fallback={<ClientSheetSkeleton />}>
      <Meetings params={params} />
    </Suspense>
  );
}

async function Meetings({
  params,
}: Pick<PageProps<'/clients/[id]/meetings'>, 'params'>) {
  const client = await loadClient(params);
  const [meetings, workspace, attachments, connectors] = await Promise.all([
    getMeetings({ clientId: client.id }).catch(orNull),
    getWorkspace(),
    getMeetingAttachments().catch(orNull),
    getConnectors().catch(orEmpty),
  ]);
  const syncing = connectors.some(
    (c) => c.tool === 'fathom' && c.status === 'syncing',
  );
  const attachable: AttachableMeeting[] = (attachments?.unattached ?? []).map(
    (meeting) => ({
      id: meeting.id,
      title: meeting.title,
      when: `${formatDate(meeting.occurredAt, workspace.timeZone)} · ${meeting.durationMinutes} min`,
      attendees: meeting.attendees.join(', '),
      domains: meeting.domains,
      url: meeting.url,
    }),
  );
  const attachedByHand = attachments?.attached ?? {};
  const sources = await getSources(
    (meetings ?? []).flatMap((meeting) => [
      meeting.recordingSourceId,
      ...[
        ...meeting.planning,
        ...meeting.concerns,
        ...meeting.askedFor,
      ].flatMap((point) => point.sourceIds),
    ]),
  ).catch(orEmpty);
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  const actions = (attachable.length > 0 || syncing) && (
    <>
      <RefreshWhileSyncing
        syncing={syncing}
        tool="Fathom"
        className="text-meta text-muted empty:hidden"
      />
      {attachable.length > 0 && (
        <>
          <p className="text-meta text-muted">
            {plural(attachable.length, 'Fathom meeting')} matched no client.
          </p>
          <AttachMeeting
            clientId={client.id}
            clientName={client.name}
            meetings={attachable}
          />
        </>
      )}
    </>
  );

  const rows: DataRow[] = (meetings ?? []).map((meeting, index) => {
    const recording = sourceById.get(meeting.recordingSourceId);
    const summary = recording ? sourceField(recording, SUMMARY_FIELD) : null;
    return {
      id: meeting.id,
      text: [
        meeting.title,
        ...meeting.attendees.map((a) => a.name),
        ...[...meeting.planning, ...meeting.concerns, ...meeting.askedFor].map(
          (point) => point.text,
        ),
        summary ?? '',
      ].join(' '),
      node: (
        <MeetingCard
          meeting={meeting}
          open={index === 0}
          recording={recording}
          summary={summary}
          attachedByHand={attachedByHand[meeting.id] === client.id}
          sourceById={sourceById}
          timeZone={workspace.timeZone}
        />
      ),
    };
  });

  return (
    <ClientSheet client={client} tab="meetings">
      {meetings === null || meetings.length === 0 ? (
        <>
          {actions && (
            <div className="mb-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
              {actions}
            </div>
          )}
          {meetings === null ? (
            <ErrorState what="meetings" />
          ) : (
            <EmptyState title="No meetings yet.">
              Fathom recordings with {client.name} appear here, along with any
              notes you add by hand.
            </EmptyState>
          )}
        </>
      ) : (
        <DataList
          rows={rows}
          noun={['meeting', 'meetings']}
          placeholder="Search titles, people, summaries"
          pageSize={10}
          layout={{ kind: 'cards' }}
          actions={actions}
        />
      )}
    </ClientSheet>
  );
}

/** One meeting, which opens and closes in the browser. */
function MeetingCard({
  meeting,
  open,
  recording,
  summary,
  attachedByHand,
  sourceById,
  timeZone,
}: {
  meeting: Meeting;
  open: boolean;
  recording: Source | undefined;
  summary: string | null;
  attachedByHand: boolean;
  sourceById: Map<string, Source>;
  timeZone: string;
}) {
  const noted =
    meeting.planning.length +
      meeting.concerns.length +
      meeting.askedFor.length >
    0;
  return (
    <li>
      <article
        aria-labelledby={`${meeting.id}-title`}
        className="rounded-card bg-sheet shadow-card"
      >
        <details open={open} className="group">
          <summary className="flex cursor-pointer list-none items-start gap-3 rounded-card p-5 [&::-webkit-details-marker]:hidden [&:hover_svg]:text-ink">
            <ChevronRight
              aria-hidden
              className="mt-1 size-4 shrink-0 text-muted transition-transform group-open:rotate-90"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2
                  id={`${meeting.id}-title`}
                  className="text-section font-semibold"
                >
                  {meeting.title}
                </h2>
                <p className="text-meta text-muted">
                  {formatDate(meeting.occurredAt, timeZone)} ·{' '}
                  {meeting.durationMinutes} min
                </p>
              </div>
              <p className="mt-1 truncate text-meta text-muted group-open:whitespace-normal">
                {meeting.attendees
                  .map((a) => `${a.name}${a.role === 'msp' ? ' (MSP)' : ''}`)
                  .join(', ')}
              </p>
            </div>
          </summary>

          <div className="px-5 pb-5 sm:pl-12">
            {noted && (
              <MeetingSummary
                meeting={meeting}
                sourceById={sourceById}
                className="sm:grid sm:grid-cols-3 sm:gap-6"
              />
            )}
            {summary && (
              <section
                aria-label="Summary from Fathom"
                className="mt-4 first:mt-0"
              >
                <p className="text-meta-sm font-medium text-muted">
                  Summary from Fathom
                </p>
                <Markdown text={summary} className="mt-2 max-w-3xl" />
              </section>
            )}
            {recording && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 first:mt-0">
                <SourceLine source={recording} timeZone={timeZone} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {attachedByHand && (
                    <>
                      <span className="text-meta text-muted">
                        Attached by hand
                      </span>
                      <DetachMeeting meetingId={meeting.id} />
                    </>
                  )}
                  <a
                    href={recording.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-row text-meta text-muted underline-offset-2 hover:text-ink hover:underline"
                  >
                    Open in Fathom
                  </a>
                </div>
              </div>
            )}
          </div>
        </details>
      </article>
    </li>
  );
}
