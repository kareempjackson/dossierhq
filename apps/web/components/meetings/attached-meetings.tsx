'use client';

import { Unlink } from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { detachMeeting } from '@/app/(workspace)/meetings/actions';
import {
  ConfirmPanel,
  ConfirmTrigger,
  useConfirm,
} from '@/components/ui/inline-confirm';
import type { AttachedRow } from '@/lib/client-views';

/**
 * Recordings someone attached to a client by hand. Detaching one asks
 * first, then hands it back to matching by email domain, which places it
 * again when Fathom next syncs. In a support view they only show.
 */
export function AttachedMeetings({
  rows,
  showClient,
  readOnly,
}: {
  rows: AttachedRow[];
  /** On /meetings each row names its client; on a client's file it doesn't. */
  showClient: boolean;
  readOnly: boolean;
}) {
  const [shown, drop] = useOptimistic(rows, (current, id: string) =>
    current.filter((row) => row.id !== id),
  );
  const [busy, startDetaching] = useTransition();
  const [note, setNote] = useState<{ error?: string; done?: string }>({});

  const detach = (row: AttachedRow) =>
    startDetaching(async () => {
      drop(row.id);
      setNote({});
      const result = await detachMeeting(row.id);
      setNote(
        result.ok
          ? {
              done: `Detached “${row.title}”. Dossier matches it to a client again when Fathom next syncs.`,
            }
          : { error: result.error },
      );
    });

  return (
    <>
      {(note.error || note.done) && (
        <p
          role={note.error ? 'alert' : 'status'}
          className={
            note.error
              ? 'mb-3 text-small text-attention'
              : 'mb-3 text-small text-healthy'
          }
        >
          {note.error ?? note.done}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="flex flex-col gap-2">
          {shown.map((row) => (
            <Row
              key={row.id}
              row={row}
              showClient={showClient}
              readOnly={readOnly}
              busy={busy}
              onDetach={() => detach(row)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function Row({
  row,
  showClient,
  readOnly,
  busy,
  onDetach,
}: {
  row: AttachedRow;
  showClient: boolean;
  readOnly: boolean;
  busy: boolean;
  onDetach: () => void;
}) {
  const confirm = useConfirm();
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-grey-1 px-4 py-3">
      <div className="min-w-0">
        <p className="text-small font-medium">{row.title}</p>
        <p className="text-[0.75rem] text-muted">
          {row.when}
          {showClient && (
            <>
              {row.when && ' · '}
              <Link
                href={`/clients/${encodeURIComponent(row.clientId)}/meetings`}
                className="rounded-sm underline decoration-ink/20 underline-offset-[3px] hover:text-ink"
              >
                {row.clientName}
              </Link>
            </>
          )}
        </p>
      </div>
      {!readOnly &&
        (confirm.asking ? (
          <ConfirmPanel
            confirm={confirm}
            busy={busy}
            label="Detach this meeting"
            message={`Detach “${row.title}” from ${row.clientName}? Dossier matches it again by its invitees’ email domains.`}
            confirmLabel="Detach"
            icon={Unlink}
            onConfirm={onDetach}
            className="bg-white"
          />
        ) : (
          <ConfirmTrigger
            confirm={confirm}
            busy={busy}
            className="text-small font-medium"
          >
            Detach
          </ConfirmTrigger>
        ))}
    </li>
  );
}
