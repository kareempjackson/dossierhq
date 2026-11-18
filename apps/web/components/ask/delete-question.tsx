'use client';

import { Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { deleteQuestion } from '@/app/(workspace)/actions';
import {
  ConfirmPanel,
  ConfirmTrigger,
  useConfirm,
  type Confirm,
} from '@/components/ui/inline-confirm';

/**
 * Deleting a question takes the question and its answer away for everyone
 * here, so Delete asks first, in place: the shared inline confirm, worded
 * for questions.
 */
export type DeleteAsk = Confirm;
export const useDeleteAsk = useConfirm;

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
    <ConfirmTrigger confirm={ask} busy={busy} className={className}>
      Delete
    </ConfirmTrigger>
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
    <ConfirmPanel
      confirm={ask}
      busy={busy}
      label="Delete this question"
      message="Delete this question and its answer for everyone here? Links to it stop working."
      confirmLabel="Delete"
      icon={Trash2}
      onConfirm={onConfirm}
      className={className}
    />
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
