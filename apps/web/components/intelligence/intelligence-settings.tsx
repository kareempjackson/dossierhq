'use client';

import { useActionState, useId, useState } from 'react';
import {
  draftRecommendationsNow,
  lookForPatterns,
  type FormState,
} from '@/app/(workspace)/actions';
import { Button, ButtonLink } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import type { IntelligenceSettings as Settings, Toggle } from '@/lib/workspace';

/**
 * What Dossier drafts, what it looks for, and what the model may read.
 * Switches change here in the browser until the API is connected.
 */
export function IntelligenceSettings({ settings }: { settings: Settings }) {
  const [drafts, setDrafts] = useState(settings.drafts);
  const [lookFor, setLookFor] = useState(settings.lookFor);
  const [reads, setReads] = useState(settings.reads);
  const [draftState, draftAction, drafting] = useActionState<
    FormState,
    FormData
  >(draftRecommendationsNow, {});
  const [patternState, patternAction, looking] = useActionState<
    FormState,
    FormData
  >(lookForPatterns, {});
  const { model } = settings;
  const message = draftState.error ?? patternState.error;

  return (
    <>
      <section
        aria-labelledby="model-name"
        className="mt-6 flex flex-wrap items-start justify-between gap-6 rounded-3xl bg-linear-to-br from-lilac-soft to-lilac-mist p-6"
      >
        {model ? (
          <div>
            <p className="text-[0.75rem] text-muted">
              Drafts with, on {model.key}
            </p>
            <h2 id="model-name" className="mt-1 text-h1">
              {model.name}
            </h2>
            <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
              {[
                ['To draft for a client', model.perClient],
                ['Last 30 days', model.last30Days],
                ['Drafting runs', String(model.runs)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[0.75rem] text-muted">{label}</dt>
                  <dd className="font-display text-h3">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <div>
            <p className="text-[0.75rem] text-muted">Drafts with</p>
            <h2 id="model-name" className="mt-1 text-h1">
              No model yet
            </h2>
            <p className="mt-2 max-w-md text-small text-muted">
              Choose the model Dossier drafts with in Settings. What it costs
              shows here once it starts drafting.
            </p>
          </div>
        )}
        <ButtonLink href="/settings#ai-model" variant="outline" size="sm">
          {model ? 'Change model' : 'Choose a model'}
        </ButtonLink>
      </section>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <ToggleGroup
          title="What Dossier drafts"
          toggles={drafts}
          onChange={setDrafts}
          footer={
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-3">
                <form action={draftAction}>
                  <Button type="submit" variant="ink" disabled={drafting}>
                    {drafting ? 'Drafting…' : 'Draft recommendations now'}
                  </Button>
                </form>
                <form action={patternAction}>
                  <Button type="submit" variant="outline" disabled={looking}>
                    {looking ? 'Looking…' : 'Look for patterns'}
                  </Button>
                </form>
              </div>
              {message && (
                <p role="alert" className="text-[0.75rem] text-attention">
                  {message}
                </p>
              )}
            </div>
          }
        />
        <div className="flex flex-col gap-5">
          <ToggleGroup
            title="What to look for"
            toggles={lookFor}
            onChange={setLookFor}
            columns
          />
          <ToggleGroup
            title="What the model may read"
            intro="Records that are off are never sent to Anthropic."
            toggles={reads}
            onChange={setReads}
            columns
          />
        </div>
      </div>
    </>
  );
}

function ToggleGroup({
  title,
  intro,
  toggles,
  onChange,
  columns = false,
  footer,
}: {
  title: string;
  intro?: string;
  toggles: Toggle[];
  onChange: (toggles: Toggle[]) => void;
  columns?: boolean;
  footer?: React.ReactNode;
}) {
  const id = useId();
  const on = toggles.filter((toggle) => toggle.on).length;
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col rounded-3xl bg-grey-2 p-4 sm:p-5 lg:min-h-full"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={`${id}-title`} className="text-h3">
          {title}
        </h2>
        <p className="text-[0.75rem] text-muted">
          {on} of {toggles.length} on
        </p>
      </div>
      {intro && <p className="mt-1 text-[0.75rem] text-muted">{intro}</p>}
      <ul className={cn('mt-4 grid gap-2', columns && 'sm:grid-cols-2')}>
        {toggles.map((toggle) => (
          <li
            key={toggle.id}
            className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p id={`${id}-${toggle.id}`} className="text-small font-medium">
                {toggle.label}
              </p>
              {toggle.detail && (
                <p
                  id={`${id}-${toggle.id}-detail`}
                  className="text-[0.75rem] text-muted"
                >
                  {toggle.detail}
                </p>
              )}
            </div>
            <Switch
              checked={toggle.on}
              labelledBy={`${id}-${toggle.id}`}
              describedBy={
                toggle.detail ? `${id}-${toggle.id}-detail` : undefined
              }
              onChange={(value) =>
                onChange(
                  toggles.map((each) =>
                    each.id === toggle.id ? { ...each, on: value } : each,
                  ),
                )
              }
            />
          </li>
        ))}
      </ul>
      {footer && <div className="mt-auto pt-8">{footer}</div>}
    </section>
  );
}
