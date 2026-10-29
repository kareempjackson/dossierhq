import {
  costOf,
  modelInfo,
  type IntelligenceSettings,
} from '@dossierhq/contracts';
import { ArrowRight, Sparkles } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { cn } from '@/lib/cn';
import { formatDollars } from '@/lib/format';

const number = new Intl.NumberFormat('en-GB');

/**
 * The model Dossier drafts with and what drafting has cost, or why nothing
 * drafts yet. Both are changed and broken down in Settings.
 */
export function DraftingStatus({
  settings,
}: {
  settings: IntelligenceSettings;
}) {
  const { enabled, model, typicalRun, spend } = settings;
  const info = modelInfo(model);
  const cost = spend.reduce((sum, row) => sum + row.cost, 0);
  const runs = spend.reduce((sum, row) => sum + row.runs, 0);

  return (
    <div className="rounded-card bg-sheet shadow-card">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4 p-5">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-4">
          <span
            aria-hidden
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-tile',
              enabled
                ? 'bg-brand-soft text-brand-deep'
                : 'bg-marker-highlight text-ink',
            )}
          >
            <Sparkles className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-meta text-muted">Dossier drafts with</p>
            <p className="flex flex-wrap items-center gap-2 text-section font-semibold text-ink">
              {info.name}
              <Pill tone={enabled ? 'positive' : 'quiet'} dot>
                {enabled ? 'On' : 'Off'}
              </Pill>
            </p>
          </div>
        </div>
        <ButtonLink href="/settings#model" size="sm">
          Model and spend
          <ArrowRight aria-hidden />
        </ButtonLink>
      </div>

      {enabled ? (
        // Rows on a phone; three columns from 640px.
        <dl className="border-t border-hairline sm:grid sm:grid-cols-3">
          <Figure
            label="To draft for a client"
            value={`About ${formatDollars(costOf(typicalRun, model))}`}
          />
          <Figure label="Last 30 days" value={formatDollars(cost)} />
          <Figure label="Drafting runs" value={number.format(runs)} />
        </dl>
      ) : (
        <p
          role="status"
          className="border-t border-hairline px-5 py-3.5 text-meta text-text"
        >
          Nothing drafts until{' '}
          <code className="font-mono text-mono">ANTHROPIC_API_KEY</code> is set
          on the API and it restarts. You can still choose what Dossier will do
          once it’s on.
        </p>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-hairline px-5 py-3 not-first:border-t sm:block sm:py-3.5 sm:not-first:border-t-0 sm:not-first:border-l">
      <dt className="text-meta text-muted sm:text-meta-sm">{label}</dt>
      <dd className="text-section font-semibold text-ink sm:mt-0.5">{value}</dd>
    </div>
  );
}
