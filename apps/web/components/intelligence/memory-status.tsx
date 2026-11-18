'use client';

import { History } from 'lucide-react';
import { useActionState } from 'react';
import {
  readPastRecords,
  type StartState,
} from '@/app/(workspace)/intelligence/actions';
import { RefreshWhileSyncing } from '@/components/connections/refresh-while-syncing';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { BusyIcon } from '@/components/ui/spinner';
import type { MemoryView } from '@/lib/settings-views';

/**
 * What Dossier remembers of past records: tickets, meetings and notes it
 * can find again when it drafts or answers. Owners and admins can have it
 * read every past record now, rather than a little after each sync.
 */
export function MemoryStatus({
  view,
  canBackfill,
}: {
  view: MemoryView;
  canBackfill: boolean;
}) {
  const [state, action, starting] = useActionState<StartState>(
    readPastRecords,
    {},
  );

  return (
    <section
      aria-labelledby="memory"
      className="mt-5 rounded-2xl bg-grey-1 p-5"
    >
      <RefreshWhileSyncing syncing={view.backfilling} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-72">
          <h2
            id="memory"
            className="font-sans text-base font-medium tracking-normal"
          >
            What Dossier remembers
          </h2>
          <p className="mt-1 text-small text-muted">{view.meaning}</p>
        </div>
        {canBackfill && (
          <form action={action}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={starting || view.backfilling}
            >
              <BusyIcon icon={History} busy={starting} />
              Read past records now
            </Button>
          </form>
        )}
      </div>

      {view.backfilling && (
        <div className="mt-4">
          <ProgressBar label="Reading past records" />
          <p role="status" className="mt-2 text-[0.75rem] text-muted">
            Reading past records into memory. This page updates as it goes.
          </p>
        </div>
      )}

      {view.any ? (
        <>
          <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
            {view.kinds.map((kind) => (
              <div key={kind.name}>
                <dt className="text-[0.75rem] text-muted">{kind.name}</dt>
                <dd className="font-display text-h3">{kind.count}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[0.75rem] text-muted">
            {view.passages} {view.since}
          </p>
        </>
      ) : (
        !view.backfilling && (
          <p className="mt-4 text-small text-muted">
            Nothing in memory yet. Dossier adds records a little after each
            sync.
          </p>
        )
      )}

      {state.error && (
        <p role="alert" className="mt-3 text-[0.75rem] text-attention">
          {state.error}
        </p>
      )}
      {state.started && !view.backfilling && (
        <p role="status" className="mt-3 text-[0.75rem] text-healthy">
          Dossier is reading past records. Counts rise as it goes.
        </p>
      )}
    </section>
  );
}
