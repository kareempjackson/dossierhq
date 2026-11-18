'use client';

import { Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { deleteQuestion } from '@/app/(workspace)/actions';
import { Button } from '@/components/ui/button';
import { BusyIcon } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';

/**
 * Deleting a question takes the question and its answer away for everyone
 * here, so Delete asks first, in place. These are the pieces: whether it's
 * asking, the Delete button, and the confirm that replaces it. Cancel or
 * Escape puts Delete back, with focus on it.
 */
export type DeleteAsk = {
  asking: boolean;
  /** Cancelled before: Delete comes back focused. */
  cancelled: boolean;
  ask: () => void;
  cancel: () => void;
};

export function useDeleteAsk(): DeleteAsk {
  const [asking, setAsking] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  return {
    asking,
    cancelled,
    ask: () => setAsking(true),
    cancel: () => {
      setCancelled(true);
      setAsking(false);
    },
  };
}

export function DeleteTrigger({
  ask,
  busy,
  className,
}: {
  ask: DeleteAsk;
  busy: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      // It's drawn afresh after the confirm, so this focuses it then.
      autoFocus={ask.cancelled}
      onClick={ask.ask}
      disabled={busy}
      className={cn(
        'rounded-sm text-muted hover:text-ink disabled:opacity-50',
        className,
      )}
    >
      Delete
    </button>
  );
}

/** In a wrapping flex row, it takes a line of its own. */
export function DeleteConfirmPanel({
  ask,
  busy,
  onConfirm,
  className,
}: {
  ask: DeleteAsk;
  busy: boolean;
  onConfirm: () => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Delete this question"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) ask.cancel();
      }}
      className={cn(
        'flex basis-full flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left',
        className,
      )}
    >
      <p className="text-small text-ink">
        Delete this question and its answer for everyone here? Links to it stop
        working.
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          autoFocus
          disabled={busy}
          onClick={ask.cancel}
        >
          Cancel
        </Button>
        <Button variant="ink" size="sm" disabled={busy} onClick={onConfirm}>
          <BusyIcon icon={Trash2} busy={busy} />
          Delete
        </Button>
      </div>
    </div>
  );
}

/**
 * Deletes the question on its own answer page. The API's yes takes you
 * back to /ask; its no shows here, in its words.
 */
export function DeleteAnswer({ id }: { id: string }) {
  const ask = useDeleteAsk();
  const [error, setError] = useState<string>();
  const [busy, startDeleting] = useTransition();

  return (
    <>
      {ask.asking ? (
        <DeleteConfirmPanel
          ask={ask}
          busy={busy}
          onConfirm={() =>
            startDeleting(async () => {
              setError(undefined);
              const result = await deleteQuestion(id, true);
              // A yes redirects to /ask, so only a no comes back.
              if (result?.ok === false) setError(result.error);
            })
          }
          className="bg-grey-1"
        />
      ) : (
        <DeleteTrigger ask={ask} busy={busy} />
      )}
      {error && (
        <p role="alert" className="basis-full text-attention">
          {error}
        </p>
      )}
    </>
  );
}
