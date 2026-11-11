'use client';

import { Link2 } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { attachMeeting } from '@/app/(workspace)/meetings/actions';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { BusyIcon } from '@/components/ui/spinner';
import type { UnmatchedRow } from '@/lib/client-views';

/** Shown before "Show all": the newest, which are the likeliest to matter. */
const SHOWN = 20;

export type ClientOption = { id: string; name: string };

/**
 * Recordings Fathom couldn't match to a client, newest first, each with a
 * client to attach it to. Once attached it moves to that client for good.
 */
export function UnmatchedMeetings({
  meetings,
  clients,
}: {
  meetings: UnmatchedRow[];
  clients: ClientOption[];
}) {
  const [all, setAll] = useState(false);
  const shown = all ? meetings : meetings.slice(0, SHOWN);
  return (
    <>
      <ul className="flex flex-col gap-1">
        {shown.map((meeting) => (
          <UnmatchedMeeting
            key={meeting.id}
            meeting={meeting}
            clients={clients}
          />
        ))}
      </ul>
      {!all && meetings.length > SHOWN && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setAll(true)}
        >
          Show all {meetings.length}
        </Button>
      )}
    </>
  );
}

function UnmatchedMeeting({
  meeting,
  clients,
}: {
  meeting: UnmatchedRow;
  clients: ClientOption[];
}) {
  const id = useId();
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const attach = () =>
    startTransition(async () => {
      setError(null);
      const result = await attachMeeting(meeting.id, clientId);
      if (!result.ok) setError(result.error);
    });

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl px-4 py-3.5 text-small odd:bg-grey-1">
      <div className="min-w-0">
        <p className="font-semibold">{meeting.title}</p>
        <p className="mt-0.5 text-[0.75rem] text-muted">
          <span title={meeting.at}>{meeting.when}</span> · {meeting.invited}
          {meeting.url && (
            <>
              {' · '}
              <a
                href={meeting.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm underline decoration-muted/40 underline-offset-[3px] hover:text-ink hover:decoration-ink"
              >
                Open in Fathom
              </a>
            </>
          )}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-[0.75rem] text-attention">
            {error}
          </p>
        )}
        <p role="status" className="sr-only">
          {pending ? `Attaching “${meeting.title}”` : ''}
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          attach();
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor={id} className="sr-only">
          Client “{meeting.title}” was with
        </label>
        <div className="w-52">
          <Select
            id={id}
            compact
            value={clientId}
            disabled={pending}
            onChange={(event) => setClientId(event.target.value)}
          >
            <option value="" disabled>
              Choose a client
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={!clientId || pending}
        >
          <BusyIcon icon={Link2} busy={pending} />
          Attach
        </Button>
      </form>
    </li>
  );
}
