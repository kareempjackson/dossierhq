'use client';

import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { deleteQuestion } from '@/app/(workspace)/actions';
import { Mark } from '@/components/brand/logo';
import type { AskRow, AskState } from '@/lib/ask-views';
import { cn } from '@/lib/cn';
import { CopyLinkButton } from './copy-link-button';
import {
  DeleteConfirmPanel,
  DeleteTrigger,
  useDeleteAsk,
} from './delete-question';

const FILTERS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'mine', label: 'Mine' },
] as const;

/** A question that isn't plainly answered says where it stands. */
const STATE_NOTE: Partial<Record<AskState, string>> = {
  answering: 'Answering…',
  'not-found': 'Not in the records',
  failed: 'Couldn’t answer',
};

/** A question as a note quotes it, at most about a line. */
const quoted = (question: string) =>
  `“${question.length > 60 ? `${question.slice(0, 59)}…` : question}”`;

/**
 * Every question asked here, or only yours. Each row opens its answer. Both
 * lists come from the server at once, so switching is instant. A deleted
 * question leaves both lists at once; if the API says no, it comes back
 * with the reason.
 */
export function AskHistory({
  everyone,
  mine,
}: {
  everyone: AskRow[];
  mine: AskRow[];
}) {
  const [who, setWho] = useState<(typeof FILTERS)[number]['value']>('everyone');
  const [gone, markGone] = useOptimistic<string[], string>([], (ids, id) => [
    ...ids,
    id,
  ]);
  const [deleting, startDeleting] = useTransition();
  const [note, setNote] = useState<{ error?: string; done?: string }>({});
  const shown = (who === 'mine' ? mine : everyone).filter(
    (item) => !gone.includes(item.id),
  );

  const remove = (item: AskRow) =>
    startDeleting(async () => {
      markGone(item.id);
      setNote({});
      const result = await deleteQuestion(item.id);
      setNote(
        result.ok
          ? { done: `Deleted ${quoted(item.question)}.` }
          : { error: result.error },
      );
    });

  return (
    <>
      <div role="group" aria-label="Whose questions" className="flex gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={who === filter.value}
            onClick={() => setWho(filter.value)}
            className={cn(
              'rounded-full px-3 py-1 text-small transition-colors',
              who === filter.value
                ? 'bg-white text-ink ring-1 ring-grey-3'
                : 'bg-grey-2 text-muted hover:text-ink',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>
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
        <ul className="mt-4 flex flex-col gap-2.5">
          {shown.map((item) => (
            <AskItem
              key={item.id}
              item={item}
              busy={deleting}
              onDelete={() => remove(item)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-grey-1 px-4 py-6 text-small text-muted">
          {who === 'mine'
            ? 'You haven’t asked anything yet. Ask above; every answer cites its records.'
            : 'Nobody has asked anything yet. Ask above; every answer cites its records.'}
        </p>
      )}
    </>
  );
}

/**
 * One question; the whole row opens its answer. Copy link and Delete sit
 * above the row's link, together: stacked on a phone, side by side wider.
 * Delete's confirm takes the row's full width.
 */
function AskItem({
  item,
  busy,
  onDelete,
}: {
  item: AskRow;
  busy: boolean;
  onDelete: () => void;
}) {
  const ask = useDeleteAsk();
  const note = STATE_NOTE[item.state];
  const href = `/ask/${encodeURIComponent(item.id)}`;

  return (
    <li className="relative flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-grey-1 px-4 py-3.5 transition-colors hover:bg-grey-2">
      <Mark height={14} className="text-ink" />
      <div className="min-w-[12rem] flex-1">
        <Link
          href={href}
          className="rounded-sm font-medium after:absolute after:inset-0 after:rounded-xl"
        >
          {item.question}
        </Link>
        <p className="text-small text-muted">
          {item.askedBy} · <span title={item.askedAtFull}>{item.askedAt}</span>
        </p>
      </div>
      {(note || item.scope) && (
        <p className="text-small text-muted">{note ?? item.scope}</p>
      )}
      <div className="relative z-10 flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
        <CopyLinkButton path={href} />
        {item.canDelete && !ask.asking && (
          <DeleteTrigger
            ask={ask}
            busy={busy}
            className="text-small font-medium"
          />
        )}
      </div>
      {item.canDelete && ask.asking && (
        <DeleteConfirmPanel
          ask={ask}
          busy={busy}
          onConfirm={onDelete}
          className="relative z-10 bg-white"
        />
      )}
    </li>
  );
}
