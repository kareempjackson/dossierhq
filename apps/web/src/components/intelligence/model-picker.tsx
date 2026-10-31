'use client';

import {
  costOf,
  INTELLIGENCE_MODELS,
  modelsOf,
  PROVIDERS,
  type ModelId,
  type ModelInfo,
  type ModelUsage,
  type ProviderId,
} from '@dossierhq/contracts';
import { Check } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { setIntelligenceModel } from '@/app/intelligence-actions';
import { Feedback } from '@/components/settings/setting-row';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { cn } from '@/lib/cn';
import { formatCalendarDate, formatDollars } from '@/lib/format';

const PRICE_LABELS: { key: keyof ModelInfo['prices']; label: string }[] = [
  { key: 'input', label: 'Input' },
  { key: 'output', label: 'Output' },
  { key: 'cacheRead', label: 'Cache read' },
  { key: 'cacheWrite', label: 'Cache write' },
];

/** "Claude Opus 5.5" is "Opus 5.5", for buttons. */
const shortName = (info: ModelInfo) => info.name.replace(/^Claude /, '');

/**
 * The models Dossier can draft with, by provider, each with its provider's
 * prices and what a client run would cost on it. Only a provider with a key
 * can be picked. Picking another offers to switch in a bar that stays in
 * view; only owners and admins can.
 */
