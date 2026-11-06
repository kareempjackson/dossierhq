'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { cn } from '@/lib/cn';
import { MODELS, PROVIDERS, type Provider } from '@/lib/catalog';

const DEFAULT = 'claude-opus-5-5';

/**
 * The model Dossier drafts with, by provider; a provider without a key can't
 * be chosen. Nothing is in use until the workspace's choice comes from the
 * API; switching is kept in the browser for now.
 */
export function ModelPicker({ keyed }: { keyed: Provider[] }) {
  const [inUse, setInUse] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [switched, setSwitched] = useState<string | null>(null);
  const current = MODELS.find((model) => model.id === inUse);
  const candidate = MODELS.find((model) => model.id === choosing);

  return (
    <div className="flex flex-col gap-6">
      {(Object.keys(PROVIDERS) as Provider[]).map((provider) => {
        const info = PROVIDERS[provider];
        const hasKey = keyed.includes(provider);
        return (
          <div key={provider}>
            <h3 className="font-sans text-base font-medium tracking-normal">
              {info.product} from {info.name}
            </h3>
            {!hasKey && (
              <p className="text-[0.75rem] text-muted">
                Add your {info.name} key to use these ·{' '}
                <a
                  href="#api-keys"
                  className="underline underline-offset-[3px]"
                >
                  API keys
                </a>
              </p>
            )}
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {MODELS.filter((model) => model.provider === provider).map(
                (model) => {
                  const using = model.id === inUse;
                  return (
                    <li key={model.id}>
                      <button
                        type="button"
                        disabled={!hasKey || using}
                        onClick={() => {
                          setChoosing(model.id);
                          setSwitched(null);
                        }}
                        aria-pressed={using}
                        className={cn(
                          'flex h-full w-full flex-col rounded-xl bg-white p-4 text-left transition-colors',
                          using && 'ring-2 ring-ink ring-inset',
                          choosing === model.id &&
                            'ring-2 ring-lilac-deep ring-inset',
                          hasKey && !using && 'hover:bg-grey-2',
                          !hasKey && 'cursor-not-allowed opacity-60',
                        )}
                      >
                        <span className="flex flex-wrap items-center gap-2 text-small font-medium">
                          {model.name}
                          {using && <Tag tone="healthy">In use</Tag>}
                          {model.id === DEFAULT && (
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
                          read ${model.prices[2]} · Cache write $
                          {model.prices[3]}
                        </span>
                        {model.note && (
                          <span className="mt-2 text-[0.6875rem] text-muted">
                            {model.note}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                },
              )}
            </ul>
          </div>
        );
      })}
      <p className="text-[0.75rem] text-muted">Prices per million tokens.</p>

      {candidate && (
        <div
          role="dialog"
          aria-label="Switch model"
          className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink p-4 text-paper shadow-float"
        >
          <p className="text-small">
            {current
              ? `Switch to ${candidate.name}? About ${candidate.perClient} a client, against ${current.perClient} now.`
              : `Draft with ${candidate.name}? About ${candidate.perClient} a client.`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChoosing(null)}
            >
              Cancel
            </Button>
            <Button
              variant="act"
              size="sm"
              onClick={() => {
                setInUse(candidate.id);
                setChoosing(null);
                setSwitched(candidate.name);
              }}
            >
              Use {candidate.name.replace(/^Claude /, '')}
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
