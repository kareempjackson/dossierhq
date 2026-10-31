'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';
import { saveProfile } from '@/app/onboarding-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import {
  fieldClass,
  labelClass,
  StepError,
  StepFooter,
  StepHeader,
  type StepProps,
} from './step-parts';

/** What people at an MSP often do; any other is typed in. */
const ROLES = [
  'Owner',
  'Service manager',
  'Technician',
  'Account manager',
  'vCIO',
  'Operations',
];

export function AboutYouStep({
  next,
  back,
  profile,
  onSaved,
  welcome,
}: StepProps & {
  profile: { name: string; title: string };
  onSaved: (profile: { name: string; title: string }) => void;
  /** Says hello: the workspace they joined, or Dossier for a new one. */
  welcome: string;
}) {
  const id = useId();
  const [name, setName] = useState(profile.name);
  const [title, setTitle] = useState(profile.title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const saved = { name: name.trim(), title: title.trim() };
      const result = await saveProfile(saved);
      if (!result.ok) return setError(result.error);
      onSaved(saved);
      next();
    });
  }

  return (
    <form onSubmit={submit}>
      <StepHeader eyebrow="About you" title={welcome}>
        A few questions so Dossier fits how you work. It takes about five
        minutes, and you can change any of it later.
      </StepHeader>

      <div className="mt-8 flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className={labelClass}>
            Your name
          </label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={100}
            autoComplete="name"
            className={fieldClass}
          />
          <p className="text-meta-sm text-muted">
            Your team sees it beside what you approve and change.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-title`} className={labelClass}>
            What you do{' '}
            <span className="font-normal text-muted">(optional)</span>
          </label>
          <div
            role="group"
            aria-label="Common roles"
            className="flex flex-wrap gap-2"
          >
            {ROLES.map((role) => {
              const chosen = title === role;
              return (
                <button
                  key={role}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => setTitle(chosen ? '' : role)}
                  className={cn(
                    'h-9 rounded-full px-4 text-body transition-colors',
                    chosen
                      ? 'bg-ink text-white'
                      : 'bg-surface text-text hover:bg-hairline hover:text-ink',
                  )}
                >
                  {role}
                </button>
              );
            })}
          </div>
          <input
            id={`${id}-title`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            autoComplete="organization-title"
            placeholder="Or type your own"
            className={fieldClass}
          />
        </div>

        <StepError message={error} />
      </div>

      <StepFooter back={back}>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Saving…' : 'Continue'}
        </Button>
      </StepFooter>
    </form>
  );
}
