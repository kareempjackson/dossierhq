'use client';

import { useActionState, useId, useState } from 'react';
import { saveApiKey, type FormState } from '@/app/(workspace)/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';
import { MODELS, PROVIDERS, type Provider } from '@/lib/catalog';

/** Bring your own key for each provider; until then Claude runs on Dossier's. */
export function ApiKeys() {
  return (
    <ul className="flex flex-col gap-2">
      {(Object.keys(PROVIDERS) as Provider[]).map((provider) => (
        <KeyRow key={provider} provider={provider} />
      ))}
    </ul>
  );
}

function KeyRow({ provider }: { provider: Provider }) {
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveApiKey,
    {},
  );
  const id = useId();
  const info = PROVIDERS[provider];
  const models = MODELS.filter((model) => model.provider === provider).map(
    (model) => model.name,
  );
  const list =
    models.length > 1
      ? `${models.slice(0, -1).join(', ')} and ${models.at(-1)}`
      : models[0];
  const dossiers = provider === 'anthropic';

  return (
    <li className="rounded-xl bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[14rem] flex-1">
          <p className="flex flex-wrap items-center gap-2 text-small font-medium">
            {info.name} · {info.product}
            {dossiers && <Tag tone="neutral">Dossier’s key</Tag>}
          </p>
          <p className="mt-0.5 text-[0.75rem] text-muted">
            {dossiers ? (
              `${info.product} models run on Dossier’s key. Add your own to have ${info.name} bill you directly.`
            ) : (
              <>
                Add a key to draft with {list}.{' '}
                <a
                  href={info.keysUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-[3px]"
                >
                  Get a key from {info.name}↗
                </a>
              </>
            )}
          </p>
        </div>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            Add key
          </Button>
        )}
      </div>
      {adding && (
        <form action={action} className="mt-3">
          <input type="hidden" name="provider" value={info.name} />
          <label htmlFor={`${id}-key`} className="text-small font-medium">
            {info.name} API key
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              id={`${id}-key`}
              name="key"
              type="password"
              required
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder={info.placeholder}
              aria-describedby={`${id}-hint`}
              className="min-w-[14rem] flex-1 font-mono"
            />
            <Button
              type="submit"
              variant="ink"
              className="h-11"
              disabled={pending}
            >
              {pending ? `Checking with ${info.name}…` : 'Check and save'}
            </Button>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
          </div>
          <p id={`${id}-hint`} className="mt-1.5 text-[0.75rem] text-muted">
            Dossier checks it with {info.name} first, without spending anything.
          </p>
          {state.error && (
            <p role="alert" className="mt-1.5 text-[0.75rem] text-attention">
              {state.error}
            </p>
          )}
        </form>
      )}
    </li>
  );
}
