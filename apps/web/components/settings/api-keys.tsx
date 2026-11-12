'use client';

import { KeyRound, Trash2 } from 'lucide-react';
import { useActionState, useId, useState, useTransition } from 'react';
import {
  removeApiKey,
  saveApiKey,
  type KeyFormState,
} from '@/app/(workspace)/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BusyIcon } from '@/components/ui/spinner';
import { Tag } from '@/components/ui/tag';
import type { KeyRow } from '@/lib/settings-views';

/**
 * Each provider's key: the workspace's own (only its last four characters),
 * Dossier's, or none yet. Owners and admins add, replace and remove them.
 */
export function ApiKeys({
  rows,
  canManage,
  canStoreKeys,
}: {
  rows: KeyRow[];
  canManage: boolean;
  /** False when this Dossier has nowhere safe to keep keys. */
  canStoreKeys: boolean;
}) {
  return (
    <>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <KeyItem
            key={row.provider}
            row={row}
            canChange={canManage && canStoreKeys}
          />
        ))}
      </ul>
      {!canManage ? (
        <p className="mt-3 text-[0.75rem] text-muted">
          Only owners and admins can add or remove keys.
        </p>
      ) : (
        !canStoreKeys && (
          <p className="mt-3 text-[0.75rem] text-muted">
            This Dossier can’t keep keys safely yet: its server has no key to
            encrypt them with.
          </p>
        )
      )}
    </>
  );
}

function KeyItem({ row, canChange }: { row: KeyRow; canChange: boolean }) {
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, action, checking] = useActionState<KeyFormState, FormData>(
    saveApiKey,
    {},
  );
  const [seen, setSeen] = useState(state);
  /** What just happened outside the form: a key saved or removed, or why not. */
  const [note, setNote] = useState<{ error?: string; text?: string }>({});
  const [removing, startRemoving] = useTransition();
  const id = useId();

  // A key just saved closes its form.
  if (state !== seen) {
    setSeen(state);
    if (state.saved) {
      setAdding(false);
      setNote({ text: `${row.name} took the key, and Dossier saved it.` });
    }
  }

  const remove = () =>
    startRemoving(async () => {
      const result = await removeApiKey(row.provider);
      setConfirming(false);
      setNote(
        result.ok
          ? { text: `Removed your ${row.name} key.` }
          : { error: result.error },
      );
    });

  return (
    <li className="rounded-xl bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-56 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-small font-medium">
            {row.name} · {row.product}
            {row.key ? (
              <Tag tone="healthy">Your key</Tag>
            ) : (
              row.dossiers && <Tag tone="neutral">Dossier’s key</Tag>
            )}
          </p>
          <p className="mt-0.5 text-[0.75rem] text-muted">
            {row.key ? (
              `Ending ${row.key.hint}, added by ${row.key.addedBy} on ${row.key.addedOn}. ${row.product} models draft on it, billed to you by ${row.name}.`
            ) : row.dossiers ? (
              `${row.product} models run on Dossier’s key. Add your own to have ${row.name} bill you directly.`
            ) : (
              <>
                Add a key to draft with {row.models}.{' '}
                <a
                  href={row.keysUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-[3px]"
                >
                  Get a key from {row.name}↗
                </a>
              </>
            )}
          </p>
        </div>
        {canChange && !adding && !confirming && (
          <div className="flex gap-2">
            {row.key && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setConfirming(true);
                  setNote({});
                }}
              >
                Remove
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(true);
                setNote({});
              }}
            >
              {row.key ? 'Replace key' : 'Add key'}
            </Button>
          </div>
        )}
      </div>

      {confirming && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-grey-1 px-3 py-2.5">
          <p className="text-small">
            Remove your {row.name} key?{' '}
            {row.dossiers
              ? `${row.product} models go back to Dossier’s key.`
              : `${row.product} models stop drafting until you add one again.`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={removing}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              variant="ink"
              size="sm"
              disabled={removing}
              onClick={remove}
            >
              <BusyIcon icon={Trash2} busy={removing} />
              Remove key
            </Button>
          </div>
        </div>
      )}

      {adding && (
        <form action={action} className="mt-3">
          <input type="hidden" name="provider" value={row.provider} />
          <label htmlFor={`${id}-key`} className="text-small font-medium">
            {row.name} API key
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              id={`${id}-key`}
              name="key"
              type="password"
              required
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder={row.placeholder}
              aria-describedby={`${id}-hint`}
              aria-invalid={state.error ? true : undefined}
              className="min-w-56 flex-1 font-mono"
            />
            <Button
              type="submit"
              variant="ink"
              className="h-11"
              disabled={checking}
            >
              <BusyIcon icon={KeyRound} busy={checking} />
              Check and save
            </Button>
            <Button
              variant="outline"
              className="h-11"
              disabled={checking}
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
          </div>
          <p
            id={`${id}-hint`}
            role={checking ? 'status' : undefined}
            className="mt-1.5 text-[0.75rem] text-muted"
          >
            {checking
              ? `Checking it with ${row.name}…`
              : `Dossier checks it with ${row.name} first, without spending anything.`}
          </p>
          {state.error && (
            <p role="alert" className="mt-1.5 text-[0.75rem] text-attention">
              {state.error}
            </p>
          )}
        </form>
      )}

      {(note.text || note.error) && (
        <p
          role={note.error ? 'alert' : 'status'}
          className={
            note.error
              ? 'mt-2 text-[0.75rem] text-attention'
              : 'mt-2 text-[0.75rem] text-healthy'
          }
        >
          {note.error ?? note.text}
        </p>
      )}
    </li>
  );
}
