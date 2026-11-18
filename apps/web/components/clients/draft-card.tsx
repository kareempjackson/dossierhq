'use client';

import { Copy, Sparkles } from 'lucide-react';
import { useEffect, useId, useState, useTransition } from 'react';
import {
  decideRecommendation,
  editExecutive,
  editRecommendation,
  rewriteExecutive,
  type ActionResult,
  type RecommendationChanges,
} from '@/app/(workspace)/clients/actions';
import { Mark } from '@/components/brand/logo';
import { Brief } from '@/components/ui/brief';
import { Button } from '@/components/ui/button';
import { BusyIcon } from '@/components/ui/spinner';
import { StyleSwitch } from '@/components/ui/style-switch';
import { andList, type Style } from '@/lib/client-paths';
import type { OverviewDraft } from '@/lib/client-views';
import { plural } from '@/lib/format';

type Decided = { id: string; title: string; status: 'accepted' | 'dismissed' };

type TechnicalForm = {
  kind: 'technical';
  title: string;
  reason: string;
  steps: string;
  risk: string;
  verification: string;
};
type ExecutiveForm = {
  kind: 'executive';
  headline: string;
  points: string;
  decision: string;
};

/** One a line; a bullet or number typed at the start goes. */
const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);

/** What the technical form changed, and nothing else. */
function changesOf(
  draft: OverviewDraft,
  form: TechnicalForm,
): RecommendationChanges {
  const changes: RecommendationChanges = {};
  const title = form.title.trim();
  if (title !== draft.title) changes.title = title;
  const reason = form.reason.trim();
  if (reason !== draft.reason) changes.reason = reason;
  const steps = lines(form.steps);
  if (steps.join('\n') !== draft.suggestedActions.join('\n')) {
    changes.suggestedActions = steps;
  }
  const risk = form.risk.trim() || null;
  if (risk !== draft.risk) changes.risk = risk;
  const verification = form.verification.trim() || null;
  if (verification !== draft.verification) changes.verification = verification;
  return changes;
}

/**
 * Dossier's newest draft recommendation, from the records it cites, in the
 * technical version for the engineer or the executive one for the client's
 * leadership. Accept, edit or dismiss it; the next draft takes its place,
 * and the decision can be undone from the line it leaves behind. In a
 * support view it only reads.
 */
