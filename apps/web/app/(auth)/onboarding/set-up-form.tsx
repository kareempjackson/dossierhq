'use client';

import { useActionState, useId, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { saveSetUp, type SetUpState } from './actions';

const TOOLS = [
  { value: 'ninjaone', name: 'NinjaOne', detail: 'Devices, alerts' },
  { value: 'hudu', name: 'Hudu', detail: 'Assets, expiry' },
  { value: 'later', name: 'Later', detail: 'Skip for now' },
] as const;

type Zone = { value: string; label: string };

const ZONES = (() => {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes('UTC') ? zones : ['UTC', ...zones];
})();

/** Without a clock while prerendering, zones go without their offsets. */
const PLAIN_ZONES: Zone[] = ZONES.map((zone) => ({
  value: zone,
  label: zone.replaceAll('_', ' '),
}));
let labelledZones: Zone[] | null = null;
function zonesWithOffsets(): Zone[] {
  if (!labelledZones) {
    const now = new Date();
    labelledZones = ZONES.map((zone) => {
      const offset =
        new Intl.DateTimeFormat('en-GB', {
          timeZone: zone,
          timeZoneName: 'shortOffset',
        })
          .formatToParts(now)
          .find((part) => part.type === 'timeZoneName')?.value ?? '';
      return { value: zone, label: `${zone.replaceAll('_', ' ')} (${offset})` };
    });
  }
  return labelledZones;
}

const noSubscription = () => () => {};

/**
 * Name the workspace, confirm its time zone, and pick the first tool. Starts
 * from what the API has: a name from the email's domain, and the time zone
 * the browser had at sign-up.
 */
export function SetUpForm({
  defaultName,
  defaultTimeZone,
}: {
  defaultName?: string;
  defaultTimeZone?: string;
}) {
  const [state, action, pending] = useActionState<SetUpState, FormData>(
    saveSetUp,
    {},
  );
  const [tool, setTool] = useState<(typeof TOOLS)[number]['value']>('ninjaone');
  const id = useId();
  const ids = { name: `${id}-name`, zone: `${id}-zone`, error: `${id}-error` };
  const zones = useSyncExternalStore(
    noSubscription,
    zonesWithOffsets,
    () => PLAIN_ZONES,
  );
  const browserZone = useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => 'UTC',
  );

  return (
    <form action={action} className="mt-8 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.name} className="text-small font-medium">
          Workspace name
        </label>
        <Input
          id={ids.name}
          name="name"
          required
          autoFocus
          maxLength={120}
          autoComplete="organization"
          placeholder="Northgate IT"
          defaultValue={defaultName}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? ids.error : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.zone} className="text-small font-medium">
          Time zone
        </label>
        {/* Keyed by the zone, so it starts there once the browser's is known. */}
        <Select
          key={defaultTimeZone ?? browserZone}
          id={ids.zone}
          name="timeZone"
          defaultValue={defaultTimeZone ?? browserZone}
        >
          {zones.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </Select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-small font-medium">
          Connect your first tool
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {TOOLS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer flex-col rounded-xl bg-grey-1 px-3 py-3 transition-colors',
                'has-checked:bg-white has-checked:ring-2 has-checked:ring-lime has-checked:ring-inset',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-lilac-deep',
              )}
            >
              <input
                type="radio"
                name="tool"
                value={option.value}
                checked={tool === option.value}
                onChange={() => setTool(option.value)}
                className="sr-only"
              />
              <span className="text-small font-medium">{option.name}</span>
              <span className="text-label text-muted">{option.detail}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && (
        <p id={ids.error} role="alert" className="text-small text-attention">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        variant="act"
        size="lg"
        disabled={pending}
        className="mt-1 w-full"
      >
        {pending ? 'Saving…' : 'Continue'}
      </Button>
    </form>
  );
}
