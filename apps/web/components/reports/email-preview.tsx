'use client';

import { Mail, X } from 'lucide-react';
import { useId, useRef, useState, useTransition } from 'react';
import {
  previewEmail,
  type EmailPreview as Preview,
} from '@/app/(workspace)/reports/actions';
import { Button } from '@/components/ui/button';
import { IndexLoader } from '@/components/ui/index-loader';

/**
 * The email a report goes out as, opened over the review: who it's from
 * and to, the subject, and the message itself as their inbox shows it. It's
 * read afresh each time, so it reflects the sender, recipients and branding
 * of the moment. The message runs in a sandbox: no scripts, no requests.
 */
export function EmailPreview({
  reportId,
  clientName,
}: {
  reportId: string;
  clientName: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, startLoading] = useTransition();
  const id = useId();

  const open = () => {
    setPreview(null);
    dialog.current?.showModal();
    startLoading(async () => setPreview(await previewEmail(reportId)));
  };
  const close = () => dialog.current?.close();
  const email = preview?.ok ? preview.email : null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 self-start"
        onClick={open}
      >
        <Mail aria-hidden className="size-3.5" strokeWidth={1.75} />
        Preview email
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="mx-auto mt-[4vh] h-[92vh] w-[min(46rem,calc(100%-2rem))] overflow-hidden rounded-2xl bg-white p-0 text-ink shadow-float backdrop:bg-ink/25"
      >
        {/* The details above, and the message filling what's left. */}
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div>
              <h2 id={`${id}-title`} className="text-h3">
                Email preview
              </h2>
              <p className="mt-0.5 text-[0.75rem] text-muted">
                What {clientName}’s recipients get, as it stands now. Lines that
                cite nothing are left out.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close the preview"
              className="rounded-full p-1.5 text-muted transition-colors hover:bg-grey-1 hover:text-ink"
            >
              <X aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          </div>

          {loading || !preview ? (
            <IndexLoader className="h-96" label="Loading the email" />
          ) : !email ? (
            <p
              role="alert"
              className="m-5 rounded-xl bg-grey-1 px-4 py-6 text-small text-attention"
            >
              {preview.ok ? '' : preview.error}
            </p>
          ) : (
            <>
              <dl className="mt-4 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-5 text-small">
                <dt className="text-muted">From</dt>
                <dd className="truncate">{email.from}</dd>
                <dt className="text-muted">To</dt>
                <dd className="truncate">
                  {email.to.length > 0 ? (
                    email.to.join(', ')
                  ) : (
                    <span className="text-attention">
                      Nobody yet, so it can’t go
                    </span>
                  )}
                </dd>
                {email.cc.length > 0 && (
                  <>
                    <dt className="text-muted">Cc</dt>
                    <dd className="truncate">{email.cc.join(', ')}</dd>
                  </>
                )}
                {email.replyTo && (
                  <>
                    <dt className="text-muted">Reply to</dt>
                    <dd className="truncate">{email.replyTo}</dd>
                  </>
                )}
                <dt className="text-muted">Subject</dt>
                <dd className="font-medium">{email.subject}</dd>
              </dl>
              <iframe
                title={`The email: ${email.subject}`}
                sandbox=""
                srcDoc={email.html}
                className="mt-4 min-h-0 w-full flex-1 border-0 bg-[#f2f2ef]"
              />
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
