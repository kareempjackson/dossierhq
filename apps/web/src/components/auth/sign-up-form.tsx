'use client';

import { useActionState, useId, useState, useSyncExternalStore } from 'react';
import { signUp, type SignUpState } from '@/app/auth-actions';
import { TextLink } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/cn';

const noSubscription = () => () => {};

const fieldClass =
  'h-10 w-full rounded-input bg-surface px-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert';

export function SignUpForm({ timeZones }: { timeZones: string[] }) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(
    signUp,
    {},
  );
  const id = useId();
  // Start from the browser's own time zone (unknown while rendering on the server).
  const browserZone = useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => '',
  );
  const [chosen, setChosen] = useState(state.values?.timeZone || null);
  const timeZone =
    chosen ??
    (timeZones.includes(browserZone) ? browserZone : browserZone && 'UTC');

  const field = (name: string) => ({
    id: `${id}-${name}`,
    name,
    'aria-invalid': state.field === name || undefined,
    'aria-describedby': state.field === name ? `${id}-error` : undefined,
  });

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <Field id={`${id}-workspaceName`} label="Company name">
        <input
          {...field('workspaceName')}
          required
          autoComplete="organization"
          defaultValue={state.values?.workspaceName}
          className={fieldClass}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-name`} label="Your name">
          <input
            {...field('name')}
            required
            autoComplete="name"
            defaultValue={state.values?.name}
            className={fieldClass}
          />
        </Field>
        <Field id={`${id}-title`} label="Your role" hint="Optional">
          <input
            {...field('title')}
            autoComplete="organization-title"
            placeholder="Service manager"
            defaultValue={state.values?.title}
            className={cn(fieldClass, 'placeholder:text-muted')}
          />
        </Field>
      </div>
      <Field id={`${id}-email`} label="Work email">
        <input
          {...field('email')}
          type="email"
          required
          autoComplete="username"
          spellCheck={false}
          defaultValue={state.values?.email}
          className={fieldClass}
        />
      </Field>
      <Field
        id={`${id}-password`}
        label="Password"
        hint="At least 12 characters. A few words together works well."
      >
        <input
          {...field('password')}
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={fieldClass}
        />
      </Field>
      <Field
        id={`${id}-timeZone`}
        label="Time zone"
        hint="Dates and times in Dossier use this."
      >
        <select
          {...field('timeZone')}
          value={timeZone}
          onChange={(event) => setChosen(event.target.value)}
          className={fieldClass}
        >
          {!timeZone && <option value="">Detecting…</option>}
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </Field>

      {state.error && (
        <div
          id={`${id}-error`}
          role="alert"
          className="rounded-tile bg-alert-soft px-4 py-3"
        >
          <StatusDot
            tone="failure"
            label={state.error}
            className="text-meta text-ink"
          />
          {state.taken && (
            <p className="mt-1 pl-3.5 text-meta">
              <TextLink href="/sign-in">Sign in instead</TextLink>
            </p>
          )}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        className="mt-1 h-10 w-full"
      >
        {pending ? 'Creating your workspace…' : 'Create workspace'}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-meta font-medium text-ink">
        {label}
        {hint === 'Optional' && (
          <span className="font-normal text-muted"> (optional)</span>
        )}
      </label>
      {children}
      {hint && hint !== 'Optional' && (
        <p className="text-meta-sm text-muted">{hint}</p>
      )}
    </div>
  );
}
