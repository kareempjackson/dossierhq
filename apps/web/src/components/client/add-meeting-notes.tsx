'use client';

import { X } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';

/**
 * For meetings Fathom didn't record. Opens a modal dialog; saving is UI only
 * until the API exists.
 */
export function AddMeetingNotes({ clientName }: { clientName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [saved, setSaved] = useState(false);

  function open() {
    setSaved(false);
    dialogRef.current?.showModal();
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.currentTarget.reset();
    dialogRef.current?.close();
    setSaved(true);
  }

  return (
    <>
      <Button onClick={open}>Add meeting notes</Button>
      <span role="status" className="sr-only">
        {saved ? 'Meeting notes saved' : ''}
      </span>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-card bg-sheet p-0 text-text shadow-float backdrop:bg-ink/30"
      >
        <form onSubmit={save} className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-section font-semibold">
                Add meeting notes
              </h2>
              <p className="mt-1 text-meta text-muted">
                For a meeting with {clientName} that Fathom didn’t record.
                Dossier cites these notes like any other source.
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

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-meta font-medium text-ink">
              Meeting date
              <input
                type="date"
                name="date"
                required
                className="h-10 rounded-input bg-surface px-3 text-body font-normal text-ink"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-meta font-medium text-ink">
              Who was there
              <input
                name="attendees"
                placeholder="Names, comma separated"
                className="h-10 rounded-input bg-surface px-3 text-body font-normal text-ink placeholder:text-muted"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-meta font-medium text-ink">
            Notes
            <textarea
              name="notes"
              required
              rows={6}
              placeholder="What they are planning, what worries them, what they asked for"
              className="resize-y rounded-input bg-surface px-3 py-2 text-body font-normal text-ink placeholder:text-muted"
            />
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="secondary">
              Save notes
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
