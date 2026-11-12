import type { Metadata } from 'next';
import Image from 'next/image';
import { ReadFailed } from '@/components/clients/client-tab';
import { NotesInbox } from '@/components/notes/notes-inbox';
import { TopBar } from '@/components/shell/top-bar';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { noteRows } from '@/lib/client-views';
import { getMe } from '@/lib/data/auth';
import { getClientNames } from '@/lib/data/clients';
import { getNotesInbox } from '@/lib/data/notes';
import { orNull } from '@/lib/data/safe';
import { dayIn } from '@/lib/format';
import inbox from '@/public/illustrations/13-inbox-tray 1.png';

export const metadata: Metadata = { title: 'Notes inbox' };

/**
 * Notes from meetings Fathom didn't record: forwarded by email, or added
 * here. The ones no client claimed wait to be filed with one.
 */
export default function NotesPage() {
  return (
    <>
      <TopBar
        title="Notes inbox"
        subtitle="Notes from meetings Fathom didn’t record"
      />
      <Reveal
        fallback={
          <div className="mt-6">
            <IndexLoader className="h-[26rem]" label="Loading your notes" />
          </div>
        }
      >
        <Inbox />
      </Reveal>
    </>
  );
}

async function Inbox() {
  const [notes, clientNames, me] = await Promise.all([
    getNotesInbox().catch(orNull),
    getClientNames().catch(orNull),
    getMe(),
  ]);
  if (notes === null) {
    return (
      <div className="mt-6">
        <ReadFailed what="your notes inbox" />
      </div>
    );
  }
  const now = new Date();
  const timeZone = me.workspace.timeZone;
  const clients = [...(clientNames ?? new Map<string, string>())]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
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
      notes={noteRows(notes.notes, { timeZone, now })}
      clients={clients}
      today={dayIn(now, timeZone)}
    />
  );
}
