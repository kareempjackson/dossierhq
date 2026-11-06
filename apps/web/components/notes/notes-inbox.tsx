'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { InboxNote } from '@/lib/workspace';
import { CopyAddressButton } from './copy-address-button';

type Client = { id: string; name: string };

/**
 * The forwarding address, notes waiting for a client (each filed with one
 * chosen from the list) and a way to add notes by hand. Kept in the browser
 * until the API is connected.
 */
export function NotesInbox({
  address,
  illustration,
  waiting: initial,
  clients,
}: {
  /** The workspace's forwarding address; null until it has one. */
  address: string | null;
  illustration: ReactNode;
  waiting: InboxNote[];
  clients: Client[];
}) {
  const [waiting, setWaiting] = useState(initial);
  const [filed, setFiled] = useState<{
    note: InboxNote;
    client: Client;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const file = (note: InboxNote, client: Client) => {
    setWaiting((current) => current.filter((each) => each.id !== note.id));
    setFiled({ note, client });
  };

  return (
    <>
      <section
        aria-labelledby="forward-notes"
        className="relative mt-6 overflow-hidden rounded-3xl bg-linear-to-br from-lilac to-lilac-mist p-6 sm:p-8"
      >
        <div className="relative z-10 max-w-xl">
          <h2
            id="forward-notes"
            className="font-sans text-small font-normal tracking-normal"
          >
            Forward notes by email
          </h2>
          <p className="mt-2 font-display text-h2 [overflow-wrap:anywhere]">
            {address ?? 'No forwarding address yet'}
          </p>
          <p className="mt-3 text-small">
            Forward from the address you sign in with. Notes that mention one
            client’s people are filed with that client; the rest wait here.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {address && <CopyAddressButton address={address} />}
            <Button
              variant="outline"
              onClick={() => dialog.current?.showModal()}
            >
              Add notes
            </Button>
          </div>
        </div>
        {illustration}
      </section>

      <section aria-labelledby="waiting" className="mt-8">
        <h2
          id="waiting"
          className="font-sans text-[0.75rem] font-normal tracking-normal text-muted"
        >
          Waiting for a client · {waiting.length}
        </h2>
        {filed && (
          <p
            role="status"
            className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-healthy-soft px-4 py-3 text-small"
          >
            <span>
              Filed “{filed.note.title}” with {filed.client.name}.
            </span>
            <button
              type="button"
              onClick={() => {
                setWaiting((current) => [filed.note, ...current]);
                setFiled(null);
              }}
              className="rounded-sm font-medium underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink"
            >
              Undo
            </button>
          </p>
        )}
        {waiting.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {waiting.map((note) => (
              <WaitingNote
                key={note.id}
                note={note}
                clients={clients}
                onFile={file}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted">
            Nothing waiting. Every note is filed with its client.
          </p>
        )}
      </section>

      <AddNotesDialog
        ref={dialog}
        clients={clients}
        onSave={(note, client) => {
          if (client) setFiled({ note, client });
          else setWaiting((current) => [note, ...current]);
        }}
      />
    </>
  );
}

function WaitingNote({
  note,
  clients,
  onFile,
}: {
  note: InboxNote;
  clients: Client[];
  onFile: (note: InboxNote, client: Client) => void;
}) {
  const [clientId, setClientId] = useState('');
  const id = useId();
  const client = clients.find((each) => each.id === clientId);
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-grey-1 px-4 py-3">
      <div className="min-w-[14rem] flex-1">
        <p className="text-small font-medium">{note.title}</p>
        <p className="text-[0.75rem] text-muted">{note.meta}</p>
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (client) onFile(note, client);
        }}
      >
        <label htmlFor={`${id}-client`} className="sr-only">
          Client for “{note.title}”
        </label>
        <div className="w-48">
          <Select
            id={`${id}-client`}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className="h-9 bg-white text-small"
          >
            <option value="">Choose a client</option>
            {clients.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="ink" size="sm" disabled={!client}>
          File
        </Button>
      </form>
    </li>
  );
}

function AddNotesDialog({
  ref,
  clients,
  onSave,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  clients: Client[];
  onSave: (note: InboxNote, client: Client | null) => void;
}) {
  const id = useId();
  const close = () => ref.current?.close();
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="mx-auto mt-[12vh] w-[min(34rem,calc(100%-2rem))] rounded-2xl bg-white p-0 text-ink shadow-float backdrop:bg-ink/25"
    >
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const title = String(data.get('title') ?? '').trim();
          const client =
            clients.find((each) => each.id === data.get('client')) ?? null;
          onSave(
            { id: `${Date.now()}`, title, meta: 'Added by you · just now' },
            client,
          );
          event.currentTarget.reset();
          close();
        }}
      >
        <h2 id={`${id}-title`} className="text-h3">
          Add notes
        </h2>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${id}-note-title`}
            className="text-small font-medium"
          >
            Title
          </label>
          <Input
            id={`${id}-note-title`}
            name="title"
            required
            autoFocus
            placeholder="Call with Sarah"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-body`} className="text-small font-medium">
            Notes
          </label>
          <textarea
            id={`${id}-body`}
            name="body"
            required
            rows={6}
            className="w-full resize-y rounded-xl bg-grey-1 p-4 text-body outline-none focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-lilac-deep focus-visible:ring-inset"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-client`} className="text-small font-medium">
            Client (optional)
          </label>
          <Select id={`${id}-client`} name="client" defaultValue="">
            <option value="">Leave it waiting here</option>
            {clients.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-2 flex gap-3">
          <Button type="submit" variant="ink">
            Save notes
          </Button>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </dialog>
  );
}
