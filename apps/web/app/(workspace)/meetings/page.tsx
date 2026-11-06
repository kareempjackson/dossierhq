import type { Metadata } from 'next';
import { TopBar } from '@/components/shell/top-bar';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Meetings' };

/**
 * Every client's meetings, newest first. Empty until Fathom is connected and
 * meetings are read from the API.
 */
export default function MeetingsPage() {
  return (
    <>
      <TopBar
        title="Meetings"
        subtitle="Client meetings, and what was promised in them"
      />
      <div className="mt-6 grid place-items-center rounded-2xl bg-grey-1 p-10 text-center">
        <div className="max-w-md">
          <p className="font-display text-h2">No meetings yet.</p>
          <p className="mt-2 text-small text-muted">
            Connect Fathom and each client’s meetings land here, with the
            follow-ups you promised in them.
          </p>
          <ButtonLink href="/connections/fathom" variant="act" className="mt-5">
            Connect Fathom
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
