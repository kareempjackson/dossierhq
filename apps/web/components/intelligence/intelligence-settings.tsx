'use client';

import { Sparkles, Waypoints } from 'lucide-react';
import {
  useActionState,
  useId,
  useOptimistic,
  useState,
  useTransition,
} from 'react';
import {
  draftRecommendationsNow,
  lookForPatterns,
  setIntelligenceSwitch,
  type StartState,
} from '@/app/(workspace)/intelligence/actions';
import { Button, ButtonLink } from '@/components/ui/button';
import { BusyIcon } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import type {
  IntelligenceView,
  SwitchGroup,
  Toggle,
} from '@/lib/settings-views';

type Flip = { group: SwitchGroup; id: string; on: boolean };

/**
 * What Dossier drafts, what it looks for, and what the model may read, saved
 * as each switch is flipped. Only owners and admins can change them.
 */
export function IntelligenceSettings({
  view,
  canManage,
}: {
  view: IntelligenceView;
  canManage: boolean;
}) {
  const [shown, flip] = useOptimistic(
    { outputs: view.drafts, topics: view.lookFor, records: view.reads },
    (current, { group, id, on }: Flip) => ({
      ...current,
      [group]: current[group].map((toggle) =>
        toggle.id === id ? { ...toggle, on } : toggle,
      ),
    }),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [, startSaving] = useTransition();
  const [draftState, draftAction, drafting] = useActionState<StartState>(
    draftRecommendationsNow,
    {},
  );
  const [patternState, patternAction, looking] = useActionState<StartState>(
    lookForPatterns,
    {},
  );
  const { model } = view;

  const change = (next: Flip) =>
    startSaving(async () => {
      flip(next);
      setProblem(null);
      const result = await setIntelligenceSwitch(next.group, next.id, next.on);
      if (!result.ok) setProblem(result.error);
    });

  const started = [
    draftState.started &&
      'Drafting has started. New recommendations show on each client as they’re ready.',
    patternState.started &&
      'Dossier is looking across your clients. What it finds shows on Home.',
  ].filter(Boolean);
  const refusals = [draftState.error, patternState.error].filter(Boolean);

  return (
    <>
      <section
        aria-labelledby="model-name"
        className="mt-6 flex flex-wrap items-start justify-between gap-6 rounded-3xl bg-linear-to-br from-lilac-soft to-lilac-mist p-6"
      >
        <div>
          <p className="text-[0.75rem] text-muted">
            {view.off ? 'Set to draft with' : `Drafts with, on ${model.key}`}
          </p>
          <h2 id="model-name" className="mt-1 text-h1">
            {model.name}
          </h2>
          {view.off && (
            <p role="status" className="mt-2 max-w-md text-small">
              {view.off}
            </p>
          )}
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
        <ButtonLink href="/settings#ai-model" variant="outline" size="sm">
          Change model
        </ButtonLink>
      </section>

      {problem && (
        <p role="alert" className="mt-4 text-small text-attention">
          {problem}
        </p>
      )}
      {!canManage && (
        <p className="mt-4 text-small text-muted">
          Only owners and admins can change what Dossier drafts, looks for and
          reads.
        </p>
      )}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <ToggleGroup
          title="What Dossier drafts"
          toggles={shown.outputs}
          disabled={!canManage}
          onChange={(id, on) => change({ group: 'outputs', id, on })}
          footer={
            canManage && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-3">
                  <form action={draftAction}>
                    <Button type="submit" variant="ink" disabled={drafting}>
                      <BusyIcon icon={Sparkles} busy={drafting} />
                      Draft recommendations now
                    </Button>
                  </form>
                  <form action={patternAction}>
                    <Button type="submit" variant="outline" disabled={looking}>
                      <BusyIcon icon={Waypoints} busy={looking} />
                      Look for patterns
                    </Button>
                  </form>
                </div>
                {refusals.map((message) => (
                  <p
                    key={message}
                    role="alert"
                    className="text-[0.75rem] text-attention"
                  >
                    {message}
                  </p>
                ))}
                {started.map((message) => (
                  <p
                    key={String(message)}
                    role="status"
                    className="text-[0.75rem] text-healthy"
                  >
                    {message}
                  </p>
                ))}
              </div>
            )
          }
        />
        <div className="flex flex-col gap-5">
          <ToggleGroup
            title="What to look for"
            toggles={shown.topics}
            disabled={!canManage}
            onChange={(id, on) => change({ group: 'topics', id, on })}
            columns
          />
          <ToggleGroup
            title="What the model may read"
            intro={`Records that are off are never sent to ${view.provider}.`}
            toggles={shown.records}
            disabled={!canManage}
            onChange={(id, on) => change({ group: 'records', id, on })}
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
  disabled,
  columns = false,
  footer,
}: {
  title: string;
  intro?: string;
  toggles: Toggle[];
  onChange: (id: string, on: boolean) => void;
  disabled: boolean;
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
              {(toggle.detail || toggle.soon) && (
                <p
                  id={`${id}-${toggle.id}-detail`}
                  className="text-[0.75rem] text-muted"
                >
                  {toggle.soon ? 'Coming soon.' : toggle.detail}
                </p>
              )}
            </div>
            <Switch
              checked={toggle.on}
              labelledBy={`${id}-${toggle.id}`}
              describedBy={
                toggle.detail || toggle.soon
                  ? `${id}-${toggle.id}-detail`
                  : undefined
              }
              disabled={disabled || toggle.soon}
              onChange={(value) => onChange(toggle.id, value)}
            />
          </li>
        ))}
      </ul>
      {footer && <div className="mt-auto pt-8">{footer}</div>}
    </section>
  );
}