export function ModelPicker({
  model,
  defaultModel,
  typicalRun,
  usable,
  canManage,
}: {
  /** The model in use now. */
  model: ModelId;
  defaultModel: ModelId;
  /** Tokens a client run takes here, for the estimates. */
  typicalRun: ModelUsage;
  /** Providers with a key to run on: the workspace's own, or Dossier's. */
  usable: ProviderId[];
  canManage: boolean;
}) {
  const [selected, setSelected] = useState<ModelId>(model);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const choice = INTELLIGENCE_MODELS.find((info) => info.id === selected)!;
  const current = INTELLIGENCE_MODELS.find((info) => info.id === model)!;

  function pick(id: ModelId) {
    setSelected(id);
    setSaved(false);
    setError(null);
  }

  function save() {
    setError(null);
    startSaving(async () => {
      // Picking the default follows it, so a later change of default applies.
      const result = await setIntelligenceModel(
        selected === defaultModel ? null : selected,
      );
      if (result.ok) setSaved(true);
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Two columns once there is room for the prices, not by the window. */}
      <div className="@container">
        <fieldset
          disabled={!canManage || saving}
          className="flex flex-col gap-8"
        >
          <legend className="sr-only">Model</legend>
          {PROVIDERS.map((provider) => {
            const open = usable.includes(provider.id);
            return (
              <section
                key={provider.id}
                aria-labelledby={`models-${provider.id}`}
                className="flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3
                    id={`models-${provider.id}`}
                    className="text-body font-medium text-ink"
                  >
                    {provider.product}{' '}
                    <span className="text-muted">from {provider.name}</span>
                  </h3>
                  <p className="text-meta-sm text-muted">
                    {!open && (
                      <>
                        <a
                          href="#keys"
                          className="font-medium text-ink underline underline-offset-2"
                        >
                          Add your {provider.name} key
                        </a>{' '}
                        to use these ·{' '}
                      </>
                    )}
                    Prices as of {formatCalendarDate(provider.pricesAsOf)} ·{' '}
                    <a
                      href={provider.pricingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-ink"
                    >
                      current prices
                    </a>
                  </p>
                </div>
                <ul className="grid gap-3 @xl:grid-cols-2">
                  {modelsOf(provider.id).map((info) => (
                    <li key={info.id}>
                      <ModelCard
                        info={info}
                        checked={selected === info.id}
                        inUse={info.id === model}
                        isDefault={info.id === defaultModel}
                        run={costOf(typicalRun, info.id)}
                        canPick={canManage && open}
                        locked={!open}
                        onPick={() => pick(info.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </fieldset>
      </div>

      {!canManage && (
        <p className="text-meta text-muted">
          Only owners and admins can change the model.
        </p>
      )}
      {saved && (
        <Feedback
          message={{
            text: `Dossier now drafts with ${current.name}.`,
            failed: false,
          }}
        />
      )}

      {canManage && selected !== model && (
        // From 768px the sheet scrolls, and sticky offsets count from inside
        // its 48px padding: -bottom-6 floats the bar 24px off its edge.
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-sheet py-2.5 pr-2.5 pl-5 shadow-float sm:rounded-full md:-bottom-6">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-body text-text">
              Switch to{' '}
              <span className="font-medium text-ink">{choice.name}</span>? About{' '}
              {formatDollars(costOf(typicalRun, choice.id))} a client, against{' '}
              {formatDollars(costOf(typicalRun, model))} now.
            </p>
            <Feedback message={error ? { text: error, failed: true } : null} />
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => pick(model)}
            >
              Cancel
            </Button>
            <Button variant="primary" disabled={saving} onClick={save}>
              {saving ? 'Switching…' : `Use ${shortName(choice)}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One model as a card. Its name is the radio's label, stretched over the
 * whole card so a click anywhere picks it.
 */
function ModelCard({
  info,
  checked,
  inUse,
  isDefault,
  run,
  canPick,
  locked,
  onPick,
}: {
  info: ModelInfo & { id: ModelId };
  checked: boolean;
  inUse: boolean;
  isDefault: boolean;
  /** What drafting for one client costs on it. */
  run: number;
  /** False for people who can't change the model, and models with no key. */
  canPick: boolean;
  /** Its provider has no key to run on. */
  locked: boolean;
  onPick: () => void;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        'relative flex h-full flex-col rounded-card bg-sheet p-5 shadow-card transition-shadow ring-inset',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
        checked ? 'ring-2 ring-brand' : canPick && 'hover:shadow-float',
        locked && !inUse && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="radio"
              id={`${id}-radio`}
              name="model"
              value={info.id}
              checked={checked}
              disabled={!canPick}
              onChange={onPick}
              aria-describedby={`${id}-about`}
              className="sr-only"
            />
            <label
              htmlFor={`${id}-radio`}
              className={cn(
                'text-section font-semibold text-ink after:absolute after:inset-0 after:rounded-card',
                canPick ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              {info.name}
              {inUse && <span className="sr-only">, in use</span>}
              {locked && <span className="sr-only">, needs a key</span>}
              {isDefault && <span className="sr-only">, the default</span>}
            </label>
            {/* The label says these to screen readers. */}
            <span aria-hidden className="flex items-center gap-2">
              {inUse && (
                <Pill tone="positive">
                  <Check className="size-3" strokeWidth={2.5} />
                  In use
                </Pill>
              )}
              {isDefault && <Pill tone="quiet">Default</Pill>}
            </span>
          </div>
          <p id={`${id}-about`} className="text-meta text-muted">
            {info.summary}
            <span className="sr-only">
              {' '}
              About {formatDollars(run)} to draft for one client.
            </span>
          </p>
        </div>
        <span
          aria-hidden
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-full transition-colors',
            checked
              ? 'bg-brand text-white'
              : 'ring-1 ring-border-strong/50 ring-inset',
          )}
        >
          {checked && <Check className="size-3" strokeWidth={3} />}
        </span>
      </div>

      <p aria-hidden className="mt-5 flex items-baseline gap-1.5">
        <span className="text-figure font-semibold text-ink">
          {formatDollars(run)}
        </span>
        <span className="text-meta text-muted">a client</span>
      </p>

      <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-hairline pt-3">
        {PRICE_LABELS.map(({ key, label }) => (
          <div key={key} className="flex min-w-0 flex-col">
            <dt className="truncate text-meta-sm text-muted">{label}</dt>
            <dd className="text-meta text-ink tabular-nums">
              {formatDollars(info.prices[key])}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-meta-sm text-muted">
        Prices per million tokens.
        {info.note && ` ${info.note}`}
      </p>
    </div>
  );
}
