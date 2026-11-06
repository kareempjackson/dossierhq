'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Mark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { CitedStack } from '@/components/ui/cited-stack';
import { cn } from '@/lib/cn';
import type { Recipient, ReportDraft } from '@/lib/workspace';
import { ReportPaper } from './report-paper';
import { useReports } from './reports-shell';

const listLabel = (checks: number) =>
  checks === 0
    ? 'Ready'
    : checks === 1
      ? '1 needs a look'
      : `${checks} need a look`;

/**
 * Reviewing one client's draft: this week's drafts on the left, the report
 * as the client will read it in the middle, and who it goes to, what it
 * cites and the decision on the right.
 */
export function ReportReview({
  draft,
  clientName,
  recipients,
  period,
  sends,
  sender,
}: {
  draft: ReportDraft;
  clientName: string;
  recipients: Recipient[];
  period: string | null;
  sends: string | null;
  sender: { name: string; replyTo: string; colour: string };
}) {
  const { drafts, decisions, decide } = useReports();
  const [editing, setEditing] = useState(false);
  const [answers, setAnswers] = useState(
    draft.answers.map((answer) => answer.answer),
  );
  const [edited, setEdited] = useState(answers);
  const decision = decisions[draft.id];
  const checks = draft.answers
    .map((answer, index) => ({ line: index + 1, reason: answer.check }))
    .filter((check): check is { line: number; reason: string } =>
      Boolean(check.reason),
    );
  const next = drafts.find(
    (item) => item.id !== draft.id && !decisions[item.id],
  );

  return (
    <div className="grid flex-1 gap-5 lg:grid-cols-[12rem_minmax(0,1fr)_15rem]">
      <nav aria-label="This week’s reports">
        <p className="px-3 text-[0.75rem] text-muted">This week</p>
        <ul className="mt-2 flex flex-col gap-1">
          {drafts.map((item) => {
            const current = item.id === draft.id;
            const done = decisions[item.id];
            return (
              <li key={item.id}>
                <Link
                  href={`/reports/${item.id}`}
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
                    {done === 'approved'
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
          colour={sender.colour}
          clientName={clientName}
          period={period}
          footer={`Sent by ${sender.name} · replies go to ${sender.replyTo}`}
        >
          <ol className="flex flex-col gap-4">
            {draft.answers.map((answer, index) => (
              <li key={answer.question}>
                <p className="text-small text-muted">{answer.question}</p>
                {editing ? (
                  <textarea
                    aria-label={`Answer to: ${answer.question}`}
                    rows={2}
                    value={edited[index]}
                    onChange={(event) =>
                      setEdited(
                        edited.map((text, i) =>
                          i === index ? event.target.value : text,
                        ),
                      )
                    }
                    className="mt-1 w-full resize-y rounded-lg bg-grey-1 p-2 text-small outline-none focus-visible:ring-2 focus-visible:ring-lilac-deep"
                  />
                ) : (
                  <p className="mt-1 text-small">
                    {answers[index]}
                    <sup className="ml-1 font-mono text-[0.625rem] text-lilac-ink">
                      {answer.cite}
                    </sup>
                  </p>
                )}
              </li>
            ))}
          </ol>
          {checks.length > 0 && (
            <div className="mt-6 rounded-xl bg-lilac-soft p-3.5">
              <p className="flex items-center gap-2 text-[0.75rem] text-lilac-ink">
                <Mark height={11} />
                Drafted by Dossier · check{' '}
                {checks.length === 1 ? 'line' : 'lines'}{' '}
                {checks.map((check) => check.line).join(' and ')}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 text-small">
                {checks.map((check) => (
                  <li key={check.line}>{check.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </ReportPaper>
      </div>

      <aside aria-label="Review" className="flex flex-col">
        <p className="text-[0.75rem] text-muted">Goes to</p>
        {recipients.length > 0 ? (
          <ul className="mt-1 text-small font-medium">
            {recipients.map((recipient) => (
              <li key={recipient.email} className="truncate">
                {recipient.email}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-small text-muted">Nobody yet</p>
        )}
        <p className="mt-0.5 text-[0.75rem] text-muted">
          Sends Monday at 09:00
        </p>

        <p className="mt-6 text-[0.75rem] text-muted">Cited files</p>
        <CitedStack files={draft.cited} className="mt-1" />

        <div className="mt-auto pt-8">
          {decision ? (
            <div
              role="status"
              className="rounded-xl bg-grey-1 p-3.5 text-small"
            >
              <p className="font-medium">
                {decision === 'approved'
                  ? `Approved.${sends ? ` Goes ${sends}.` : ''}`
                  : 'Skipped this week.'}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <button
                  type="button"
                  onClick={() => decide(draft.id, null)}
                  className="rounded-sm underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink"
                >
                  Undo
                </button>
                {next && (
                  <Link
                    href={`/reports/${next.id}`}
                    className="rounded-sm font-medium underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink"
                  >
                    Next: {next.clientName} →
                  </Link>
                )}
              </div>
            </div>
          ) : editing ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="ink"
                onClick={() => {
                  setAnswers(edited);
                  setEditing(false);
                }}
              >
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEdited(answers);
                  setEditing(false);
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
                onClick={() => decide(draft.id, 'approved')}
              >
                Approve
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => decide(draft.id, 'skipped')}
                >
                  Skip
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
