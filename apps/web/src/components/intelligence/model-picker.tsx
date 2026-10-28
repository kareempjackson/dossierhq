'use client';

import {
  costOf,
  INTELLIGENCE_MODELS,
  type ModelId,
  type ModelInfo,
  type ModelUsage,
} from '@dossierhq/contracts';
import { Check } from 'lucide-react';
import { useState, useTransition } from 'react';
import { setIntelligenceModel } from '@/app/intelligence-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatDollars } from '@/lib/format';

const PRICE_LABELS: { key: keyof ModelInfo['prices']; label: string }[] = [
  { key: 'input', label: 'Input' },
  { key: 'output', label: 'Output' },
  { key: 'cacheRead', label: 'Cache read' },
  { key: 'cacheWrite', label: 'Cache write' },
];

/**
 * The models Dossier can draft with, each with Anthropic's prices and what a
 * client run would cost on it. Only the owner can change the choice.
 */
export function ModelPicker({
  model,
  defaultModel,
  typicalRun,
  canManage,
}: {
  /** The model in use now. */
  model: ModelId;
  defaultModel: ModelId;
  /** Tokens a client run takes here, for the estimates. */
  typicalRun: ModelUsage;
  canManage: boolean;
}) {
  const [selected, setSelected] = useState<ModelId>(model);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save() {
    setError(null);
    startSaving(async () => {
      // Picking the default follows it, so a later change of default applies.
      const result = await setIntelligenceModel(
        selected === defaultModel ? null : selected,
      );
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={!canManage || saving}>
        <legend className="sr-only">Model</legend>
        <ul className="grid gap-3 sm:grid-cols-2">
          {INTELLIGENCE_MODELS.map((info) => {
            const checked = selected === info.id;
            const run = costOf(typicalRun, info.id);
            return (
              <li key={info.id}>
                <label
                  className={cn(
                    'flex h-full cursor-pointer flex-col gap-3 rounded-card bg-sheet p-4 shadow-card ring-2 ring-transparent transition-shadow ring-inset',
                    checked && 'ring-brand',
                    !canManage && 'cursor-default',
                  )}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="model"
                      value={info.id}
                      checked={checked}
                      onChange={() => setSelected(info.id)}
                      className="mt-1 accent-brand"
                    />
                    <span className="flex flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2 text-section font-semibold text-ink">
                        {info.name}
                        {info.id === defaultModel && (
                          <span className="rounded-full bg-surface px-2 text-meta-sm font-medium text-muted">
                            Default
                          </span>
                        )}
                        {info.id === model && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 text-meta-sm font-medium text-brand-deep">
                            <Check aria-hidden className="size-3" />
                            In use
                          </span>
                        )}
                      </span>
                      <span className="text-body text-text">
                        {info.summary}
                      </span>
                    </span>
                  </span>

                  <dl className="grid grid-cols-4 gap-2 rounded-input bg-surface px-3 py-2">
                    {PRICE_LABELS.map(({ key, label }) => (
                      <div key={key} className="flex flex-col">
                        <dt className="text-meta-sm text-muted">{label}</dt>
                        <dd className="text-body text-ink tabular-nums">
                          {formatDollars(info.prices[key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-meta text-muted">
                    Per million tokens. About{' '}
                    <span className="text-ink tabular-nums">
                      {formatDollars(run)}
                    </span>{' '}
                    to draft for one client.
                  </p>
                  {info.note && (
                    <p className="text-meta text-muted">{info.note}</p>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        {canManage ? (
          <Button
            variant="primary"
            onClick={save}
            disabled={saving || selected === model}
          >
            {saving ? 'Saving…' : 'Use this model'}
          </Button>
        ) : (
          <p className="text-meta text-muted">
            Only the workspace owner can change the model.
          </p>
        )}
        {error && (
          <p role="alert" className="text-meta text-alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
