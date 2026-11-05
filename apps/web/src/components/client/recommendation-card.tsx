'use client';

import type {
  Recommendation,
  RecommendationUpdate,
  Source,
  WritingStyle,
} from '@dossierhq/contracts';
import { Check, Sparkles } from 'lucide-react';
import {
  useId,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react';
import { rewriteExecutive, updateRecommendation } from '@/app/actions';
import { Button } from '@/components/ui/button';
import {
  CopyForClient,
  ExecutiveBriefView,
} from '@/components/ui/executive-brief';
import { SourceList } from '@/components/ui/source-list';
import { useWritingStyle } from '@/components/ui/style-switch';

/**
 * A drafted recommendation with the evidence behind it. Accepting or
 * dismissing saves through the API; the card then moves to "Decided this
 * week" when the page refreshes.
 */
export function RecommendationCard({
  recommendation,
  sources,
  timeZone,
  initialStyle,
}: {
  recommendation: Recommendation;
  sources: Source[];
  timeZone: string;
  /** The style the server read for this person. */
  initialStyle: WritingStyle;
}) {
  const { style } = useWritingStyle(initialStyle);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [writing, startWriting] = useTransition();
  const executive = recommendation.executive;

  function save(update: RecommendationUpdate, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await updateRecommendation(recommendation.id, update);
      if (!result.ok) setError(result.error);
      else after?.();
    });
  }

  function writeExecutive() {
    setError(null);
    startWriting(async () => {
      const result = await rewriteExecutive(recommendation.id);
      if (!result.ok) setError(result.error);
    });
  }

  const busy = pending || writing;
  const done = () => setEditing(false);

  return (
    <li className="rounded-card bg-sheet p-4 shadow-card">
      {editing ? (
        style === 'executive' ? (
          <ExecutiveForm
            recommendation={recommendation}
            pending={pending}
            onSave={(update) => save(update, done)}
            onCancel={done}
          />
        ) : (
          <TechnicalForm
            recommendation={recommendation}
            pending={pending}
            onSave={(update) => save(update, done)}
            onCancel={done}
          />
        )
      ) : style === 'executive' ? (
        <>
          <div className="flex items-start justify-between gap-3">
            {executive ? (
              <ExecutiveBriefView brief={executive} className="min-w-0" />
            ) : (
              <h3 className="font-medium">{recommendation.title}</h3>
            )}
            <DraftBadge />
          </div>
          {(!executive || recommendation.executiveStale) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile bg-surface-soft px-3 py-2">
              <p className="text-meta text-muted">
                {executive
                  ? 'Written before the technical version was edited.'
                  : 'No executive version yet.'}
              </p>
              <Button variant="ghost" disabled={busy} onClick={writeExecutive}>
                <Sparkles aria-hidden />
                {writing
                  ? 'Writing…'
                  : executive
                    ? 'Write it again'
                    : 'Write it'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-medium">{recommendation.title}</h3>
            <DraftBadge />
          </div>
          <p className="mt-1.5 text-meta text-text">{recommendation.reason}</p>
          {recommendation.suggestedActions.length > 0 && (
            <div className="mt-3">
              <p className="text-meta-sm font-medium text-muted">
                Suggested actions
              </p>
              <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-5 text-meta text-text marker:text-muted">
                {recommendation.suggestedActions.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
          )}
          {(recommendation.risk || recommendation.verification) && (
            <dl className="mt-3 flex flex-col gap-1 text-meta">
              {recommendation.risk && (
                <div>
                  <dt className="inline font-medium text-ink">Risk: </dt>
                  <dd className="inline text-text">{recommendation.risk}</dd>
                </div>
              )}
              {recommendation.verification && (
                <div>
                  <dt className="inline font-medium text-ink">
                    To confirm it worked:{' '}
                  </dt>
                  <dd className="inline text-text">
                    {recommendation.verification}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </>
      )}

      <div className="mt-4 rounded-tile bg-surface-soft p-3">
        <p className="text-meta-sm font-medium text-muted">
          Why Dossier suggests it
        </p>
        <SourceList sources={sources} timeZone={timeZone} className="mt-2" />
      </div>

      {!editing && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => save({ status: 'accepted' })}>
            <Check aria-hidden />
            Accept
          </Button>
          <Button
            variant="ghost"
            disabled={busy || (style === 'executive' && !executive)}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => save({ status: 'dismissed' })}
          >
            Dismiss
          </Button>
          {pending && (
            <span role="status" className="text-meta text-muted">
              Saving…
            </span>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-meta text-alert">
          {error}
        </p>
      )}
    </li>
  );
}

function DraftBadge() {
  return (
    <span className="shrink-0 rounded-full bg-surface px-2.5 py-px text-meta-sm text-muted">
      Draft
    </span>
  );
}

const lines = (value: FormDataEntryValue | null) =>
  String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

type FormProps = {
  recommendation: Recommendation;
  pending: boolean;
  onSave: (update: RecommendationUpdate) => void;
  onCancel: () => void;
};

/** The technical version: what the engineer reads and does. */
function TechnicalForm({
  recommendation,
  pending,
  onSave,
  onCancel,
}: FormProps) {
  const ids = {
    title: useId(),
    reason: useId(),
    actions: useId(),
    risk: useId(),
    verification: useId(),
  };
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({
      title: String(data.get('title') ?? ''),
      reason: String(data.get('reason') ?? ''),
      suggestedActions: lines(data.get('actions')),
      risk: String(data.get('risk') ?? ''),
      verification: String(data.get('verification') ?? ''),
    });
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <FieldLabel htmlFor={ids.title}>Recommendation</FieldLabel>
      <input
        id={ids.title}
        name="title"
        defaultValue={recommendation.title}
        required
        maxLength={200}
        className={INPUT}
      />
      <FieldLabel htmlFor={ids.reason}>Why</FieldLabel>
      <textarea
        id={ids.reason}
        name="reason"
        defaultValue={recommendation.reason}
        required
        maxLength={1000}
        rows={3}
        className={TEXTAREA}
      />
      <FieldLabel htmlFor={ids.actions} hint="one per line">
        Suggested actions
      </FieldLabel>
      <textarea
        id={ids.actions}
        name="actions"
        defaultValue={recommendation.suggestedActions.join('\n')}
        maxLength={3000}
        rows={4}
        className={TEXTAREA}
      />
      <FieldLabel htmlFor={ids.risk}>Risk</FieldLabel>
      <input
        id={ids.risk}
        name="risk"
        defaultValue={recommendation.risk ?? ''}
        maxLength={500}
        className={INPUT}
      />
      <FieldLabel htmlFor={ids.verification}>To confirm it worked</FieldLabel>
      <input
        id={ids.verification}
        name="verification"
        defaultValue={recommendation.verification ?? ''}
        maxLength={500}
        className={INPUT}
      />
      <FormButtons pending={pending} onCancel={onCancel} />
    </form>
  );
}

/** The executive version: what the client's leadership reads. */
function ExecutiveForm({
  recommendation,
  pending,
  onSave,
  onCancel,
}: FormProps) {
  const ids = { headline: useId(), points: useId(), decision: useId() };
  const brief = recommendation.executive;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({
      executive: {
        headline: String(data.get('headline') ?? ''),
        points: lines(data.get('points')),
        decision: String(data.get('decision') ?? ''),
      },
    });
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-meta text-muted">
        For the client’s leadership. Keep internal notes out of it.
      </p>
      <FieldLabel htmlFor={ids.headline}>Headline</FieldLabel>
      <input
        id={ids.headline}
        name="headline"
        defaultValue={brief?.headline ?? ''}
        required
        maxLength={200}
        className={INPUT}
      />
      <FieldLabel htmlFor={ids.points} hint="one per line">
        What it means for them
      </FieldLabel>
      <textarea
        id={ids.points}
        name="points"
        defaultValue={brief?.points.join('\n') ?? ''}
        maxLength={2400}
        rows={4}
        className={TEXTAREA}
      />
      <FieldLabel htmlFor={ids.decision}>Decision needed</FieldLabel>
      <input
        id={ids.decision}
        name="decision"
        defaultValue={brief?.decision ?? ''}
        maxLength={300}
        className={INPUT}
      />
      <FormButtons pending={pending} onCancel={onCancel} />
    </form>
  );
}

const INPUT = '-mt-1.5 h-10 rounded-input bg-surface px-3 text-body text-ink';
const TEXTAREA =
  '-mt-1.5 resize-y rounded-input bg-surface px-3 py-2 text-body text-ink';

function FieldLabel({
  htmlFor,
  hint,
  children,
}: {
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-meta font-medium text-ink">
      {children}
      {hint && <span className="font-normal text-muted"> ({hint})</span>}
    </label>
  );
}

function FormButtons({
  pending,
  onCancel,
}: {
  pending: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
      <Button variant="ghost" disabled={pending} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/** One accepted or dismissed recommendation, with Undo back to draft. */
export function DecidedRecommendation({
  recommendation,
  decidedLabel,
  initialStyle,
}: {
  recommendation: Recommendation;
  /** e.g. "Accepted 9 Oct" */
  decidedLabel: string;
  initialStyle: WritingStyle;
}) {
  const { style } = useWritingStyle(initialStyle);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const executive = recommendation.executive;
  const shown =
    style === 'executive' && executive
      ? executive.headline
      : recommendation.title;

  function undo() {
    setError(null);
    startTransition(async () => {
      const result = await updateRecommendation(recommendation.id, {
        status: 'draft',
      });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-meta text-ink">{shown}</p>
        <p className="text-meta-sm text-muted">{decidedLabel}</p>
        {error && (
          <p role="alert" className="text-meta-sm text-alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {/* Reviewed and accepted: its executive version may go to the client. */}
        {recommendation.status === 'accepted' &&
          executive &&
          !recommendation.executiveStale && <CopyForClient brief={executive} />}
        <Button
          variant="ghost"
          disabled={pending}
          onClick={undo}
          aria-label={`Undo: ${shown}`}
        >
          {pending ? 'Undoing…' : 'Undo'}
        </Button>
      </div>
    </li>
  );
}
