'use client';

import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { deleteNote } from '@/app/(workspace)/notes/actions';
import {
  ConfirmPanel,
  ConfirmTrigger,
  useConfirm,
} from '@/components/ui/inline-confirm';
import { cn } from '@/lib/cn';
import type { ClientNoteView } from '@/lib/client-views';

/**
 * A client's meeting notes, newest meeting first, with what Dossier read
 * from each. Deleting asks first and takes them away for everyone, so
 * reports stop citing them. In a support view they only show.
 */
export function NotesView({
  clientName,
  notes,
  readOnly,
}: {
  clientName: string;
  notes: ClientNoteView[];
  readOnly: boolean;
}) {
  const [shown, drop] = useOptimistic(notes, (current, id: string) =>
    current.filter((note) => note.id !== id),
  );
  const [busy, startDeleting] = useTransition();
  const [note, setNote] = useState<{ error?: string; done?: string }>({});

  const remove = (gone: ClientNoteView) =>
    startDeleting(async () => {
      drop(gone.id);
      setNote({});
      const result = await deleteNote(gone.id);
      setNote(
        result.ok
          ? { done: `Deleted “${gone.title}”.` }
          : { error: result.error },
      );
    });

  return (
    <section aria-labelledby="client-notes">
      <h2 id="client-notes" className="text-h3">
        Notes
      </h2>
      <p className="mt-1 max-w-2xl text-small text-muted">
        Notes from meetings Fathom didn’t record, filed with {clientName}.
        Dossier reads them for what was asked, worried about and planned.
      </p>
      {(note.error || note.done) && (
        <p
          role={note.error ? 'alert' : 'status'}
          className={cn(
            'mt-3 text-small',
            note.error ? 'text-attention' : 'text-healthy',
          )}
        >
          {note.error ?? note.done}
        </p>
      )}
      {shown.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {shown.map((item) => (
            <Note
              key={item.id}
              note={item}
              busy={busy}
              readOnly={readOnly}
              onDelete={() => remove(item)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-grey-1 px-4 py-6 text-small text-muted">
          No notes filed with {clientName} yet. Add them, or file forwarded
          ones, from the{' '}
          <Link
            href="/notes"
            className="rounded-sm font-medium text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink"
          >
            notes inbox
          </Link>
          .
        </p>
      )}
    </section>
  );
}

function Note({
  note,
  busy,
  readOnly,
  onDelete,
}: {
  note: ClientNoteView;
  busy: boolean;
  readOnly: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 rounded-xl bg-grey-1 p-4">
      <div className="min-w-0 flex-1 basis-72">
        <h3 className="font-sans text-base font-medium tracking-normal">
          {note.title}
        </h3>
        <p className="text-[0.75rem] text-muted">{note.meta}</p>
        <p
          className={cn(
            'mt-2 text-small whitespace-pre-line [overflow-wrap:anywhere]',
            note.long && !open && 'line-clamp-6',
          )}
        >
          {note.body}
        </p>
        {note.long && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="mt-1 rounded-sm text-small font-medium underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink"
          >
            {open ? 'Show less' : 'Show all'}
          </button>
        )}
        {note.points.length > 0 && (
          <ul
            aria-label="What Dossier read from them"
            className="mt-3 flex flex-wrap gap-2"
          >
            {note.points.map((point, index) => (
              <li
                key={index}
                className="rounded-lg bg-white px-2.5 py-1 text-[0.75rem]"
              >
                <span className="text-muted">{point.kind}:</span> {point.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      {!readOnly &&
        (confirm.asking ? (
          <ConfirmPanel
            confirm={confirm}
            busy={busy}
            label="Delete these notes"
            message={`Delete “${note.title}”? They go for everyone here, and reports stop citing them.`}
            confirmLabel="Delete"
            icon={Trash2}
            onConfirm={onDelete}
            className="bg-white"
          />
        ) : (
          <ConfirmTrigger
            confirm={confirm}
            busy={busy}
            className="text-small font-medium"
          >
            Delete
          </ConfirmTrigger>
        ))}
    </li>
  );
}
