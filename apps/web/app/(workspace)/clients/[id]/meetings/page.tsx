import {
  ClientTab,
  ReadFailed,
  clientTabMetadata,
} from '@/components/clients/client-tab';
import { MeetingsView } from '@/components/clients/meetings-view';
import { meetingViews } from '@/lib/client-views';
import {
  getCommitments,
  getMeetings,
  getSources,
} from '@/lib/data/client-records';
import { getConnectors } from '@/lib/data/connectors';
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
        const [meetings, commitments, connectors] = await Promise.all([
          getMeetings(client.id).catch(orNull),
          getCommitments(client.id).catch(orNull),
          getConnectors().catch(orNull),
        ]);
        if (meetings === null) {
          return <ReadFailed what="this client’s meetings" />;
        }
        const recordings =
          (await getSources(
            meetings.map((meeting) => meeting.recordingSourceId),
          ).catch(orNull)) ?? new Map();
        return (
          <MeetingsView
            fathomConnected={
              connectors?.some((each) => each.tool === 'fathom') ?? true
            }
            meetings={meetingViews(
              { meetings, commitments: commitments ?? [], recordings },
              context,
            )}
          />
        );
      }}
    />
  );
}
