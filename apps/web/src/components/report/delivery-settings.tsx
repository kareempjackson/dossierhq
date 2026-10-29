'use client';

import {
  LOGO_TYPES,
  WEEKDAY_NAMES,
  weeklyTimeLabel,
  type ReportSettings,
  type WeeklyTime,
} from '@dossierhq/contracts';
import { useActionState, useId, useRef, useState, useTransition } from 'react';
import {
  removeLogo,
  saveReportSettings,
  uploadLogo,
  type SettingsState,
} from '@/app/report-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const fieldClass =
  'h-10 rounded-input bg-surface px-3 text-body font-normal text-ink placeholder:text-muted aria-invalid:outline-2 aria-invalid:outline-alert';
const labelClass = 'flex flex-col gap-1.5 text-meta font-medium text-ink';
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * How weekly reports look in the client's inbox, and when Dossier drafts
 * and sends them. Owners and admins change it; everyone else sees it.
 */
export function DeliverySettings({
  settings,
  workspaceName,
  timeZone,
  canManage,
}: {
  settings: ReportSettings;
  workspaceName: string;
  timeZone: string;
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <dl className="grid gap-x-8 gap-y-4 rounded-card bg-sheet p-5 shadow-card sm:grid-cols-[12rem_minmax(0,1fr)]">
        <dt className="text-meta text-muted">From</dt>
        <dd className="text-body text-ink">
          {settings.senderName || workspaceName}
          {settings.replyTo && (
            <span className="text-muted">, replies to {settings.replyTo}</span>
          )}
        </dd>
        <dt className="text-meta text-muted">Drafted</dt>
        <dd className="text-body text-ink">
          {settings.draftAt
            ? `${weeklyTimeLabel(settings.draftAt)}, ${timeZone}`
            : 'When someone drafts them'}
        </dd>
        <dt className="text-meta text-muted">Sent</dt>
        <dd className="text-body text-ink">
          {settings.sendAt
            ? `Once approved, ${weeklyTimeLabel(settings.sendAt)}, ${timeZone}`
            : 'When someone sends them'}
        </dd>
        <dd className="text-meta text-muted sm:col-span-2">
          Only owners and admins change these.
        </dd>
      </dl>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <LogoSetting logo={settings.logo} />
      <SettingsForm
        settings={settings}
        workspaceName={workspaceName}
        timeZone={timeZone}
      />
    </div>
  );
}

function SettingsForm({
  settings,
  workspaceName,
  timeZone,
}: {
  settings: ReportSettings;
  workspaceName: string;
  timeZone: string;
}) {
  const id = useId();
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    saveReportSettings,
    {},
  );
  const invalid = (field: string) =>
    state.field === field
      ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` }
      : {};

  return (
    <form
      action={action}
      className="flex flex-col gap-5 rounded-card bg-sheet p-5 shadow-card"
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-body font-medium text-ink">
          Who it’s from
        </legend>
        <label className={labelClass}>
          Sender’s name
          <input
            name="senderName"
            maxLength={100}
            defaultValue={state.values?.senderName ?? settings.senderName}
            placeholder={workspaceName}
            {...invalid('senderName')}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          <span>
            Replies go to{' '}
            <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            name="replyTo"
            type="email"
            spellCheck={false}
            defaultValue={state.values?.replyTo ?? settings.replyTo ?? ''}
            placeholder="help@yourmsp.com"
            {...invalid('replyTo')}
            className={fieldClass}
          />
        </label>
        <label className={cn(labelClass, 'sm:col-span-2')}>
          Brand colour
          <span className="flex items-center gap-3">
            <input
              name="brandColour"
              type="color"
              defaultValue={state.values?.brandColour ?? settings.brandColour}
              {...invalid('brandColour')}
              className="h-10 w-16 cursor-pointer rounded-input bg-surface p-1"
            />
            <span className="text-meta font-normal text-muted">
              The line across the top of the email, and its headings.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-body font-medium text-ink">When</legend>
        <p className="text-meta text-muted sm:col-span-2">
          Times are in {timeZone}, the workspace’s time zone.
        </p>
        <WeeklyTimeField
          name="draft"
          label="Draft every client’s report"
          off="Only when someone drafts them"
          value={settings.draftAt}
          hour={state.values?.draftHour}
        />
        <WeeklyTimeField
          name="send"
          label="Send approved reports"
          off="Only when someone presses Send"
          value={settings.sendAt}
          hour={state.values?.sendHour}
        />
        <p className="text-meta text-muted sm:col-span-2">
          A report approved after the sending time goes at once. Turning sending
          on doesn’t send reports approved before it; send those from the
          report. If a send fails, Dossier doesn’t try again by itself.
        </p>
      </fieldset>

      {state.error && (
        <p id={`${id}-error`} role="alert" className="text-meta text-alert">
          {state.error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        <span role="status" className="text-meta text-muted">
          {state.ok && !pending ? 'Saved.' : ''}
        </span>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

/** A day and an hour each week, or off. */
function WeeklyTimeField({
  name,
  label,
  off,
  value,
  hour,
}: {
  name: string;
  label: string;
  off: string;
  value: WeeklyTime | null;
  /** The hour last entered, after a problem saving. */
  hour?: string;
}) {
  const [day, setDay] = useState(value ? String(value.weekday) : '');
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-meta font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${id}-day`} className="sr-only">
          Day
        </label>
        <select
          id={`${id}-day`}
          name={`${name}Day`}
          value={day}
          onChange={(event) => setDay(event.target.value)}
          className={cn(fieldClass, 'min-w-0 flex-1')}
        >
          <option value="">{off}</option>
          {WEEKDAY_NAMES.map((weekday, index) => (
            <option key={weekday} value={index + 1}>
              {weekday}s
            </option>
          ))}
        </select>
        {day && (
          <>
            <label htmlFor={`${id}-hour`} className="sr-only">
              Time
            </label>
            <select
              id={`${id}-hour`}
              name={`${name}Hour`}
              defaultValue={hour ?? value?.hour ?? 8}
              className={cn(fieldClass, 'w-28')}
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </>
        )}
      </div>
    </fieldset>
  );
}

function LogoSetting({ logo }: { logo: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = useId();

  function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.set('logo', file);
    startTransition(async () => {
      const result = await uploadLogo(form);
      if (!result.ok) setError(result.error);
      if (inputRef.current) inputRef.current.value = '';
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeLogo();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card bg-sheet p-5 shadow-card">
      <div className="grid h-16 w-40 shrink-0 place-items-center overflow-hidden rounded-tile bg-surface">
        {logo ? (
          // A data URL from the API, so there's nothing for next/image to do.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="Your logo" className="max-h-12 max-w-36" />
        ) : (
          <span className="text-meta text-muted">No logo</span>
        )}
      </div>
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-body font-medium text-ink">Logo</p>
        <p className="mt-0.5 text-meta text-muted">
          At the top of every report email, shown 40 pixels tall. A PNG or JPEG
          under 256 KB; email apps don’t show SVG.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-meta text-alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Logo file
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={LOGO_TYPES.join(',')}
          className="sr-only"
          onChange={(event) => upload(event.target.files?.[0])}
        />
        {logo && (
          <Button variant="ghost" disabled={pending} onClick={remove}>
            Remove
          </Button>
        )}
        <Button disabled={pending} onClick={() => inputRef.current?.click()}>
          {pending ? 'Saving…' : logo ? 'Replace' : 'Upload'}
        </Button>
      </div>
    </div>
  );
}
