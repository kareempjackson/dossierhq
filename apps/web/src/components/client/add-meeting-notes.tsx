'use client';

import { X } from 'lucide-react';
import { useActionState, useEffect, useId, useRef } from 'react';
import { addMeetingNotes, type NotesState } from '@/app/notes-actions';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/cn';

const fieldClass =
  'rounded-input bg-surface px-3 text-body font-normal text-ink placeholder:text-muted aria-invalid:outline-2 aria-invalid:outline-alert';

export type ClientOption = { id: string; name: string };

/**
 * For meetings Fathom didn't record. Opens a modal dialog. The notes are
 * filed with `client`; without one, with the client chosen from `clients`,
 * or they wait in the notes inbox.
 */
export function AddMeetingNotes({
  client,
  clients = [],
  today,
}: {
  client?: ClientOption;
  clients?: ClientOption[];
  /** The default meeting date, `YYYY-MM-DD`. */
  today?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const id = useId();
  const [state, action, pending] = useActionState<NotesState, FormData>(
    addMeetingNotes,
    {},
  );
  const invalid = (field: string) =>
    state.field === field
      ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` }
      : {};

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state]);

  return (
    <>
      <Button onClick={() => dialogRef.current?.showModal()}>
        {client ? 'Add meeting notes' : 'Add notes'}
      </Button>
      <span role="status" className="sr-only">
        {state.ok ? 'Meeting notes saved' : ''}
      </span>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-card bg-sheet p-0 text-text shadow-float backdrop:bg-ink/30"
      >
        <form action={action} className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-section font-semibold">
                Add meeting notes
              </h2>
              <p className="mt-1 text-meta text-muted">
                {client
                  ? `For a meeting with ${client.name} that Fathom didn’t record. They appear with its other meetings.`
                  : 'For a meeting Fathom didn’t record. Choose the client now, or leave the notes in the inbox to file later.'}
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

          {client ? (
            <input type="hidden" name="clientId" value={client.id} />
          ) : (
            <label className="flex flex-col gap-1.5 text-meta font-medium text-ink">
              Client
              <select
                name="clientId"
                defaultValue={state.values?.clientId ?? ''}
                className={cn(fieldClass, 'h-10')}
              >
                <option value="">Leave in the inbox</option>
                {clients.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-meta font-medium text-ink">
            <span>
              Title <span className="font-normal text-muted">(optional)</span>
            </span>
            <input
              name="title"
              maxLength={200}
              placeholder="Meeting notes"
              defaultValue={state.values?.title}
              className={cn(fieldClass, 'h-10')}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-meta font-medium text-ink">
              Meeting date
              <input
                type="date"
                name="occurredOn"
                required
                defaultValue={state.values?.occurredOn ?? today}
                {...invalid('occurredOn')}
                className={cn(fieldClass, 'h-10')}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-meta font-medium text-ink">
              Who was there
              <input
                name="attendees"
                placeholder="Names, comma separated"
                defaultValue={state.values?.attendees}
                {...invalid('attendees')}
                className={cn(fieldClass, 'h-10')}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-meta font-medium text-ink">
            Notes
            <textarea
              name="body"
              required
              rows={8}
              placeholder="What they are planning, what worries them, what they asked for"
              defaultValue={state.values?.body}
              {...invalid('body')}
              className={cn(fieldClass, 'resize-y py-2')}
            />
          </label>

          {state.error && (
            <div
              id={`${id}-error`}
              role="alert"
              className="rounded-tile bg-alert-soft px-4 py-3"
            >
              <StatusDot
                tone="failure"
                label={state.error}
                className="text-meta text-ink"
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save notes'}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
