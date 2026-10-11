'use client';

import type { Tool } from '@dossierhq/contracts';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { StatusDot } from '@/components/ui/status-dot';

/**
 * A failing connector, in plain language, with its fix. Saving a key is UI
 * only until the API exists.
 */
export function FailureNotice({
  tool,
  name,
  summary,
  fix,
  detail,
}: {
  tool: Tool;
  name: string;
  summary: string;
  /** The fix, as a button label, e.g. "Reconnect Hudu". */
  fix: string;
  /** Mono line, e.g. "Since 8 Oct 2026, 23:29 · last good sync 23:14". */
  detail: string;
}) {
  const [step, setStep] = useState<'notice' | 'form' | 'saved'>('notice');
  const headingId = useId();
  const keyId = useId();

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStep('saved');
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-card bg-sheet p-5 shadow-float"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex items-center gap-2.5">
            <ConnectorTile tool={tool} size="sm" />
            <h2 id={headingId} className="text-section font-semibold">
              <StatusDot tone="failure" label={`${name} is failing`} />
            </h2>
          </div>
          <p className="mt-3 text-text">{summary}</p>
          <p className="mt-1.5 font-mono text-mono text-muted">{detail}</p>
        </div>
        {step === 'notice' && (
          <Button variant="primary" onClick={() => setStep('form')}>
            {fix}
          </Button>
        )}
      </div>

      {step === 'form' && (
        <form
          onSubmit={save}
          className="mt-5 flex flex-wrap items-end gap-2 border-t border-hairline pt-5"
        >
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5">
            <label htmlFor={keyId} className="text-meta font-medium text-ink">
              New {name} API key
            </label>
            <input
              id={keyId}
              type="password"
              required
              autoComplete="off"
              aria-describedby={`${keyId}-hint`}
              className="h-10 rounded-input bg-surface px-3 font-mono text-mono text-ink"
            />
            <p id={`${keyId}-hint`} className="text-meta-sm text-muted">
              Create a read-only key in {name} under Admin, then API keys.
            </p>
          </div>
          <div className="flex gap-2 pb-6">
            <Button type="submit" variant="primary">
              Save key
            </Button>
            <Button variant="ghost" onClick={() => setStep('notice')}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step === 'saved' && (
        <p
          role="status"
          className="mt-5 border-t border-hairline pt-4 text-meta text-text"
        >
          Key saved. Dossier will try {name} again within 15 minutes and clear
          this notice once a sync succeeds.
        </p>
      )}
    </section>
  );
}
