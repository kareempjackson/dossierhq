import type { Connector } from '@dossierhq/contracts';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReadFailed } from '@/components/clients/client-tab';
import { RefreshWhileSyncing } from '@/components/connections/refresh-while-syncing';
import { MeetingsTable } from '@/components/meetings/meetings-table';
import { UnmatchedMeetings } from '@/components/meetings/unmatched-meetings';
import { TopBar } from '@/components/shell/top-bar';
import { ButtonLink } from '@/components/ui/button';
import { IndexLoader } from '@/components/ui/index-loader';
import { LoaderPart, RevealPart } from '@/components/ui/reveal';
import { TextLink } from '@/components/ui/text-link';
import { meetingRows, unmatchedRows } from '@/lib/client-views';
import { getMe } from '@/lib/data/auth';
import { getClientNames } from '@/lib/data/clients';
import { getConnectors } from '@/lib/data/connectors';
import {
  getAllCommitments,
  getAllMeetings,
  getMeetingAttachments,
} from '@/lib/data/meetings';
import { orNull } from '@/lib/data/safe';
import { ago, plural } from '@/lib/format';

export const metadata: Metadata = { title: 'Meetings' };

const TITLE = 'Meetings';

/**
 * Every client's meetings from Fathom, newest first, and below them the
 * recordings Fathom couldn't match to a client, to attach by hand. The
 * title draws at once; the meetings stream in behind it.
 */
export default function MeetingsPage() {
  return (
    <Suspense
      fallback={
        <>
          <TopBar title={TITLE} subtitle="" />
          <LoaderPart>
            <div className="mt-6">
              <IndexLoader
                className="h-[26rem]"
                label="Loading your meetings"
              />
            </div>
          </LoaderPart>
        </>
      }
    >
      <Meetings />
    </Suspense>
  );
}

async function Meetings() {
  const [connectors, meetings, commitments, attachments, clientNames, me] =
    await Promise.all([
      getConnectors().catch(orNull),
      getAllMeetings().catch(orNull),
      getAllCommitments().catch(orNull),
      getMeetingAttachments().catch(orNull),
      getClientNames().catch(orNull),
      getMe(),
    ]);
  const fathom = connectors?.find((each) => each.tool === 'fathom');

  // Disconnecting forgets what Fathom brought in, so there's nothing to show.
  if (connectors && !fathom) return <NotConnected />;
  if (meetings === null) {
    return (
      <>
        <TopBar title={TITLE} subtitle="" />
        <div className="mt-6">
          <ReadFailed what="your meetings" />
        </div>
      </>
    );
  }

  const when = { timeZone: me.workspace.timeZone, now: new Date() };
  const names = clientNames ?? new Map<string, string>();
  const rows = meetingRows(
    { meetings, commitments: commitments ?? [], clientNames: names },
    when,
  );
  const unmatched = unmatchedRows(attachments?.unattached ?? [], when);
  const clients = [...names]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const firstSync = fathom?.status === 'syncing' && !fathom.lastSyncAt;

  return (
    <>
      {/* An attached meeting moves once Fathom's sync finishes. */}
      <RefreshWhileSyncing syncing={fathom?.status === 'syncing'} />
      <TopBar
        title={TITLE}
        subtitle={[
          plural(rows.length, 'meeting'),
          ...(fathom ? [fathomLine(fathom, when)] : []),
        ].join(' · ')}
      />
      <RevealPart>
        {fathom?.status === 'failing' && fathom.failure && (
          <div
            role="alert"
            className="mt-6 rounded-2xl bg-attention-soft px-5 py-4 text-small"
          >
            <p>{fathom.failure.summary}</p>
            <TextLink href="/connections/fathom" className="mt-1 inline-block">
              Open the Fathom connection
            </TextLink>
          </div>
        )}

        <section aria-label="Meetings with clients" className="mt-6">
          {rows.length > 0 ? (
            <MeetingsTable meetings={rows} />
          ) : (
            <p className="rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted">
              {firstSync
                ? 'Fathom’s first sync is running. Meetings land here when it finishes.'
                : unmatched.length > 0
                  ? 'No meeting is matched to a client yet. Attach the ones below to the clients they were with.'
                  : 'Fathom is connected. No meeting with a client has come in yet.'}
            </p>
          )}
        </section>

        {unmatched.length > 0 && (
          <section aria-labelledby="unmatched-meetings" className="mt-10">
            <h2 id="unmatched-meetings" className="text-h3">
              Not matched to a client · {unmatched.length}
            </h2>
            <p className="mt-1 max-w-2xl text-small text-muted">
              Fathom recorded these, but no invitee’s email domain matched a
              client. Attach one to the client it was with and it moves to that
              client’s file. Internal meetings can stay here.
            </p>
            <div className="mt-4">
              <UnmatchedMeetings meetings={unmatched} clients={clients} />
            </div>
          </section>
        )}
      </RevealPart>
    </>
  );
}

/** "Fathom synced 4 min ago", "Fathom is syncing", and so on. */
function fathomLine(
  fathom: Connector,
  { timeZone, now }: { timeZone: string; now: Date },
): string {
  if (fathom.status === 'syncing') {
    return fathom.lastSyncAt
      ? 'Fathom is syncing'
      : 'Fathom’s first sync is running';
  }
  if (fathom.status === 'failing') return 'Fathom’s syncs are failing';
  return fathom.lastSyncAt
    ? `Fathom synced ${ago(fathom.lastSyncAt, now, timeZone)}`
    : 'Waiting for Fathom’s first sync';
}

function NotConnected() {
  return (
    <>
      <TopBar
        title={TITLE}
        subtitle="Client meetings, and what was promised in them"
      />
      <RevealPart>
        <div className="mt-6 grid place-items-center rounded-2xl bg-grey-1 p-10 text-center">
          <div className="max-w-md">
            <p className="font-display text-h2">No meetings yet.</p>
            <p className="mt-2 text-small text-muted">
              Connect Fathom and each client’s meetings land here, with the
              follow-ups you promised in them.
            </p>
            <ButtonLink
              href="/connections/fathom"
              variant="act"
              className="mt-5"
            >
              Connect Fathom
            </ButtonLink>
          </div>
        </div>
      </RevealPart>
    </>
  );
}
