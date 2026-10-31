'use client';

import { LOGO_TYPES, type ReportSettings } from '@dossierhq/contracts';
import { ImagePlus } from 'lucide-react';
import { useId, useRef, useState, useTransition, type FormEvent } from 'react';
import {
  removeBrandLogo,
  saveBranding,
  uploadBrandLogo,
} from '@/app/onboarding-actions';
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

/** Colours that read well as a band and as link text on white. */
const SWATCHES = [
  { value: '#087f5e', name: 'Green' },
  { value: '#1f6feb', name: 'Blue' },
  { value: '#6d28d9', name: 'Violet' },
  { value: '#b42318', name: 'Red' },
  { value: '#c2410c', name: 'Orange' },
  { value: '#0b1f18', name: 'Near black' },
];

export function BrandingStep({
  next,
  back,
  settings,
  companyName,
  email,
  onSaved,
}: StepProps & {
  settings: ReportSettings;
  companyName: string;
  /** Their own, suggested for replies. */
  email: string;
  onSaved: (settings: ReportSettings) => void;
}) {
  const id = useId();
  const [senderName, setSenderName] = useState(
    settings.senderName || companyName,
  );
  const [replyTo, setReplyTo] = useState(settings.replyTo ?? '');
  const [colour, setColour] = useState(settings.brandColour);
  const [logo, setLogo] = useState(settings.logo);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.set('logo', file);
    startUpload(async () => {
      const result = await uploadBrandLogo(form);
      if (result.ok) {
        setLogo(result.settings.logo);
        onSaved(result.settings);
      } else setError(result.error);
      if (fileRef.current) fileRef.current.value = '';
    });
  }

  function removeLogo() {
    setError(null);
    startUpload(async () => {
      const result = await removeBrandLogo();
      if (result.ok) {
        setLogo(null);
        onSaved(result.settings);
      } else setError(result.error);
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveBranding({
        senderName,
        replyTo,
        brandColour: colour,
      });
      if (!result.ok) return setError(result.error);
      onSaved(result.settings);
      next();
    });
  }

  return (
    <form onSubmit={submit}>
      <StepHeader eyebrow="Client reports" title="Make reports look like yours">
        Dossier drafts a weekly report for each client, and you approve it
        before it goes. This is how it looks in their inbox.
      </StepHeader>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className={labelClass}>Logo</span>
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor={`${id}-logo`}
                className={cn(
                  'grid h-16 w-40 cursor-pointer place-items-center overflow-hidden rounded-tile bg-surface ring-1 ring-hairline transition-colors ring-inset hover:bg-hairline',
                  'has-focus-visible:outline-2 has-focus-visible:outline-brand',
                  uploading && 'opacity-60',
                )}
              >
                {logo ? (
                  // A data URL from the API, so there's nothing for next/image to do.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo}
                    alt="Your logo"
                    className="max-h-12 max-w-36"
                  />
                ) : (
                  <span className="flex items-center gap-2 text-meta text-muted">
                    <ImagePlus aria-hidden className="size-4" />
                    {uploading ? 'Uploading…' : 'Choose a logo'}
                  </span>
                )}
                <input
                  ref={fileRef}
                  id={`${id}-logo`}
                  type="file"
                  accept={LOGO_TYPES.join(',')}
                  className="sr-only"
                  disabled={uploading}
                  onChange={(event) => upload(event.target.files?.[0])}
                />
              </label>
              {logo && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  onClick={removeLogo}
                >
                  Remove
                </Button>
              )}
            </div>
            <p className="text-meta-sm text-muted">
              A PNG or JPEG under 256 KB. Email apps don’t show SVG.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-sender`} className={labelClass}>
              From
            </label>
            <input
              id={`${id}-sender`}
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              maxLength={100}
              placeholder={companyName}
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-reply`} className={labelClass}>
              Replies go to{' '}
              <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id={`${id}-reply`}
              type="email"
              value={replyTo}
              onChange={(event) => setReplyTo(event.target.value)}
              spellCheck={false}
              placeholder={email}
              className={fieldClass}
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className={labelClass}>Brand colour</legend>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch.value}
                  type="button"
                  aria-label={swatch.name}
                  aria-pressed={colour === swatch.value}
                  onClick={() => setColour(swatch.value)}
                  style={{ backgroundColor: swatch.value }}
                  className={cn(
                    'size-8 rounded-full ring-offset-2 ring-offset-sheet transition-shadow',
                    colour === swatch.value
                      ? 'ring-2 ring-ink'
                      : 'hover:ring-2 hover:ring-hairline',
                  )}
                />
              ))}
              <label className="flex items-center gap-2 text-meta text-muted">
                <span className="sr-only">Any colour</span>
                <input
                  type="color"
                  value={colour}
                  onChange={(event) => setColour(event.target.value)}
                  className="h-8 w-10 cursor-pointer rounded-row bg-surface p-0.5"
                />
                <span className="font-mono text-mono">{colour}</span>
              </label>
            </div>
          </fieldset>
        </div>

        <ReportPreview
          logo={logo}
          sender={senderName || companyName}
          colour={colour}
        />
      </div>

      <div className="mt-6">
        <StepError message={error} />
      </div>

      <StepFooter back={back}>
        <Button variant="ghost" disabled={pending} onClick={next}>
          Skip for now
        </Button>
        <Button type="submit" variant="primary" disabled={pending || uploading}>
          {pending ? 'Saving…' : 'Save and continue'}
        </Button>
      </StepFooter>
    </form>
  );
}

/** The top of a report email, as it changes. */
function ReportPreview({
  logo,
  sender,
  colour,
}: {
  logo: string | null;
  sender: string;
  colour: string;
}) {
  return (
    <figure className="self-start">
      <div
        aria-hidden
        className="overflow-hidden rounded-tile bg-white shadow-card ring-1 ring-hairline"
      >
        <div className="h-1.5" style={{ backgroundColor: colour }} />
        <div className="px-5 pt-5 pb-6">
          <div className="flex h-10 items-center">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="max-h-10 max-w-40" />
            ) : (
              <span className="truncate text-section font-semibold text-ink">
                {sender}
              </span>
            )}
          </div>
          <p
            className="mt-5 text-figure font-semibold"
            style={{ color: colour }}
          >
            Your week at Acme Dental
          </p>
          <p className="mt-1 text-meta text-muted">3 – 9 November</p>
          <div className="mt-5 flex flex-col gap-2">
            <span className="h-2 w-full rounded-full bg-surface" />
            <span className="h-2 w-11/12 rounded-full bg-surface" />
            <span className="h-2 w-3/4 rounded-full bg-surface" />
          </div>
          <p
            className="mt-5 text-meta font-medium underline underline-offset-2"
            style={{ color: colour }}
          >
            See what we did this week
          </p>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-meta-sm text-muted">
        From {sender}
      </figcaption>
    </figure>
  );
}
