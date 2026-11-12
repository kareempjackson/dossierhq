'use client';

import { Check, Upload } from 'lucide-react';
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  saveDelivery,
  type DeliveryState,
} from '@/app/(workspace)/reports/delivery/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BusyIcon } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';
import { ReportPaper } from './report-paper';

/** A time each week in the workspace's zone; `weekday` 1 is Monday. */
export type WeeklyTime = { weekday: number; hour: number };

export type Delivery = {
  /** Empty uses the workspace's name. */
  senderName: string;
  /** Empty sends replies to Dossier's own address. */
  replyTo: string;
  /** `#rrggbb`. */
  colour: string;
  /** A `data:` URL, or null for the sender's name in its place. */
  logo: string | null;
  /** Null drafts only when someone asks. */
  draftAt: WeeklyTime | null;
  /** Null sends only when someone presses Send. */
  sendAt: WeeklyTime | null;
};

/** From the brand book: deep, night, lilac, plum and maroon. */
const COLOURS = [
  { value: '#002e3b', name: 'Deep' },
  { value: '#141716', name: 'Night' },
  { value: '#b9a8ff', name: 'Lilac' },
  { value: '#3e3654', name: 'Plum' },
  { value: '#5b302c', name: 'Maroon' },
];
const WEEKDAYS = [
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
  'Sundays',
];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const LOGO_TYPES = ['image/png', 'image/jpeg'];
const MAX_LOGO = 256 * 1024;

type Slot = { day: string; hour: string };
/** Marks the field a save was refused over. */
type Invalid = { 'aria-invalid'?: true; 'aria-describedby'?: string };
const slot = (time: WeeklyTime | null, hour: number): Slot => ({
  day: time ? String(time.weekday) : '',
  hour: String(time?.hour ?? hour),
});

/**
 * How reports look and when they go, with a preview that follows along.
 * Owners and admins save it; everyone else sees it.
 */
