'use client';

import type { IntelligenceLimits } from '@dossierhq/contracts';
import { Check } from 'lucide-react';
import { useActionState, useId } from 'react';
import {
  saveDailyBudget,
  type BudgetFormState,
} from '@/app/(workspace)/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BusyIcon } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';

const dollars = (value: number) => `$${value.toFixed(2)}`;

/**
 * What bounds the workspace's AI: the trial on Dossier's key, or the daily
 * budget on its own. Owners and admins set the budget.
 */
export function Limits({
  limits,
  canManage,
  hasKey,
}: {
  limits: IntelligenceLimits;
  canManage: boolean;
  /** Whether the workspace has a key of its own to spend on. */
  hasKey: boolean;
}) {
  return (
    <div className="mb-2 rounded-xl bg-white p-4">
      {limits.trial ? (
        <Trial trial={limits.trial} />
      ) : (
        <Budget limits={limits} canManage={canManage} hasKey={hasKey} />
      )}
      {limits.waiting && (
        <p
          role="status"
          className="mt-3 rounded-lg bg-attention-soft px-3 py-2.5 text-small"
        >
          {limits.waiting}
        </p>
      )}
    </div>
  );
}

/** A thin bar filled to `used` of `limit`. */
function Meter({ used, limit }: { used: number; limit: number }) {
  const share = limit <= 0 ? 100 : Math.min(100, (used / limit) * 100);
  return (
    <span
      aria-hidden
      className="mt-3 block h-1.5 overflow-hidden rounded-full bg-grey-2"
    >
      <span
        className={cn(
          'block h-full rounded-full',
          share >= 100 ? 'bg-attention' : 'bg-lilac-deep',
        )}
        style={{ width: `${share}%` }}
      />
    </span>
  );
}

function Trial({ trial }: { trial: { used: number; limit: number } }) {
  const used = Math.min(trial.used, trial.limit);
  const over = trial.used >= trial.limit;
  return (
    <>
      <p className="text-[0.75rem] text-muted">Trial on Dossier’s key</p>
      <p className="mt-1 font-display text-h2">
        {used} of {trial.limit} runs used
      </p>
      <Meter used={used} limit={trial.limit} />
      <p className="mt-3 text-small">
        {over
          ? 'The trial is over, so Dossier has stopped drafting. '
          : 'When they’re used, Dossier stops drafting. '}
        <a href="#api-keys" className="underline underline-offset-[3px]">
          Add your own API key
        </a>{' '}
        to keep going, and set how much it may spend a day.
      </p>
    </>
  );
}

function Budget({
  limits,
  canManage,
  hasKey,
}: {
  limits: IntelligenceLimits;
  canManage: boolean;
  hasKey: boolean;
}) {
  const [state, action, saving] = useActionState<BudgetFormState, FormData>(
    saveDailyBudget,
    {},
  );
  const id = useId();
  return (
    <>
      <p className="text-[0.75rem] text-muted">
        {hasKey ? 'Today, on your key' : 'Today, once you add a key'}
      </p>
      <p className="mt-1 font-display text-h2">
        {dollars(limits.spentToday)} of {dollars(limits.dailyBudget)}
      </p>
      <Meter used={limits.spentToday} limit={limits.dailyBudget} />
      <p className="mt-3 text-small text-muted">
        At the budget, the work Dossier does by itself waits until tomorrow
        (midnight UTC). Questions and reports your team asks for still run.
      </p>
      {canManage ? (
        <form action={action} className="mt-3">
          <label htmlFor={`${id}-budget`} className="text-small font-medium">
            Daily budget, in US dollars
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              key={limits.dailyBudgetChosen ?? 'default'}
              id={`${id}-budget`}
              name="dailyBudget"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={limits.dailyBudgetChosen ?? ''}
              placeholder={`${limits.dailyBudget} (the default)`}
              aria-describedby={`${id}-hint`}
              aria-invalid={state.error ? true : undefined}
              className="w-56"
            />
            <Button
              type="submit"
              variant="ink"
              className="h-11"
              disabled={saving}
            >
              <BusyIcon icon={Check} busy={saving} />
              Save budget
            </Button>
          </div>
          <p id={`${id}-hint`} className="mt-1.5 text-[0.75rem] text-muted">
            Leave it empty to use the default.
          </p>
          {state.error ? (
            <p role="alert" className="mt-1.5 text-[0.75rem] text-attention">
              {state.error}
            </p>
          ) : (
            state.saved && (
              <p role="status" className="mt-1.5 text-[0.75rem] text-muted">
                Saved.
              </p>
            )
          )}
        </form>
      ) : (
        <p className="mt-3 text-[0.75rem] text-muted">
          Only owners and admins can change the budget.
        </p>
      )}
    </>
  );
}
