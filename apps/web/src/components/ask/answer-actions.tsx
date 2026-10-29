'use client';

import { Link2, RotateCcw } from 'lucide-react';
import { useActionState, useState, useTransition } from 'react';
import { askDossier, deleteAskAnswer, type AskState } from '@/app/ask-actions';
import { Button } from '@/components/ui/button';

/**
 * Under an answer: ask the same question again (a fresh answer, on its own
 * page), copy the link to share it, and delete it, after asking.
 */
export function AnswerActions({
  id,
  question,
  canDelete,
}: {
  id: string;
  question: string;
  /** The person who asked, or an admin. */
  canDelete: boolean;
}) {
  const [state, ask, asking] = useActionState<AskState, FormData>(
    askDossier,
    {},
  );
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();

  function remove() {
    setError(null);
    startDeleting(async () => {
      const result = await deleteAskAnswer(id);
      if (!result.ok) setError(result.error);
    });
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-meta text-ink">
          Delete this question and its answer for everyone?
        </span>
        <Button disabled={deleting} onClick={remove}>
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
        <Button
          variant="ghost"
          disabled={deleting}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
        {error && (
          <p role="alert" className="w-full text-meta text-alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={ask}>
        <input type="hidden" name="question" value={question} />
        <Button type="submit" disabled={asking}>
          <RotateCcw aria-hidden strokeWidth={1.75} />
          {asking ? 'Asking…' : 'Ask again'}
        </Button>
      </form>
      <Button
        variant="ghost"
        onClick={() =>
          void navigator.clipboard.writeText(window.location.href).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        <Link2 aria-hidden strokeWidth={1.75} />
        {copied ? 'Link copied' : 'Copy link'}
      </Button>
      {canDelete && (
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      )}
      {state.error && !asking && (
        <p role="alert" className="w-full text-meta text-alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
