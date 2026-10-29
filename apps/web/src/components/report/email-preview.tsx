'use client';

import type { ReportEmail } from '@dossierhq/contracts';
import { Mail, X } from 'lucide-react';
import { useId, useRef, useState, useTransition } from 'react';
import { previewReportEmail } from '@/app/report-actions';
import { Button } from '@/components/ui/button';

/**
 * Shows the email a report goes out as, branding and all, in a dialog. The
 * email's HTML runs in a sandboxed frame with nothing allowed.
 */
export function EmailPreview({ reportId }: { reportId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [email, setEmail] = useState<ReportEmail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setError(null);
    dialogRef.current?.showModal();
    startTransition(async () => {
      const result = await previewReportEmail(reportId);
      if (result.ok) setEmail(result.email);
      else setError(result.error);
    });
  }

  return (
    <>
      <Button variant="ghost" onClick={open} className="max-sm:px-3">
        <Mail aria-hidden />
        <span className="sr-only sm:not-sr-only">Preview email</span>
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto h-[min(860px,calc(100dvh-2rem))] w-[min(760px,calc(100vw-2rem))] rounded-card bg-sheet p-0 text-text shadow-float backdrop:bg-ink/30"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-section font-semibold">
                {email?.subject ?? 'The email'}
              </h2>
              {email && (
                <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-meta">
                  <dt className="text-muted">From</dt>
                  <dd className="truncate text-ink">{email.from}</dd>
                  <dt className="text-muted">To</dt>
                  <dd className="truncate text-ink">
                    {email.to.length > 0 ? email.to.join(', ') : 'No one yet'}
                  </dd>
                  {email.cc.length > 0 && (
                    <>
                      <dt className="text-muted">Copied</dt>
                      <dd className="truncate text-ink">
                        {email.cc.join(', ')}
                      </dd>
                    </>
                  )}
                  {email.replyTo && (
                    <>
                      <dt className="text-muted">Replies</dt>
                      <dd className="truncate text-ink">{email.replyTo}</dd>
                    </>
                  )}
                </dl>
              )}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 bg-surface">
            {error ? (
              <p role="alert" className="p-5 text-meta text-alert">
                {error}
              </p>
            ) : email ? (
              <iframe
                title={`Preview of ${email.subject}`}
                srcDoc={email.html}
                sandbox=""
                className="size-full border-0"
              />
            ) : (
              <p role="status" className="p-5 text-meta text-muted">
                {pending ? 'Loading the email…' : ''}
              </p>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
