import {
  ClientTab,
  ReadFailed,
  clientTabMetadata,
} from '@/components/clients/client-tab';
import { MeetingsView } from '@/components/clients/meetings-view';
import { AttachedMeetings } from '@/components/meetings/attached-meetings';
import { attachedRows, meetingViews } from '@/lib/client-views';
import {
  getCommitments,
  getMeetings,
  getSources,
} from '@/lib/data/client-records';
import { getConnectors } from '@/lib/data/connectors';
import { getMeetingAttachments } from '@/lib/data/meetings';
import { orNull } from '@/lib/data/safe';

export const generateMetadata = ({
  params,
}: PageProps<'/clients/[id]/meetings'>) =>
  clientTabMetadata(params, 'Meetings');

/** The client's meetings, with what was promised in each. */
export default function MeetingsPage({
  params,
}: PageProps<'/clients/[id]/meetings'>) {
  return (
    <ClientTab
      params={params}
      render={async (client, context) => {
        const [meetings, commitments, connectors, attachments] =
          await Promise.all([
            getMeetings(client.id).catch(orNull),
            getCommitments(client.id).catch(orNull),
            getConnectors().catch(orNull),
            getMeetingAttachments().catch(orNull),
          ]);
        if (meetings === null) {
          return <ReadFailed what="this client’s meetings" />;
        }
        const recordings =
          (await getSources(
            meetings.map((meeting) => meeting.recordingSourceId),
          ).catch(orNull)) ?? new Map();
        // Only this client's, named as it is now.
        const byHand = attachedRows(
          Object.fromEntries(
            Object.entries(attachments?.attached ?? {}).filter(
              ([, clientId]) => clientId === client.id,
            ),
          ),
          meetings,
          new Map([[client.id, client.name]]),
          context,
        );
        return (
          <>
            <MeetingsView
              fathomConnected={
                connectors?.some((each) => each.tool === 'fathom') ?? true
              }
              meetings={meetingViews(
                { meetings, commitments: commitments ?? [], recordings },
                context,
              )}
            />
            {byHand.length > 0 && (
              <section aria-labelledby="attached-by-hand" className="mt-10">
                <h2
                  id="attached-by-hand"
                  className="font-sans text-small font-normal tracking-normal text-muted"
                >
                  Attached to {client.name} by hand
                </h2>
                <p className="mt-1 max-w-2xl text-small text-muted">
                  No invitee’s email domain matched, so someone attached these
                  here. Detach one and Dossier matches it again when Fathom next
                  syncs.
                </p>
                <div className="mt-3">
                  <AttachedMeetings
                    rows={byHand}
                    showClient={false}
                    readOnly={context.support}
                  />
                </div>
              </section>
            )}
          </>
        );
      }}
    />
  );
}
