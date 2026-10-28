'use client';

import type { ReportQuestion } from '@dossierhq/contracts';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { deleteReportQuestion, saveReportQuestion } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState } from '@/components/ui/states';

type ClientOption = { id: string; name: string };

const EXAMPLES = [
  'Is anyone still on Windows 10?',
  'Which helpdesk requests took longest to close, and why?',
  'Did any backups fail this week?',
  'What did the client ask us for in meetings, and is it done?',
];

const fieldClass =
  'w-full rounded-input bg-surface px-3 text-body text-ink placeholder:text-muted';

/**
 * The saved questions, grouped by who they're for, with a form to add one.
 * Questions for every client go in every report; the rest in one client's.
 */
export function ReportQuestions({
  questions,
  clients,
}: {
  questions: ReportQuestion[];
  clients: ClientOption[];
}) {
  const everyone = questions.filter((q) => q.clientId === null);
  const byClient = clients
    .map((client) => ({
      client,
      questions: questions.filter((q) => q.clientId === client.id),
    }))
    .filter((group) => group.questions.length > 0);

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="new-question-heading">
        <SectionHeader id="new-question-heading" title="Add a question" />
        <div className="mt-3 rounded-card bg-sheet p-4 shadow-card">
          <QuestionForm clients={clients} examples />
        </div>
      </section>

      {questions.length === 0 ? (
        <EmptyState title="No questions yet.">
          Reports answer the questions you save here, each from the client’s own
          records.
        </EmptyState>
      ) : (
        <>
          {everyone.length > 0 && (
            <QuestionGroup
              id="questions-everyone"
              title="Every client"
              note="In every client’s report"
              questions={everyone}
              clients={clients}
            />
          )}
          {byClient.map(({ client, questions: own }) => (
            <QuestionGroup
              key={client.id}
              id={`questions-${client.id}`}
              title={client.name}
              note="Only in this client’s report"
              questions={own}
              clients={clients}
            />
          ))}
        </>
      )}
    </div>
  );
}

function QuestionGroup({
  id,
  title,
  note,
  questions,
  clients,
}: {
  id: string;
  title: string;
  note: string;
  questions: ReportQuestion[];
  clients: ClientOption[];
}) {
  return (
    <section aria-labelledby={id}>
      <SectionHeader
        id={id}
        title={title}
        count={questions.length}
        note={note}
      />
      <ListCard className="mt-3">
        {questions.map((question) => (
          <QuestionRow
            key={question.id}
            question={question}
            clients={clients}
          />
        ))}
      </ListCard>
    </section>
  );
}

function QuestionRow({
  question,
  clients,
}: {
  question: ReportQuestion;
  clients: ClientOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteReportQuestion(question.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="px-4 py-3">
      {editing ? (
        <QuestionForm
          clients={clients}
          question={question}
          onDone={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 basis-64 text-body text-ink">
            {question.text}
          </p>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button variant="ghost" disabled={pending} onClick={remove}>
              {pending ? 'Removing…' : 'Remove'}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-meta text-alert">
          {error}
        </p>
      )}
    </li>
  );
}

/** Adds a question, or with `question`, edits it. */
function QuestionForm({
  clients,
  question,
  examples = false,
  onDone,
}: {
  clients: ClientOption[];
  question?: ReportQuestion;
  /** Offer example questions to start from. */
  examples?: boolean;
  onDone?: () => void;
}) {
  const ids = { text: useId(), client: useId() };
  const [text, setText] = useState(question?.text ?? '');
  const [clientId, setClientId] = useState(question?.clientId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveReportQuestion(question?.id ?? null, {
        text,
        clientId: clientId || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (question) {
        onDone?.();
      } else {
        setText('');
        setSaved(true);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor={ids.text} className="text-meta font-medium text-ink">
        Question
      </label>
      <textarea
        id={ids.text}
        value={text}
        onChange={(event) => setText(event.target.value)}
        required
        maxLength={500}
        rows={2}
        placeholder="What do you want each report to answer?"
        className={`${fieldClass} -mt-1.5 resize-y py-2`}
      />
      {examples && !text && (
        <div className="-mt-1 flex flex-wrap gap-1.5">
          <span className="text-meta-sm text-muted">Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setText(example)}
              className="rounded-full bg-surface px-2.5 py-0.5 text-meta-sm text-text transition-colors hover:bg-surface-soft hover:text-ink"
            >
              {example}
            </button>
          ))}
        </div>
      )}
      <label htmlFor={ids.client} className="text-meta font-medium text-ink">
        Ask in
      </label>
      <select
        id={ids.client}
        value={clientId}
        onChange={(event) => setClientId(event.target.value)}
        className={`${fieldClass} -mt-1.5 h-10`}
      >
        <option value="">Every client’s report</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}’s report only
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant={question ? 'secondary' : 'primary'}
          disabled={pending}
        >
          {pending ? 'Saving…' : question ? 'Save' : 'Add question'}
        </Button>
        {onDone && (
          <Button variant="ghost" disabled={pending} onClick={onDone}>
            Cancel
          </Button>
        )}
        {saved && (
          <span role="status" className="text-meta text-muted">
            Saved. The next report you draft answers it.
          </span>
        )}
        {error && (
          <span role="alert" className="text-meta text-alert">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
