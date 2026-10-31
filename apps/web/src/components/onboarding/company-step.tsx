'use client';

import type { ClientCount, Onboarding, TeamSize } from '@dossierhq/contracts';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { saveCompany } from '@/app/onboarding-actions';
import { Button } from '@/components/ui/button';
import {
  ChoiceChips,
  fieldClass,
  labelClass,
  StepError,
  StepFooter,
  StepHeader,
  type StepProps,
} from './step-parts';

const CLIENT_COUNTS: { value: ClientCount; label: string }[] = [
  { value: '1-10', label: '1–10' },
  { value: '11-25', label: '11–25' },
  { value: '26-50', label: '26–50' },
  { value: '51-100', label: '51–100' },
  { value: '100+', label: 'More than 100' },
];

const TEAM_SIZES: { value: TeamSize; label: string }[] = [
  { value: '1', label: 'Just me' },
  { value: '2-5', label: '2–5' },
  { value: '6-15', label: '6–15' },
  { value: '16-50', label: '16–50' },
  { value: '50+', label: 'More than 50' },
];

export function CompanyStep({
  next,
  back,
  company,
  suggestedWebsite,
  timeZones,
  onSaved,
}: StepProps & {
  company: Onboarding['company'];
  /** From their email's domain, when it's a company's. */
  suggestedWebsite: string | null;
  timeZones: string[];
  onSaved: (onboarding: Onboarding) => void;
}) {
  const id = useId();
  const [name, setName] = useState(company.name);
  const [website, setWebsite] = useState(
    company.website ?? suggestedWebsite ?? '',
  );
  const [timeZone, setTimeZone] = useState(company.timeZone);
  const [clientCount, setClientCount] = useState(company.clientCount);
  const [teamSize, setTeamSize] = useState(company.teamSize);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveCompany({
        name,
        website,
        timeZone,
        clientCount,
        teamSize,
      });
      if (!result.ok) return setError(result.error);
      onSaved(result.onboarding);
      next();
    });
  }

  return (
    <form onSubmit={submit}>
      <StepHeader eyebrow="Your company" title="Tell us about your MSP">
        Your company’s name is what your team sees in Dossier, and what clients
        see on their reports unless you choose otherwise.
      </StepHeader>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-name`} className={labelClass}>
            Company name
          </label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={100}
            autoComplete="organization"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-website`} className={labelClass}>
            Website <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={`${id}-website`}
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            maxLength={200}
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="yourmsp.com"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-zone`} className={labelClass}>
            Time zone
          </label>
          <select
            id={`${id}-zone`}
            value={timeZone}
            onChange={(event) => setTimeZone(event.target.value)}
            className={fieldClass}
          >
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <p className="-mt-4 text-meta-sm text-muted sm:col-span-2">
          Dates, times and report schedules in Dossier use this time zone.
        </p>

        <div className="sm:col-span-2">
          <ChoiceChips
            name="clientCount"
            legend="How many clients do you look after?"
            hint="(optional)"
            options={CLIENT_COUNTS}
            value={clientCount}
            onChange={setClientCount}
          />
        </div>
        <div className="sm:col-span-2">
          <ChoiceChips
            name="teamSize"
            legend="How many people work at your MSP?"
            hint="(optional)"
            options={TEAM_SIZES}
            value={teamSize}
            onChange={setTeamSize}
          />
        </div>

        <div className="sm:col-span-2">
          <StepError message={error} />
        </div>
      </div>

      <StepFooter back={back}>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Saving…' : 'Continue'}
        </Button>
      </StepFooter>
    </form>
  );
}
