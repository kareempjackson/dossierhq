'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { chooseModel } from '@/app/(workspace)/settings/actions';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { cn } from '@/lib/cn';
import type { ModelChoice } from '@/lib/settings-views';

/**
 * The model Dossier drafts with, by provider. A provider without a key
 * can't be chosen, and only owners and admins can switch. Picking a model
 * offers the switch in a bar that stays in view.
 */
export function ModelPicker({
  choice,
  canManage,
}: {
  choice: ModelChoice;
  canManage: boolean;
}) {
  const [inUse, showInUse] = useOptimistic(choice.inUse);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [switched, setSwitched] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const models = choice.providers.flatMap((provider) => provider.models);
  // What it costs now, against the model saved, not the one being switched to.
  const current = models.find((model) => model.id === choice.inUse);
  const candidate = models.find((model) => model.id === choosing);

  const use = (id: string, name: string) =>
    startSaving(async () => {
      showInUse(id);
      setError(null);
      // Choosing the default follows it, so a later change of default applies.
      const result = await chooseModel(id === choice.defaultModel ? null : id);
      if (result.ok) {
        setChoosing(null);
        setSwitched(name);
      } else {
        setError(result.error);
      }
    });

  return (
    <div className="flex flex-col gap-6">
      {choice.off && (
        <p role="status" className="rounded-xl bg-white px-4 py-3 text-small">
          {choice.off}
        </p>
      )}
      {choice.providers.map((provider) => {
        const canPick = canManage && provider.usable;
        return (
          <div key={provider.id}>
            <h3 className="font-sans text-base font-medium tracking-normal">
              {provider.product} from {provider.name}
            </h3>
            {!provider.usable && (
              <p className="text-[0.75rem] text-muted">
                Add your {provider.name} key to use these ·{' '}
                <a
                  href="#api-keys"
                  className="underline underline-offset-[3px]"
                >
                  API keys
                </a>
              </p>
            )}
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {provider.models.map((model) => {
                const using = model.id === inUse;
                return (
                  <li key={model.id}>
                    <button
                      type="button"
                      disabled={!canPick || using || saving}
                      onClick={() => {
                        setChoosing(model.id);
                        setSwitched(null);
                        setError(null);
                      }}
                      aria-pressed={using}
                      className={cn(
                        'flex h-full w-full flex-col rounded-xl bg-white p-4 text-left transition-colors',
                        using && 'ring-2 ring-ink ring-inset',
                        choosing === model.id &&
                          !using &&
                          'ring-2 ring-lilac-deep ring-inset',
                        canPick && !using && 'hover:bg-grey-2',
                        !provider.usable && 'cursor-not-allowed opacity-60',
                        provider.usable && !canManage && 'cursor-default',
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-2 text-small font-medium">
                        {model.name}
                        {using && <Tag tone="healthy">In use</Tag>}
                        {model.id === choice.defaultModel && (
                          <Tag tone="neutral">Default</Tag>
                        )}
                      </span>
                      <span className="mt-1 text-[0.75rem] text-muted">
                        {model.summary}
                      </span>
                      <span className="mt-3 flex items-baseline gap-1.5">
                        <span className="font-display text-h3">
                          {model.perClient}
                        </span>
                        <span className="text-[0.75rem] text-muted">
                          a client
                        </span>
                      </span>
                      <span className="mt-2 font-mono text-[0.625rem] tracking-normal text-muted">
                        In ${model.prices[0]} · Out ${model.prices[1]} · Cache
                        read ${model.prices[2]} · Cache write ${model.prices[3]}
                      </span>
                      {model.note && (
                        <span className="mt-2 text-[0.6875rem] text-muted">
                          {model.note}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <p className="text-[0.75rem] text-muted">
        Prices per million tokens.
        {!canManage && ' Only owners and admins can change the model.'}
      </p>

      {candidate && (
        <div
          role="dialog"
          aria-label="Switch model"
          className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink p-4 text-paper shadow-float"
        >
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-small">
              {current && current.id !== candidate.id
                ? `Switch to ${candidate.name}? About ${candidate.perClient} a client, against ${current.perClient} now.`
                : `Draft with ${candidate.name}? About ${candidate.perClient} a client.`}
            </p>
            {error && (
              <p
                role="alert"
                className="mt-1 text-[0.75rem] text-attention-soft"
              >
                {error}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => {
                setChoosing(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="act"
              size="sm"
              disabled={saving}
              onClick={() => use(candidate.id, candidate.name)}
            >
              {saving
                ? 'Switching…'
                : `Use ${candidate.name.replace(/^Claude /, '')}`}
            </Button>
          </div>
        </div>
      )}
      {switched && (
        <p role="status" className="text-small text-healthy">
          Dossier now drafts with {switched}.
        </p>
      )}
    </div>
  );
}
