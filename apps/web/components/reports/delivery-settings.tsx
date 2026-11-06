'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { saveDelivery, type FormState } from '@/app/(workspace)/actions';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/lib/store/hooks';
import { selectMe } from '@/lib/store/session-slice';
import type { DeliverySettings as Settings } from '@/lib/workspace';
import { ReportPaper } from './report-paper';

/** From the brand book: deep, night, lilac, plum and maroon. */
const COLOURS = [
  { value: '#002e3b', name: 'Deep' },
  { value: '#141716', name: 'Night' },
  { value: '#b9a8ff', name: 'Lilac' },
  { value: '#3e3654', name: 'Plum' },
  { value: '#5b302c', name: 'Maroon' },
];
const DAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays'];
const TIMES = ['06:00', '07:00', '08:00', '09:00', '10:00', '12:00', '15:00'];
const MAX_LOGO = 256 * 1024;

/** How reports look and when they go, with a preview that follows along. */
export function DeliverySettings({
  defaults,
  sample,
}: {
  defaults: Settings;
  sample: { clientName: string; period: string | null };
}) {
  const timeZone = useAppSelector(selectMe)?.workspace.timeZone;
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveDelivery,
    {},
  );
  const [senderName, setSenderName] = useState(defaults.senderName);
  const [colour, setColour] = useState(defaults.colour);
  const [logo, setLogo] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const id = useId();

  useEffect(
    () => () => {
      if (logo) URL.revokeObjectURL(logo);
    },
    [logo],
  );

  const schedule = (name: string, value: string, label: string) => (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${id}-${name}`} className="text-small font-medium">
        {label}
      </label>
      <Select id={`${id}-${name}`} name={name} defaultValue={value}>
        {DAYS.flatMap((day) =>
          TIMES.map((time) => (
            <option key={`${day} ${time}`} value={`${day} at ${time}`}>
              {day} at {time}
            </option>
          )),
        )}
      </Select>
    </div>
  );

  return (
    <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <form action={action} className="flex max-w-lg flex-col gap-5">
        <fieldset>
          <legend className="text-small font-medium">Logo</legend>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="grid h-14 w-28 place-items-center rounded-xl bg-grey-1 px-3">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview of an upload
                <img
                  src={logo}
                  alt="Your logo"
                  className="max-h-9 w-auto object-contain"
                />
              ) : (
                <Logo height={16} />
              )}
            </div>
            <label className="relative isolate inline-flex h-9 cursor-pointer items-center rounded-full px-5 text-sm font-medium focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
              <span aria-hidden className="file-shape file-outline" />
              Upload
              <input
                type="file"
                name="logo"
                accept="image/png,image/jpeg"
                className="sr-only"
                aria-describedby={`${id}-logo-hint`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (!['image/png', 'image/jpeg'].includes(file.type)) {
                    setLogoError('Choose a PNG or JPEG.');
                  } else if (file.size > MAX_LOGO) {
                    setLogoError(
                      `That one is ${Math.round(file.size / 1024)} KB. Use one under 256 KB.`,
                    );
                  } else {
                    setLogoError(null);
                    setLogo(URL.createObjectURL(file));
                  }
                }}
              />
            </label>
            <p id={`${id}-logo-hint`} className="text-[0.75rem] text-muted">
              PNG or JPEG under 256 KB
            </p>
          </div>
          {logoError && (
            <p role="alert" className="mt-2 text-[0.75rem] text-attention">
              {logoError}
            </p>
          )}
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-sender`} className="text-small font-medium">
            Sender’s name
          </label>
          <Input
            id={`${id}-sender`}
            name="senderName"
            required
            value={senderName}
            onChange={(event) => setSenderName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-reply`} className="text-small font-medium">
            Replies go to (optional)
          </label>
          <Input
            id={`${id}-reply`}
            name="replyTo"
            type="email"
            defaultValue={defaults.replyTo}
          />
        </div>

        <fieldset>
          <legend className="text-small font-medium">Brand colour</legend>
          <div className="mt-2 flex gap-2.5">
            {COLOURS.map((option) => (
              <label key={option.value} className="relative">
                <input
                  type="radio"
                  name="colour"
                  value={option.value}
                  checked={colour === option.value}
                  onChange={() => setColour(option.value)}
                  className="peer sr-only"
                />
                <span className="sr-only">{option.name}</span>
                <span
                  aria-hidden
                  className={cn(
                    'block size-8 cursor-pointer rounded-full ring-offset-2 transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-lilac-deep',
                    colour === option.value && 'ring-2 ring-ink',
                  )}
                  style={{ backgroundColor: option.value }}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          {schedule('draftAt', defaults.draftAt, 'Draft every client’s report')}
          {schedule('sendAt', defaults.sendAt, 'Send approved reports')}
        </div>
        <p className="text-[0.75rem] text-muted">
          Times are in{' '}
          {timeZone
            ? timeZone.replaceAll('_', ' ')
            : 'your workspace’s time zone'}
          . Nothing goes out until someone approves it. If a send fails, Dossier
          doesn’t try again by itself.
        </p>

        {state.error && (
          <p role="alert" className="text-small text-attention">
            {state.error}
          </p>
        )}
        <Button
          type="submit"
          variant="act"
          size="lg"
          disabled={pending}
          className="self-start"
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </form>

      <section
        aria-label="Preview"
        className="self-start rounded-2xl bg-grey-1 p-4"
      >
        <p className="text-[0.75rem] text-muted">Preview</p>
        <div className="mt-2 h-[26rem]">
          <ReportPaper
            colour={colour}
            logo={logo}
            clientName={sample.clientName}
            period={sample.period}
            footer={`From ${senderName.trim() || 'your workspace'}`}
          >
            <div aria-hidden className="flex flex-col gap-2.5 pt-2">
              {[
                'w-4/5',
                'w-1/2',
                'w-11/12',
                'w-3/5',
                'w-2/3',
                'w-2/5',
                'w-4/5',
                'w-1/2',
              ].map((width, index) => (
                <div
                  key={index}
                  className={cn(
                    'h-2 rounded-full bg-grey-2',
                    width,
                    index % 2 === 0 && 'mt-1',
                  )}
                />
              ))}
            </div>
          </ReportPaper>
        </div>
      </section>
    </div>
  );
}
