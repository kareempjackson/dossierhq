import type { Metadata } from 'next';
import Image from 'next/image';
import { NotesInbox } from '@/components/notes/notes-inbox';
import { TopBar } from '@/components/shell/top-bar';
import { getWorkspace } from '@/lib/workspace';
import inbox from '@/public/illustrations/13-inbox-tray 1.png';

export const metadata: Metadata = { title: 'Notes inbox' };

/** Notes from meetings Fathom didn't record: forwarded by email, or added here. */
export default function NotesPage() {
  const { notes, clients } = getWorkspace();
  return (
    <>
      <TopBar
        title="Notes inbox"
        subtitle="Notes from meetings Fathom didn’t record"
      />
      <NotesInbox
        address={notes.address}
        illustration={
          <Image
            src={inbox}
            alt=""
            sizes="22rem"
            loading="eager"
            className="pointer-events-none absolute top-1/2 right-0 hidden h-auto w-[22rem] -translate-y-1/2 lg:block xl:right-8"
          />
        }
        waiting={notes.waiting}
        clients={clients.map((client) => ({
          id: client.id,
          name: client.name,
        }))}
      />
    </>
  );
}