export function DraftCard({
  draft,
  moreDrafts,
  initialStyle,
  readOnly,
}: {
  draft: OverviewDraft | null;
  /** Drafts waiting behind this one. */
  moreDrafts: number;
  /** The version the reader last picked, or their workspace's default. */
  initialStyle: Style;
  readOnly: boolean;
}) {
  const [decided, setDecided] = useState<Decided | null>(null);
  const [style, setStyle] = useState<Style>(initialStyle);
  const [form, setForm] = useState<TechnicalForm | ExecutiveForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [rewriting, startRewriting] = useTransition();
  const busy = pending || rewriting;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const run = (action: () => Promise<ActionResult>, then?: () => void) =>
    startTransition(async () => {
      setError(null);
      setNote(null);
      const result = await action();
      if (result.ok) then?.();
      else setError(result.error);
    });

  // Until the page reads again, the decided draft is still the one passed in.
  const shown = draft && draft.id !== decided?.id ? draft : null;

  const rewrite = (id: string) =>
    startRewriting(async () => {
      setError(null);
      setNote(null);
      const result = await rewriteExecutive(id);
      if (result.ok) setNote('Dossier wrote the executive version again.');
      else setError(result.error);
    });

  const edit = (current: OverviewDraft) =>
    setForm(
      style === 'executive'
        ? {
            kind: 'executive',
            headline: current.executive?.headline ?? current.title,
            points: current.executive?.points.join('\n') ?? '',
            decision: current.executive?.decision ?? '',
          }
        : {
            kind: 'technical',
            title: current.title,
            reason: current.reason,
            steps: current.suggestedActions.join('\n'),
            risk: current.risk ?? '',
            verification: current.verification ?? '',
          },
    );

  const save = (
    current: OverviewDraft,
    editing: TechnicalForm | ExecutiveForm,
  ) => {
    if (editing.kind === 'technical') {
      const changes = changesOf(current, editing);
      if (Object.keys(changes).length === 0) return setForm(null);
      run(
        () => editRecommendation(current.id, changes),
        () => {
          setForm(null);
          setNote(
            current.executive && !current.executiveStale
              ? 'Saved. The executive version still has the old wording; rewrite it from Executive.'
              : 'Saved.',
          );
        },
      );
      return;
    }
    const brief = {
      headline: editing.headline.trim(),
      points: lines(editing.points),
      decision: editing.decision.trim() || null,
    };
    const was = current.executive;
    if (
      was &&
      brief.headline === was.headline &&
      brief.points.join('\n') === was.points.join('\n') &&
      brief.decision === was.decision
    ) {
      return setForm(null);
    }
    run(
      () => editExecutive(current.id, brief),
      () => {
        setForm(null);
        setNote('Saved.');
      },
    );
  };

  return (
    <>
      {decided && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-lilac-soft px-5 py-4 text-small"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Mark height={12} className="shrink-0 text-lilac-ink" />
            <span className="min-w-0">
              {decided.status === 'accepted' ? 'Accepted' : 'Dismissed'} “
              {decided.title}”.
            </span>
          </span>
          {!readOnly && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  () => decideRecommendation(decided.id, 'draft'),
                  () => setDecided(null),
                )
              }
              className="rounded-sm font-medium underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink disabled:opacity-60"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {shown && (
        <div
          id="draft"
          aria-busy={busy || undefined}
          className="scroll-mt-6 rounded-2xl bg-linear-to-br from-lilac-mist to-lilac-soft p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-lilac-ink">
              <Mark height={12} />
              {shown.from.length > 0
                ? `Dossier drafted this, from ${andList(shown.from.map(String))}`
                : 'Dossier drafted this'}
              {moreDrafts > 0 && (
                <span className="text-muted">
                  · {plural(moreDrafts, 'more draft')} after it
                </span>
              )}
            </p>
            {form === null && (
              <StyleSwitch
                value={style}
                onChange={(next) => {
                  setStyle(next);
                  setError(null);
                  setNote(null);
                }}
              />
            )}
          </div>

          {form?.kind === 'technical' ? (
            <div className="mt-1">
              <Field
                label="Title"
                rows={2}
                max={200}
                value={form.title}
                onChange={(title) => setForm({ ...form, title })}
                autoFocus
                display
              />
              <Field
                label="Why"
                rows={2}
                max={1000}
                value={form.reason}
                onChange={(reason) => setForm({ ...form, reason })}
              />
              <Field
                label="Steps, one a line"
                rows={4}
                value={form.steps}
                onChange={(steps) => setForm({ ...form, steps })}
              />
              <Field
                label="If it goes wrong"
                rows={2}
                max={500}
                value={form.risk}
                onChange={(risk) => setForm({ ...form, risk })}
              />
              <Field
                label="To confirm it worked"
                rows={2}
                max={500}
                value={form.verification}
                onChange={(verification) => setForm({ ...form, verification })}
              />
            </div>
          ) : form?.kind === 'executive' ? (
            <div className="mt-1">
              <Field
                label="Headline"
                rows={2}
                max={200}
                value={form.headline}
                onChange={(headline) => setForm({ ...form, headline })}
                autoFocus
                display
              />
              <Field
                label="Points, one a line"
                rows={4}
                value={form.points}
                onChange={(points) => setForm({ ...form, points })}
              />
              <Field
                label="Decision needed"
                rows={2}
                max={300}
                value={form.decision}
                onChange={(decision) => setForm({ ...form, decision })}
              />
            </div>
          ) : style === 'executive' ? (
            shown.executive ? (
              <>
                {shown.executiveStale && (
                  <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-small">
                    The technical version changed since this was written.
                    {!readOnly && ' Rewrite it so they match.'}
                  </p>
                )}
                <Brief brief={shown.executive} />
              </>
            ) : (
              <p className="mt-2 text-small text-muted">
                There’s no executive version of this draft yet.
                {!readOnly &&
                  ' Dossier can write one from the technical version, in one small model run.'}
              </p>
            )
          ) : (
            <>
              <p className="mt-2 font-display text-h3">{shown.title}</p>
              <p className="mt-2 text-small text-muted">{shown.reason}</p>
              {shown.suggestedActions.length > 0 && (
                <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-small">
                  {shown.suggestedActions.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              )}
              {shown.risk && (
                <p className="mt-3 text-small">
                  <span className="font-medium">If it goes wrong: </span>
                  {shown.risk}
                </p>
              )}
              {shown.verification && (
                <p className="mt-2 text-small">
                  <span className="font-medium">To confirm it worked: </span>
                  {shown.verification}
                </p>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="mt-3 text-small text-attention">
              {error}
            </p>
          )}
          {note && (
            <p role="status" className="mt-3 text-small text-healthy">
              {note}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {form !== null ? (
              <>
                <Button
                  variant="ink"
                  size="sm"
                  disabled={
                    busy ||
                    !(form.kind === 'technical'
                      ? form.title.trim() && form.reason.trim()
                      : form.headline.trim())
                  }
                  onClick={() => save(shown, form)}
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setForm(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {!readOnly && (
                  <>
                    <Button
                      variant="ink"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => decideRecommendation(shown.id, 'accepted'),
                          () =>
                            setDecided({
                              id: shown.id,
                              title: shown.title,
                              status: 'accepted',
                            }),
                        )
                      }
                    >
                      Accept draft
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => edit(shown)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => decideRecommendation(shown.id, 'dismissed'),
                          () =>
                            setDecided({
                              id: shown.id,
                              title: shown.title,
                              status: 'dismissed',
                            }),
                        )
                      }
                    >
                      Dismiss
                    </Button>
                  </>
                )}
                {style === 'executive' &&
                  !readOnly &&
                  (!shown.executive || shown.executiveStale) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => rewrite(shown.id)}
                    >
                      <BusyIcon icon={Sparkles} busy={rewriting} />
                      {shown.executive ? 'Rewrite it' : 'Have Dossier write it'}
                    </Button>
                  )}
                {style === 'executive' && shown.executive && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          shown.executive?.text ?? '',
                        );
                        setCopied(true);
                      } catch {
                        // Clipboard blocked: nothing to show.
                      }
                    }}
                  >
                    <Copy aria-hidden className="size-4" strokeWidth={1.75} />
                    <span aria-live="polite">
                      {copied ? 'Copied' : 'Copy for email'}
                    </span>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** A labelled box in the draft's editor. */
function Field({
  label,
  value,
  onChange,
  rows,
  max,
  autoFocus = false,
  display = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  max?: number;
  autoFocus?: boolean;
  /** The headline: set in the display face, as the card shows it. */
  display?: boolean;
}) {
  const id = useId();
  // A label beside the box, not around it, so its name is the label alone.
  return (
    <div className="mt-3">
      <label htmlFor={id} className="text-[0.75rem] text-muted">
        {label}
      </label>
      <textarea
        id={id}
        autoFocus={autoFocus}
        rows={rows}
        maxLength={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={
          display
            ? 'mt-1 w-full resize-y rounded-xl bg-white/80 p-3 font-display text-h3 outline-none focus-visible:ring-2 focus-visible:ring-lilac-deep'
            : 'mt-1 w-full resize-y rounded-xl bg-white/80 p-3 text-small outline-none focus-visible:ring-2 focus-visible:ring-lilac-deep'
        }
      />
    </div>
  );
}
