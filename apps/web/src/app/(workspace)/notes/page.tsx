import { hasRole } from '@dossierhq/contracts';
import { Suspense } from 'react';
import { AddMeetingNotes } from '@/components/client/add-meeting-notes';
import { CopyAddress } from '@/components/notes/copy-address';
import { NoteCard } from '@/components/notes/note-card';
import { Sheet } from '@/components/ui/sheet';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import {
  getClients,
  getMe,
  getNotesInbox,
  getNow,
  getWorkspace,
} from '@/lib/data';
import { orEmpty, orNull } from '@/lib/data/safe';
import { calendarDateIn } from '@/lib/format';

export const metadata = { title: 'Notes inbox' };

export default function NotesInboxPage() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto flex max-w-220 flex-col gap-10">
        <Suspense fallback={<InboxSkeleton />}>
          <Inbox />
        </Suspense>
      </div>
    </Sheet>
  );
}

async function Inbox() {
  const [inbox, clients, me, workspace, now] = await Promise.all([
    getNotesInbox().catch(orNull),
    getClients().catch(orEmpty),
    getMe().catch(orNull),
    getWorkspace(),
    getNow(),
  ]);
  const options = clients.map(({ id, name }) => ({ id, name }));

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-title-compact sm:text-title">Notes inbox</h1>
          <p className="mt-3 max-w-2xl text-text">
            Notes from meetings Fathom didn’t record. Forward them by email or
            add them here; the ones no client claims wait here until someone
            files them.
          </p>
        </div>
        <AddMeetingNotes
          clients={options}
          today={calendarDateIn(now, workspace.timeZone)}
        />
      </header>

      {inbox === null ? (
        <ErrorState what="the notes inbox" />
      ) : (
        <>
          <section
            aria-labelledby="forward-heading"
            className="rounded-card bg-sheet p-5 shadow-card"
          >
            <h2 id="forward-heading" className="text-section font-semibold">
              Forward notes by email
            </h2>
            {inbox.address ? (
              <>
                <p className="mt-1 max-w-2xl text-meta text-text">
                  Forward meeting notes, or a thread about a meeting, from the
                  address you sign in with. Notes that mention one client’s
                  people are filed with that client; the rest wait here.
                </p>
                <CopyAddress address={inbox.address} />
              </>
            ) : (
              <p className="mt-1 max-w-2xl text-meta text-muted">
                Forwarding isn’t set up for this Dossier yet.{' '}
                {hasRole(me?.role, 'admin')
                  ? 'Set INBOUND_EMAIL_ADDRESS and INBOUND_WEBHOOK_TOKEN on the API; the README says how.'
                  : 'An owner or admin can set it up.'}
              </p>
            )}
          </section>

          <section aria-labelledby="waiting-heading">
            <h2 id="waiting-heading" className="text-section font-semibold">
              Waiting for a client
            </h2>
            {inbox.notes.length === 0 ? (
              <EmptyState title="Nothing waiting." className="mt-3">
                Notes you forward or add without a client wait here until
                someone files them.
              </EmptyState>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {inbox.notes.map((note, index) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    open={index === 0}
                    clients={options}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

function InboxSkeleton() {
  return (
    <div>
      <LoadingLabel what="the notes inbox" />
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-4 h-4 w-full max-w-xl" />
      <Skeleton className="mt-10 h-32 w-full rounded-card" />
    </div>
  );
}
