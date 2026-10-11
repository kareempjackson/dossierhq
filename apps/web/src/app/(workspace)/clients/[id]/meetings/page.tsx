import { Suspense } from 'react';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import { MeetingSummary } from '@/components/client/meeting-summary';
import { SourceLine } from '@/components/ui/source-line';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { getClient, getMeetings, getSources, getWorkspace } from '@/lib/data';
import { formatDate } from '@/lib/format';

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]/meetings'>) {
  const client = await getClient((await params).id).catch(() => null);
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
  const [meetings, workspace] = await Promise.all([
    getMeetings({ clientId: client.id }).catch(() => null),
    getWorkspace(),
  ]);
  const sources = await getSources(
    (meetings ?? []).flatMap((meeting) => [
      meeting.recordingSourceId,
      ...[
        ...meeting.planning,
        ...meeting.concerns,
        ...meeting.askedFor,
      ].flatMap((point) => point.sourceIds),
    ]),
  ).catch(() => []);
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  return (
    <ClientSheet client={client} tab="meetings">
      {meetings === null ? (
        <ErrorState what="meetings" />
      ) : meetings.length === 0 ? (
        <EmptyState title="No meetings yet.">
          Fathom recordings with {client.name} appear here, along with any notes
          you add by hand.
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-4">
          {meetings.map((meeting) => {
            const recording = sourceById.get(meeting.recordingSourceId);
            return (
              <li key={meeting.id}>
                <article
                  aria-labelledby={`${meeting.id}-title`}
                  className="rounded-card bg-sheet p-5 shadow-card"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2
                      id={`${meeting.id}-title`}
                      className="text-section font-semibold"
                    >
                      {meeting.title}
                    </h2>
                    <p className="text-meta text-muted">
                      {formatDate(meeting.occurredAt, workspace.timeZone)} ·{' '}
                      {meeting.durationMinutes} min
                    </p>
                  </div>
                  <p className="mt-1 text-meta text-muted">
                    {meeting.attendees
                      .map(
                        (a) => `${a.name}${a.role === 'msp' ? ' (MSP)' : ''}`,
                      )
                      .join(', ')}
                  </p>
                  <MeetingSummary
                    meeting={meeting}
                    sourceById={sourceById}
                    className="mt-4 sm:grid sm:grid-cols-3 sm:gap-6"
                  />
                  {recording && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
                      <SourceLine
                        source={recording}
                        timeZone={workspace.timeZone}
                      />
                      <a
                        href={recording.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-row text-meta text-muted underline-offset-2 hover:text-ink hover:underline"
                      >
                        Open in Fathom
                      </a>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </ClientSheet>
  );
}
