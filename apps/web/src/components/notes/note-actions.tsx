'use client';

import { useId, useState, useTransition } from 'react';
import { deleteNotes, fileNotes } from '@/app/notes-actions';
import type { ClientOption } from '@/components/client/add-meeting-notes';
import { Button } from '@/components/ui/button';

/**
 * Filing notes from the inbox with a client (given `clients`), or putting
 * them back there; and deleting them, after asking.
 */
export function NoteActions({
  id,
  title,
  clients,
}: {
  id: string;
  title: string;
  clients?: ClientOption[];
}) {
  const selectId = useId();
  const [clientId, setClientId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? 'Something went wrong.');
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {confirming ? (
        <>
          <span className="text-meta text-ink">Delete these notes?</span>
          <Button disabled={pending} onClick={() => run(() => deleteNotes(id))}>
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </>
      ) : (
        <>
          {clients ? (
            // A workspace with no clients yet has nothing to file them with.
            clients.length > 0 && (
              <>
                <label htmlFor={selectId} className="sr-only">
                  Client for “{title}”
                </label>
                <select
                  id={selectId}
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  className="h-9 max-w-56 rounded-input bg-surface px-3 text-body text-ink"
                >
                  <option value="" disabled>
                    Choose a client…
                  </option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                <Button
                  disabled={pending || !clientId}
                  onClick={() => run(() => fileNotes(id, clientId))}
                >
                  {pending ? 'Filing…' : 'File'}
                </Button>
              </>
            )
          ) : (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => fileNotes(id, null))}
            >
              Move to the inbox
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirming(true)}
          >
            Delete
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="w-full text-right text-meta text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
