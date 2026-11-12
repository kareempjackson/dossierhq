'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { decideReport, editReport } from '@/app/(workspace)/reports/actions';
import { Mark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { CitedStack } from '@/components/ui/cited-stack';
import { BusyIcon } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';
import type { ReviewView } from '@/lib/report-views';
import { useAppSelector } from '@/lib/store/hooks';
import { selectReports } from '@/lib/store/reports-slice';
import { EmailPreview } from './email-preview';
import { ReportPaper } from './report-paper';

type Status = ReviewView['status'];

const listLabel = (checks: number) =>
  checks === 0
    ? 'Ready'
    : checks === 1
      ? '1 needs a look'
      : `${checks} need a look`;

const href = (id: string) => `/reports/${encodeURIComponent(id)}`;

/**
 * Reviewing one client's report: the drafts waiting on the left, the report
 * as the client will read it in the middle, and who it goes to, what it
 * cites and the decision on the right. Every choice is saved as it's made.
 */
export function ReportReview({ view }: { view: ReviewView }) {
  const reports = useAppSelector(selectReports);
  const queue = reports.status === 'ready' ? reports.queue : [];
  const [status, showStatus] = useOptimistic(view.status);
  const [editing, setEditing] = useState(false);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // The one being read stays in the list once decided, so its place holds.
  const items = queue.some((item) => item.id === view.id)
    ? queue
    : [
        {
          id: view.id,
          clientName: view.clientName,
          checks: view.exceptions.length,
        },
        ...queue,
      ];
  const next = queue.find((item) => item.id !== view.id);
  const lines = view.sections.flatMap((section) => section.lines);

  const decide = (to: Status) =>
    startSaving(async () => {
      showStatus(to);
      setError(null);
      const result = await decideReport(view.id, to);
      if (!result.ok) setError(result.error);
    });

  const startEditing = () => {
    setTexts(Object.fromEntries(lines.map((line) => [line.id, line.text])));
    setError(null);
    setEditing(true);
  };

  const saveEdits = () =>
    startSaving(async () => {
      setError(null);
      const changed = lines.filter(
        (line) =>
          !line.pending && (texts[line.id] ?? line.text).trim() !== line.text,
      );
      if (changed.length === 0) return setEditing(false);
      const result = await editReport(
        view.id,
        changed
          .filter((line) => texts[line.id]!.trim())
          .map((line) => ({ id: line.id, text: texts[line.id]!.trim() })),
        changed
          .filter((line) => !texts[line.id]!.trim())
          .map((line) => line.id),
      );
      if (result.ok) setEditing(false);
      else setError(result.error);
    });

  return (
    <div className="grid flex-1 gap-5 lg:grid-cols-[12rem_minmax(0,1fr)_15rem]">
      <nav aria-label="Reports to review">
        <p className="px-3 text-[0.75rem] text-muted">To review</p>
        <ul className="mt-2 flex flex-col gap-1">
          {items.map((item) => {
            const current = item.id === view.id;
            const done = current && status !== 'draft' ? status : null;
            return (
              <li key={item.id}>
                <Link
                  href={href(item.id)}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'block rounded-xl px-3 py-2.5 transition-colors',
                    current ? 'bg-grey-1' : 'hover:bg-grey-1/60',
                  )}
                >
                  <span
                    className={cn(
                      'block text-small font-medium',
                      done && 'text-muted',
                    )}
                  >
                    {item.clientName}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] text-muted">
                    {view.sent && current
                      ? 'Sent'
                      : done === 'approved'
                        ? '✓ Approved'
                        : done === 'skipped'
                          ? 'Skipped'
                          : listLabel(item.checks)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="rounded-2xl bg-grey-1 p-3 sm:p-4">
        <ReportPaper
          colour={view.sender.colour}
          logo={view.sender.logo}
          sender={view.sender.name}
          clientName={view.clientName}
          period={view.period}
          footer={`Sent by ${view.sender.name}.${view.replies ? ' Reply to this email to reach us.' : ''}`}
        >
          {view.glance.length > 0 && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {view.glance.map((item) => (
                <div key={item.label} className="rounded-lg bg-grey-1 p-2.5">
                  <dt className="text-[0.6875rem] text-muted">{item.label}</dt>
                  <dd className="text-base font-semibold">{item.value}</dd>
                  {item.note && (
                    <dd className="text-[0.6875rem] text-muted">{item.note}</dd>
                  )}
                </div>
              ))}
            </dl>
          )}

          {view.sections.length === 0 ? (
            <p className="mt-4 text-small text-muted">
              Nothing to report for this week.
            </p>
          ) : (
            <div className="mt-5 flex flex-col gap-5">
              {view.sections.map((section, index) => (
                <section key={`${section.kind}-${index}`}>
                  <h3 className="font-sans text-small font-semibold tracking-normal">
                    {section.title}
                  </h3>
                  <ul className="mt-1.5 flex flex-col gap-2">
                    {section.lines.map((line) => (
                      <li key={line.id}>
                        {line.question && (
                          <p className="text-small text-muted">
                            {line.question}
                          </p>
                        )}
                        {line.pending ? (
                          <p className="text-small text-muted italic">
                            Dossier is answering this.
                          </p>
                        ) : editing ? (
                          <textarea
                            aria-label={
                              line.question ?? `${section.title} line`
                            }
                            rows={2}
                            value={texts[line.id] ?? line.text}
                            onChange={(event) =>
                              setTexts({
                                ...texts,
                                [line.id]: event.target.value,
                              })
                            }
                            className="mt-0.5 w-full resize-y rounded-lg bg-grey-1 p-2 text-small outline-none focus-visible:ring-2 focus-visible:ring-lilac-deep"
                          />
                        ) : (
                          <p className="text-small">
                            {line.text}
                            {line.cites.length > 0 && (
                              <sup className="ml-1 font-mono text-[0.625rem] text-lilac-ink">
                                {line.cites.join(',')}
                              </sup>
                            )}
                            {line.edited && (
                              <span className="ml-1.5 text-[0.6875rem] text-muted">
                                edited
                              </span>
                            )}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {editing && (
            <p className="mt-4 text-[0.75rem] text-muted">
              Empty a line to take it out.
            </p>
          )}

          {view.exceptions.length > 0 && status === 'draft' && (
            <div className="mt-6 rounded-xl bg-lilac-soft p-3.5">
              <p className="flex items-center gap-2 text-[0.75rem] text-lilac-ink">
                <Mark height={11} />
                Drafted by Dossier · check before it goes
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 text-small">
                {view.exceptions.map((exception) => (
                  <li key={exception}>{exception}</li>
                ))}
              </ul>
            </div>
          )}
          {view.uncited > 0 && status === 'draft' && (
            <p className="mt-4 text-[0.75rem] text-muted">
              {view.uncited === 1
                ? '1 line cites nothing, so it’s left out when approved.'
                : `${view.uncited} lines cite nothing, so they’re left out when approved.`}
            </p>
          )}
        </ReportPaper>
      </div>

      <aside aria-label="Review" className="flex flex-col">
        <p className="text-[0.75rem] text-muted">Goes to</p>
        {view.to.length > 0 ? (
          <ul className="mt-1 text-small font-medium">
            {view.to.map((email) => (
              <li key={email} className="truncate">
                {email}
              </li>
            ))}
            {view.cc.map((email) => (
              <li key={email} className="truncate font-normal text-muted">
                cc {email}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-small text-muted">
            Nobody yet ·{' '}
            <Link
              href={`/clients/${encodeURIComponent(view.clientId)}/reports`}
              className="underline underline-offset-[3px]"
            >
              add someone
            </Link>
          </p>
        )}
        {/* With nobody to go to, the line above already says so. */}
        {(view.to.length > 0 || view.sent) && (
          <p className="mt-0.5 text-[0.75rem] text-muted">{view.goes}</p>
        )}
        {view.failed && (
          <p role="alert" className="mt-1 text-[0.75rem] text-attention">
            Last try didn’t go: {view.failed}
          </p>
        )}
        <EmailPreview reportId={view.id} clientName={view.clientName} />

        {view.cited.length > 0 && (
          <>
            <p className="mt-6 text-[0.75rem] text-muted">Cited files</p>
            {/* Three fit the column; the list below names every one. */}
            <CitedStack
              files={view.cited.slice(0, 3).reverse()}
              className="mt-1"
            />
            <ol className="mt-2 flex flex-col gap-1 text-[0.75rem]">
              {view.cited.map((file, index) => (
                <li key={file.id ?? index} className="flex gap-1.5">
                  <span className="font-mono text-lilac-ink">{index + 1}</span>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate underline decoration-ink/20 underline-offset-[3px] hover:decoration-ink"
                    title={`${file.title} · ${file.source}, ${file.date}`}
                  >
                    {file.title}
                  </a>
                </li>
              ))}
            </ol>
          </>
        )}

        <div className="mt-auto pt-8">
          {view.sent ? (
            <div
              role="status"
              className="rounded-xl bg-grey-1 p-3.5 text-small"
            >
              <p className="font-medium">Sent {view.sent}.</p>
              <p className="mt-1 text-[0.75rem] text-muted">
                It stays as it went out.
              </p>
            </div>
          ) : status !== 'draft' ? (
            <div
              role="status"
              className="rounded-xl bg-grey-1 p-3.5 text-small"
            >
              <p className="font-medium">
                {status === 'approved'
                  ? `Approved. ${view.status === 'approved' ? `${view.goes}.` : ''}`
                  : 'Skipped this week.'}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => decide('draft')}
                  className="rounded-sm underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink"
                >
                  Undo
                </button>
                {next && (
                  <Link
                    href={href(next.id)}
                    className="rounded-sm font-medium underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink"
                  >
                    Next: {next.clientName} →
                  </Link>
                )}
              </div>
            </div>
          ) : editing ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ink" disabled={saving} onClick={saveEdits}>
                <BusyIcon icon={Check} busy={saving} />
                Save
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                variant="act"
                size="lg"
                className="w-full"
                disabled={saving}
                onClick={() => decide('approved')}
              >
                Approve
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={startEditing}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => decide('skipped')}
                >
                  Skip
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 text-[0.75rem] text-attention">
              {error}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
