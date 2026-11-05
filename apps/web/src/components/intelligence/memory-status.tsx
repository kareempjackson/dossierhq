'use client';

import {
  MEMORY_KIND_NAMES,
  MEMORY_KINDS,
  type MemoryStatus as Status,
} from '@dossierhq/contracts';
import { Brain } from 'lucide-react';
import { useState, useTransition } from 'react';
import { readPastRecordsNow } from '@/app/intelligence-actions';
import { Feedback, type Message } from '@/components/settings/setting-row';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { cn } from '@/lib/cn';

const number = new Intl.NumberFormat('en-GB');

const EMBEDDINGS: Record<Status['embeddings'], string> = {
  on: 'Found by meaning and by words',
  off: 'Found by words only: finding by meaning is off',
  unavailable: 'Found by words only, until Dossier’s Voyage AI key is set',
};

/**
 * What Dossier remembers of what's written in the tools, kept past their
 * sync window, and a way to read past records in now.
 */
export function MemoryStatus({
  status,
  canManage,
  oldest,
}: {
  status: Status;
  canManage: boolean;
  /** The oldest thing remembered, formatted. */
  oldest: string | null;
}) {
  const [message, setMessage] = useState<Message | null>(null);
  const [reading, startReading] = useTransition();
  const kinds = MEMORY_KINDS.filter(
    (kind) => (status.documents[kind] ?? 0) > 0,
  );
  const busy = reading || status.backfilling;

  function readNow() {
    setMessage(null);
    startReading(async () => {
      const result = await readPastRecordsNow();
      setMessage(
        result.ok
          ? {
              text: 'Dossier is reading past records into its memory. This page shows how far it has got when you come back.',
              failed: false,
            }
          : { text: result.error, failed: true },
      );
    });
  }

  return (
    <section
      aria-labelledby="memory-heading"
      className="rounded-card bg-sheet shadow-card"
    >
      <div className="flex flex-wrap items-start gap-x-5 gap-y-4 p-5">
        <span
          aria-hidden
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-tile',
            status.embeddings === 'on'
              ? 'bg-brand-soft text-brand-deep'
              : 'bg-surface text-muted',
          )}
        >
          <Brain className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="memory-heading" className="font-medium text-ink">
            What Dossier remembers
          </h2>
          <p className="mt-0.5 text-meta text-muted">
            {EMBEDDINGS[status.embeddings]}
            {oldest && ` · back to ${oldest}`}
          </p>
          {kinds.length === 0 ? (
            <p className="mt-3 text-meta text-text">
              Nothing yet. After the next sync, Dossier keeps what’s written on
              tickets, in meetings and notes, and in alerts and documentation,
              for as long as you share them.
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {kinds.map((kind) => (
                <li key={kind}>
                  <Pill tone="quiet">
                    {number.format(status.documents[kind] ?? 0)}{' '}
                    {MEMORY_KIND_NAMES[kind].toLowerCase()}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
          {status.chunks > 0 && status.embeddings === 'on' && (
            <p className="mt-2 text-meta-sm text-muted tabular-nums">
              {number.format(status.embedded)} of {number.format(status.chunks)}{' '}
              passages embedded
            </p>
          )}
        </div>
        {canManage && (
          <Button variant="ghost" disabled={busy} onClick={readNow}>
            {busy ? 'Reading past records…' : 'Read past records now'}
          </Button>
        )}
      </div>
      {message && (
        <div className="border-t border-hairline px-5 py-3">
          <Feedback message={message} />
        </div>
      )}
    </section>
  );
}
