'use client';

import { X } from 'lucide-react';
import { useId, useRef, useState, useTransition } from 'react';
import { attachMeeting } from '@/app/actions';
import { Button } from '@/components/ui/button';

/** A recorded meeting no client matched, formatted for the list. */
export type AttachableMeeting = {
  id: string;
  title: string;
  /** e.g. "12 Oct 2026 · 32 min". */
  when: string;
  attendees: string;
  domains: string[];
  url: string;
};

/**
 * For Fathom meetings matching by domain couldn't place. Opens a modal
 * listing them; each one attached leaves the list when the page refreshes,
 * so several can be attached in a row.
 */
export function AttachMeeting({
  clientId,
  clientName,
  meetings,
}: {
  clientId: string;
  clientName: string;
  meetings: AttachableMeeting[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [attaching, setAttaching] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setStatus('');
    setError(null);
    dialogRef.current?.showModal();
  }

  function attach(meeting: AttachableMeeting) {
    setError(null);
    setAttaching(meeting.id);
    startTransition(async () => {
      const result = await attachMeeting(meeting.id, clientId);
      setAttaching(null);
      if (!result.ok) setError(result.error);
      else setStatus(`Attached “${meeting.title}” to ${clientName}.`);
    });
  }

  return (
    <>
      <Button onClick={open}>Attach a meeting</Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-card bg-sheet p-0 text-text shadow-float backdrop:bg-ink/30"
      >
        <div className="flex max-h-[min(720px,calc(100vh-4rem))] flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-section font-semibold">
                Attach a meeting to {clientName}
              </h2>
              <p className="mt-1 text-meta text-muted">
                Fathom meetings Dossier couldn’t match to a client by the
                invitees’ email domains. An attached meeting stays with{' '}
                {clientName} through later syncs.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>

          <p role="status" className="text-meta text-ink empty:hidden">
            {status}
          </p>
          {error && (
            <p role="alert" className="text-meta text-alert">
              {error}
            </p>
          )}

          {meetings.length === 0 ? (
            <p className="rounded-card bg-surface-soft px-4 py-6 text-center text-meta text-muted">
              Every Fathom meeting is attached to a client.
            </p>
          ) : (
            <ul className="-mx-1 flex flex-col gap-2 overflow-y-auto px-1 pb-1">
              {meetings.map((meeting) => (
                <li
                  key={meeting.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card bg-surface-soft p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{meeting.title}</p>
                    <p className="text-meta text-muted">{meeting.when}</p>
                    <p className="mt-1 truncate text-meta text-muted">
                      {meeting.attendees}
                    </p>
                    {meeting.domains.length > 0 && (
                      <p className="text-meta text-muted">
                        From {meeting.domains.join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={meeting.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-row px-2 text-meta text-muted underline-offset-2 hover:text-ink hover:underline"
                    >
                      Open in Fathom
                    </a>
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => attach(meeting)}
                    >
                      {attaching === meeting.id ? 'Attaching…' : 'Attach'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}

/** Undoes attaching a meeting by hand, so matching places it again. */
export function DetachMeeting({ meetingId }: { meetingId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function detach() {
    setError(null);
    startTransition(async () => {
      const result = await attachMeeting(meetingId, null);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      {error && (
        <span role="alert" className="text-meta text-alert">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={detach}
        disabled={pending}
        className="rounded-row text-meta text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
      >
        {pending ? 'Detaching…' : 'Detach'}
      </button>
    </>
  );
}