export function DeliverySettings({
  settings,
  workspaceName,
  timeZone,
  canManage,
  sample,
}: {
  settings: Delivery;
  workspaceName: string;
  /** "America/Port of Spain". */
  timeZone: string;
  canManage: boolean;
  sample: { clientName: string; period: string | null };
}) {
  const [state, action, pending] = useActionState<DeliveryState, FormData>(
    saveDelivery,
    {},
  );
  const [seen, setSeen] = useState(state);
  const [edited, setEdited] = useState(false);
  const [senderName, setSenderName] = useState(settings.senderName);
  const [replyTo, setReplyTo] = useState(settings.replyTo);
  const [colour, setColour] = useState(settings.colour);
  const [draft, setDraft] = useState(slot(settings.draftAt, 7));
  const [send, setSend] = useState(slot(settings.sendAt, 9));
  /** A logo chosen but not saved yet, as a local address for the preview. */
  const [picked, setPicked] = useState<string | null>(null);
  /** The saved logo is to go when this is saved. */
  const [removed, setRemoved] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const id = useId();

  // Once saved, the page holds what was saved: the chosen logo among it.
  // Each save's answer shows until the next edit: "Saved.", or why not.
  if (state !== seen) {
    setSeen(state);
    setEdited(false);
    if (state.saved) {
      setPicked(null);
      setRemoved(false);
    }
  }
  useEffect(() => {
    if (state.saved && file.current) file.current.value = '';
  }, [state]);
  useEffect(
    () => () => {
      if (picked) URL.revokeObjectURL(picked);
    },
    [picked],
  );

  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setEdited(true);
    };
  const invalid = (field: string): Invalid =>
    state.field === field && !edited
      ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` }
      : {};

  const logo = removed ? null : (picked ?? settings.logo);
  const sender = senderName.trim() || workspaceName;
  const custom = !COLOURS.some((option) => option.value === colour);

  return (
    <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          startTransition(() => action(form));
        }}
        className="flex max-w-lg flex-col gap-5"
      >
        <fieldset disabled={!canManage || pending} className="contents">
          <fieldset>
            <legend className="text-small font-medium">Logo</legend>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="flex h-14 w-40 items-center justify-center rounded-xl bg-grey-1 px-3">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a data URL or a local preview
                  <img
                    src={logo}
                    alt="Your logo"
                    className="max-h-9 w-auto max-w-full object-contain"
                  />
                ) : (
                  <span
                    className="min-w-0 truncate text-small font-semibold"
                    style={{ color: colour }}
                  >
                    {sender}
                  </span>
                )}
              </div>
              {canManage && (
                <>
                  <label className="relative isolate inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-5 text-sm font-medium focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
                    <span aria-hidden className="file-shape file-outline" />
                    <Upload
                      aria-hidden
                      className="size-3.5"
                      strokeWidth={1.75}
                    />
                    {logo ? 'Replace' : 'Upload'}
                    <input
                      ref={file}
                      type="file"
                      name="logo"
                      accept="image/png,image/jpeg"
                      className="sr-only"
                      aria-describedby={`${id}-logo-hint`}
                      {...invalid('logo')}
                      onChange={(event) => {
                        const chosen = event.target.files?.[0];
                        if (!chosen) return;
                        if (!LOGO_TYPES.includes(chosen.type)) {
                          setLogoError(
                            'Choose a PNG or JPEG. Gmail and Outlook don’t show SVG logos.',
                          );
                          event.target.value = '';
                        } else if (chosen.size > MAX_LOGO) {
                          setLogoError(
                            `That one is ${Math.round(chosen.size / 1024)} KB. Use one under 256 KB.`,
                          );
                          event.target.value = '';
                        } else {
                          setLogoError(null);
                          setRemoved(false);
                          setEdited(true);
                          setPicked(URL.createObjectURL(chosen));
                        }
                      }}
                    />
                  </label>
                  {logo && (
                    <button
                      type="button"
                      onClick={() => {
                        if (file.current) file.current.value = '';
                        setPicked(null);
                        setRemoved(Boolean(settings.logo));
                        setLogoError(null);
                        setEdited(true);
                      }}
                      className="rounded-sm text-[0.75rem] text-muted hover:text-ink"
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
              <p id={`${id}-logo-hint`} className="text-[0.75rem] text-muted">
                PNG or JPEG under 256 KB. Without one, the email shows the
                sender’s name.
              </p>
            </div>
            <input type="hidden" name="removeLogo" value={removed ? '1' : ''} />
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
              maxLength={100}
              value={senderName}
              placeholder={workspaceName}
              onChange={(event) => change(setSenderName)(event.target.value)}
              {...invalid('senderName')}
            />
            <p className="text-[0.75rem] text-muted">
              Left empty, it’s {workspaceName}.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-reply`} className="text-small font-medium">
              Replies go to (optional)
            </label>
            <Input
              id={`${id}-reply`}
              name="replyTo"
              type="email"
              spellCheck={false}
              value={replyTo}
              placeholder="help@yourmsp.com"
              onChange={(event) => change(setReplyTo)(event.target.value)}
              {...invalid('replyTo')}
            />
          </div>

          <fieldset>
            <legend className="text-small font-medium">Brand colour</legend>
            <p className="text-[0.75rem] text-muted">
              The line across the top of the email, and the sender’s name when
              there’s no logo.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              {COLOURS.map((option) => (
                <label key={option.value} className="relative">
                  <input
                    type="radio"
                    name="swatch"
                    value={option.value}
                    checked={colour === option.value}
                    onChange={() => change(setColour)(option.value)}
                    className="peer sr-only"
                  />
                  <span className="sr-only">{option.name}</span>
                  <span
                    aria-hidden
                    className={cn(
                      'block size-8 cursor-pointer rounded-full ring-offset-2 transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-lilac-deep peer-disabled:cursor-default',
                      colour === option.value && 'ring-2 ring-ink',
                    )}
                    style={{ backgroundColor: option.value }}
                  />
                </label>
              ))}
              <label
                className={cn(
                  'relative ml-1 flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-[0.75rem] text-muted',
                  custom && 'ring-2 ring-ink',
                )}
              >
                <input
                  type="color"
                  value={custom ? colour : '#1f2937'}
                  onChange={(event) =>
                    change(setColour)(event.target.value.toLowerCase())
                  }
                  {...invalid('brandColour')}
                  className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0 disabled:cursor-default [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                />
                {custom ? colour : 'Other'}
              </label>
            </div>
            <input type="hidden" name="brandColour" value={colour} />
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Schedule
              name="draft"
              label="Draft every client’s report"
              off="Only when someone asks"
              value={draft}
              onChange={change(setDraft)}
              invalid={invalid('draftAt')}
            />
            <Schedule
              name="send"
              label="Send approved reports"
              off="Only when sent by hand"
              value={send}
              onChange={change(setSend)}
              invalid={invalid('sendAt')}
            />
          </div>
          <p className="text-[0.75rem] text-muted">
            Times are in {timeZone}, the workspace’s time zone. Nothing goes out
            until someone approves it, and a report approved after the sending
            time goes at once. If a send fails, Dossier doesn’t try again by
            itself.
          </p>
        </fieldset>

        {state.error && !edited && (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-small text-attention"
          >
            {state.error}
          </p>
        )}
        {canManage ? (
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              variant="act"
              size="lg"
              disabled={pending}
              className="self-start"
            >
              <BusyIcon icon={Check} busy={pending} />
              Save
            </Button>
            <p role="status" className="text-small text-healthy">
              {state.saved && !edited && !pending ? 'Saved.' : ''}
            </p>
          </div>
        ) : (
          <p className="text-small text-muted">
            Only owners and admins can change how reports go out.
          </p>
        )}
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
            sender={sender}
            clientName={sample.clientName}
            period={sample.period}
            footer={`Sent by ${sender}.${replyTo.trim() ? ' Reply to this email to reach us.' : ''}`}
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

/** A day and an hour each week, or off. */
function Schedule({
  name,
  label,
  off,
  value,
  onChange,
  invalid,
}: {
  name: 'draft' | 'send';
  label: string;
  /** What "no day" means, e.g. "Only when someone asks". */
  off: string;
  value: Slot;
  onChange: (value: Slot) => void;
  invalid: Invalid;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-small font-medium">{label}</legend>
      <div className="mt-2 flex gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-day`} className="sr-only">
            Day
          </label>
          <Select
            id={`${id}-day`}
            name={`${name}Day`}
            value={value.day}
            onChange={(event) =>
              onChange({ ...value, day: event.target.value })
            }
            {...invalid}
          >
            <option value="">{off}</option>
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index + 1}>
                {day}
              </option>
            ))}
          </Select>
        </div>
        {value.day && (
          <div className="w-28 shrink-0">
            <label htmlFor={`${id}-hour`} className="sr-only">
              Time
            </label>
            <Select
              id={`${id}-hour`}
              name={`${name}Hour`}
              value={value.hour}
              onChange={(event) =>
                onChange({ ...value, hour: event.target.value })
              }
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
    </fieldset>
  );
}
