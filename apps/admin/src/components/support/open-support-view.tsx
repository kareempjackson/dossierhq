'use client';

import { SUPPORT_MINUTES } from '@dossierhq/contracts';
import { ExternalLink } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { openSupportView } from '@/app/support-actions';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

const fieldClass =
  'rounded-input bg-sheet px-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert';

/**
 * Opens a read-only view of the workspace: a reason and how long, then a
 * one-time link into the customer app, opened from a click so no popup
 * blocker stands in the way. The link works once, for two minutes.
 */
export function OpenSupportView({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState<number>(30);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  if (link) {
    return (
      <div className="flex flex-col gap-3 rounded-card bg-brand-soft p-4">
        <p className="text-text">
          The view of {workspaceName} is ready. Open it within two minutes; the
          link works once.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            onClick={() => setTimeout(() => setLink(null), 500)}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-brand px-4 text-body font-medium text-white transition-colors hover:bg-brand-hover"
          >
            Open in Dossier
            <ExternalLink aria-hidden className="size-4" strokeWidth={1.75} />
          </a>
          <Button variant="ghost" onClick={() => setLink(null)}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setError(null);
          const result = await openSupportView(workspaceId, reason, minutes);
          if (result.ok) {
            setLink(result.url);
            setReason('');
          } else {
            setError(result.error);
          }
        });
      }}
      className="flex flex-col gap-3 rounded-card bg-surface-soft p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-reason`}
          className="text-meta font-medium text-ink"
        >
          Why are you looking?
        </label>
        <input
          id={`${id}-reason`}
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Ticket #412: their weekly reports are empty"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={`${id}-hint`}
          className={`${fieldClass} h-9`}
        />
        <p id={`${id}-hint`} className="text-meta-sm text-muted">
          The workspace’s owners see this in their audit log, with your name.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${id}-minutes`}
            className="text-meta font-medium text-ink"
          >
            For
          </label>
          <select
            id={`${id}-minutes`}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            className={`${fieldClass} h-9`}
          >
            {SUPPORT_MINUTES.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !reason.trim()}
        >
          {pending ? 'Opening…' : 'Open a support view'}
        </Button>
      </div>
      {error && (
        <StatusDot
          tone="failure"
          label={error}
          className="text-meta text-ink"
        />
      )}
    </form>
  );
}
