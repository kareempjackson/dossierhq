'use client';

import { useId, useRef, useState, useTransition } from 'react';
import {
  deleteWorkspace,
  restoreWorkspace,
  suspendWorkspace,
} from '@/app/workspace-actions';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

const fieldClass =
  'w-full rounded-input bg-surface px-3 py-2 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert';

/** Suspend or restore, and delete once suspended. Admins only. */
export function WorkspaceActions({
  id,
  name,
  suspended,
}: {
  id: string;
  name: string;
  suspended: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {suspended ? (
          <>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await restoreWorkspace(id);
                  if (!result.ok) setError(result.error);
                })
              }
            >
              {pending ? 'Restoring…' : 'Restore'}
            </Button>
            <DeleteDialog id={id} name={name} />
          </>
        ) : (
          <SuspendDialog id={id} name={name} />
        )}
      </div>
      {error && (
        <StatusDot
          tone="failure"
          label={error}
          className="text-meta text-ink"
        />
      )}
    </div>
  );
}

function SuspendDialog({ id, name }: { id: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldId = useId();
  return (
    <>
      <Button onClick={() => dialog.current?.showModal()}>Suspend…</Button>
      <dialog
        ref={dialog}
        aria-labelledby={`${fieldId}-title`}
        className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-card bg-sheet p-0 shadow-float backdrop:bg-ink/30"
      >
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              setError(null);
              const result = await suspendWorkspace(id, reason);
              if (result.ok) dialog.current?.close();
              else setError(result.error);
            });
          }}
        >
          <h2 id={`${fieldId}-title`} className="text-section font-medium">
            Suspend {name}?
          </h2>
          <p className="text-meta text-text">
            Everyone in it is signed out at once and can’t sign in. Nothing
            syncs, drafts or sends until it’s restored; its data stays as it is.
            Its owners see this in their audit log, with your reason.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={fieldId} className="text-meta font-medium text-ink">
              Why
            </label>
            <textarea
              id={fieldId}
              required
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={Boolean(error) || undefined}
              className={fieldClass}
            />
          </div>
          {error && (
            <StatusDot
              tone="failure"
              label={error}
              className="text-meta text-ink"
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !reason.trim()}
              className="text-alert"
            >
              {pending ? 'Suspending…' : 'Suspend workspace'}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function DeleteDialog({ id, name }: { id: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldId = useId();
  return (
    <>
      <Button
        onClick={() => dialog.current?.showModal()}
        className="text-alert"
      >
        Delete…
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`${fieldId}-title`}
        className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-card bg-sheet p-0 shadow-float backdrop:bg-ink/30"
      >
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              setError(null);
              const result = await deleteWorkspace(id, typed);
              if (!result.ok) setError(result.error);
            });
          }}
        >
          <h2 id={`${fieldId}-title`} className="text-section font-medium">
            Delete {name} for good?
          </h2>
          <p className="text-meta text-text">
            This deletes the workspace and everything in it: clients, reports,
            connections and their credentials, notes, contract files and its
            audit log. Its people’s accounts go too. It can’t be undone. The
            staff activity log keeps a line saying you did it.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={fieldId} className="text-meta font-medium text-ink">
              Type <span className="font-mono">{name}</span> to confirm
            </label>
            <input
              id={fieldId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(error) || undefined}
              className={fieldClass}
            />
          </div>
          {error && (
            <StatusDot
              tone="failure"
              label={error}
              className="text-meta text-ink"
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || typed.trim() !== name}
              className="text-alert"
            >
              {pending ? 'Deleting…' : 'Delete workspace'}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
