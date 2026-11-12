'use client';

import { Check } from 'lucide-react';
import {
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { addNote, fileNote } from '@/app/(workspace)/notes/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BusyIcon } from '@/components/ui/spinner';
import type { NoteRow } from '@/lib/client-views';
import { CopyAddressButton } from './copy-address-button';

type Client = { id: string; name: string };

/** What was just done, for the line above the list. */
type Done =
  | { kind: 'filed'; note: NoteRow; client: Client }
  | { kind: 'added'; title: string; client: Client | null };

/**
 * The forwarding address, notes waiting for a client (each filed with one
 * chosen from the list) and a way to add notes by hand. Filing takes the
 * note off the list at once; the page then reads the inbox again.
 */
export function NotesInbox({
  address,
  illustration,
  notes,
  clients,
  today,
}: {
  /** The workspace's forwarding address; null until it has one. */
  address: string | null;
  illustration: ReactNode;
  /** Waiting for a client, newest meeting first. */
  notes: NoteRow[];
  clients: Client[];
  /** `YYYY-MM-DD` in the workspace's zone, for a new note's meeting day. */
  today: string;
}) {
  const [waiting, hide] = useOptimistic(notes, (current, id: string) =>
    current.filter((note) => note.id !== id),
  );
  const [done, setDone] = useState<Done | null>(null);
  const [problem, setProblem] = useState<{
    noteId: string;
    message: string;
  } | null>(null);
  const [undoProblem, setUndoProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);

  const file = (note: NoteRow, client: Client) =>
    startTransition(async () => {
      hide(note.id);
      setProblem(null);
      setUndoProblem(null);
      const result = await fileNote(note.id, client.id);
      if (result.ok) setDone({ kind: 'filed', note, client });
      else setProblem({ noteId: note.id, message: result.error });
    });

  const undo = (note: NoteRow) =>
    startTransition(async () => {
      setUndoProblem(null);
      const result = await fileNote(note.id, null);
      if (result.ok) setDone(null);
      else setUndoProblem(result.error);
    });

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
        {done && (
          <div
            role="status"
            className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-healthy-soft px-4 py-3 text-small"
          >
            <span>
              {done.kind === 'filed'
                ? `Filed “${done.note.title}” with ${done.client.name}.`
                : done.client
                  ? `Added “${done.title}” to ${done.client.name}.`
                  : `Added “${done.title}”. It’s waiting below for a client.`}
            </span>
            {done.kind === 'filed' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => undo(done.note)}
                className="rounded-sm font-medium underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink disabled:opacity-60"
              >
                Undo
              </button>
            )}
            {undoProblem && (
              <span role="alert" className="text-attention">
                {undoProblem}
              </span>
            )}
          </div>
        )}
        {waiting.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {waiting.map((note) => (
              <WaitingNote
                key={note.id}
                note={note}
                clients={clients}
                problem={problem?.noteId === note.id ? problem.message : null}
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
        today={today}
        onSaved={(title, client) => {
          setUndoProblem(null);
          setDone({ kind: 'added', title, client });
        }}
      />
    </>
  );
}

function WaitingNote({
  note,
  clients,
  problem,
  onFile,
}: {
  note: NoteRow;
  clients: Client[];
  /** Why filing it just failed, if it did. */
  problem: string | null;
  onFile: (note: NoteRow, client: Client) => void;
}) {
  const [clientId, setClientId] = useState('');
  const id = useId();
  const client = clients.find((each) => each.id === clientId);
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-grey-1 px-4 py-3">
      <div className="min-w-[14rem] flex-1">
        <p className="text-small font-medium">{note.title}</p>
        <p className="text-[0.75rem] text-muted">{note.meta}</p>
        {note.preview && (
          <p className="mt-1 line-clamp-2 max-w-2xl text-[0.75rem] text-muted">
            {note.preview}
          </p>
        )}
        {problem && (
          <p role="alert" className="mt-1 text-[0.75rem] text-attention">
            {problem}
          </p>
        )}
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
            compact
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className="bg-white!"
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
  today,
  onSaved,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  clients: Client[];
  today: string;
  onSaved: (title: string, client: Client | null) => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const close = () => {
    setError(null);
    ref.current?.close();
  };
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) close();
      }}
      onClose={() => setError(null)}
      className="mx-auto mt-[8vh] w-[min(34rem,calc(100%-2rem))] rounded-2xl bg-white p-0 text-ink shadow-float backdrop:bg-ink/25"
    >
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const field = (name: string) => String(data.get(name) ?? '');
          const title = field('title').trim();
          const client =
            clients.find((each) => each.id === field('client')) ?? null;
          startTransition(async () => {
            setError(null);
            const result = await addNote({
              title,
              occurredOn: field('occurredOn'),
              attendees: field('attendees'),
              body: field('body'),
              clientId: client?.id ?? null,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            form.reset();
            close();
            onSaved(title || 'Meeting notes', client);
          });
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
            maxLength={200}
            autoFocus
            placeholder="Call with Sarah"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-day`} className="text-small font-medium">
              Day of the meeting
            </label>
            <Input
              id={`${id}-day`}
              name="occurredOn"
              type="date"
              required
              max={today}
              defaultValue={today}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`${id}-attendees`}
              className="text-small font-medium"
            >
              Who was there (optional)
            </label>
            <Input
              id={`${id}-attendees`}
              name="attendees"
              placeholder="Sarah Lee, Tom Okafor"
            />
          </div>
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
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-attention-soft px-4 py-3 text-small text-attention"
          >
            {error}
          </p>
        )}
        <p role="status" className="sr-only">
          {pending ? 'Saving the notes' : ''}
        </p>
        <div className="mt-2 flex gap-3">
          <Button type="submit" variant="ink" disabled={pending}>
            <BusyIcon icon={Check} busy={pending} />
            Save notes
          </Button>
          <Button variant="outline" disabled={pending} onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </dialog>
  );
}
