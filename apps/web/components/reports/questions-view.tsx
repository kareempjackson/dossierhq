'use client';

import { Plus } from 'lucide-react';
import { useId, useOptimistic, useState, useTransition } from 'react';
import {
  addQuestion,
  removeQuestion,
  rewordQuestion,
} from '@/app/(workspace)/reports/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BusyIcon } from '@/components/ui/spinner';

export type Question = { id: string; text: string; clientId: string | null };

type Change =
  | { kind: 'add'; question: Question }
  | { kind: 'reword'; id: string; text: string }
  | { kind: 'remove'; id: string };

const SUGGESTIONS = [
  'Is anyone still on Windows 10?',
  'Which requests took longest to close?',
  'What did the client ask for?',
  'What renews in the next 90 days?',
];

/**
 * The questions every weekly report answers, for every client or just one.
 * Each change is saved at once and shows before the API answers; the next
 * drafts answer them.
 */
export function QuestionsView({
  questions: saved,
  clients,
}: {
  questions: Question[];
  clients: { id: string; name: string }[];
}) {
  const [questions, change] = useOptimistic(saved, (current, next: Change) =>
    next.kind === 'add'
      ? [...current, next.question]
      : next.kind === 'reword'
        ? current.map((each) =>
            each.id === next.id ? { ...each, text: next.text } : each,
          )
        : current.filter((each) => each.id !== next.id),
  );
  const [text, setText] = useState('');
  const [scope, setScope] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [adding, startAdding] = useTransition();
  const [, startChanging] = useTransition();
  const id = useId();
  const names = new Map(clients.map((client) => [client.id, client.name]));
  const asked = new Set(
    questions.map((question) => question.text.toLowerCase()),
  );
  const suggestions = SUGGESTIONS.filter(
    (suggestion) => !asked.has(suggestion.toLowerCase()),
  ).slice(0, 3);

  const add = () => {
    const question = text.trim();
    if (!question) return setError('Type a question first.');
    if (asked.has(question.toLowerCase()))
      return setError('Reports already answer that one.');
    startAdding(async () => {
      setError(null);
      change({
        kind: 'add',
        question: {
          id: `new-${question}`,
          text: question,
          clientId: scope || null,
        },
      });
      const result = await addQuestion(question, scope || null);
      if (result.ok) setText('');
      else setError(result.error);
    });
  };

  const reword = (question: Question) => {
    const next = editText.trim();
    if (!next) return;
    setEditingId(null);
    if (next === question.text) return;
    startChanging(async () => {
      setError(null);
      change({ kind: 'reword', id: question.id, text: next });
      const result = await rewordQuestion(question.id, next);
      if (!result.ok) setError(result.error);
    });
  };

  const remove = (question: Question) =>
    startChanging(async () => {
      setError(null);
      change({ kind: 'remove', id: question.id });
      const result = await removeQuestion(question.id);
      if (!result.ok) setError(result.error);
    });

  return (
    <div className="max-w-3xl">
      <h2 className="text-h2">Report questions</h2>
      <p className="mt-2 max-w-xl text-small text-muted">
        Each report answers these from the client’s own records, and cites them.
        When the records don’t say, the report says so rather than guess. New
        questions are answered from the next drafts.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
        className="mt-6 rounded-2xl bg-grey-1 p-4"
      >
        <label htmlFor={`${id}-question`} className="text-small font-medium">
          Add a question
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            id={`${id}-question`}
            value={text}
            maxLength={500}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            placeholder="Did anything need a restart this week?"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="min-w-56 flex-1 bg-white"
          />
          <div className="w-44">
            <label htmlFor={`${id}-scope`} className="sr-only">
              Which clients
            </label>
            <Select
              id={`${id}-scope`}
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className="bg-white"
            >
              <option value="">Every client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="submit"
            variant="act"
            className="h-11"
            disabled={adding}
          >
            <BusyIcon icon={Plus} busy={adding} />
            Add
          </Button>
        </div>
        {error && (
          <p
            id={`${id}-error`}
            role="alert"
            className="mt-2 text-[0.75rem] text-attention"
          >
            {error}
          </p>
        )}
        {suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[0.75rem] text-muted">Try:</span>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setText(suggestion);
                  setError(null);
                }}
                className="rounded-full bg-grey-2 px-3 py-1 text-[0.75rem] text-muted transition-colors hover:bg-grey-3 hover:text-ink"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </form>

      <p className="mt-8 text-[0.75rem] text-muted">
        Saved · {questions.length}
      </p>
      {questions.length === 0 && (
        <p className="mt-2 rounded-xl bg-grey-1 px-4 py-6 text-small text-muted">
          No questions yet. Add one above, or start from a suggestion; every
          weekly report answers each one.
        </p>
      )}
      <ol className="mt-2 flex flex-col gap-2 empty:hidden">
        {questions.map((question, index) => (
          <li
            key={question.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-grey-1 px-4 py-3"
          >
            <span className="w-4 font-mono text-label tracking-normal text-muted">
              {index + 1}
            </span>
            {editingId === question.id ? (
              <form
                className="flex min-w-56 flex-1 gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  reword(question);
                }}
              >
                <Input
                  autoFocus
                  aria-label={`Question ${index + 1}`}
                  value={editText}
                  maxLength={500}
                  onChange={(event) => setEditText(event.target.value)}
                  className="h-9 flex-1 bg-white"
                />
                <Button
                  type="submit"
                  variant="ink"
                  size="sm"
                  className="self-center"
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-center"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <p className="min-w-56 flex-1 text-small font-medium">
                  {question.text}
                </p>
                <span className="text-[0.75rem] text-muted">
                  {question.clientId
                    ? (names.get(question.clientId) ?? 'One client')
                    : 'Every client'}
                </span>
                <button
                  type="button"
                  // Until it's saved there's nothing to change.
                  disabled={question.id.startsWith('new-')}
                  onClick={() => {
                    setEditingId(question.id);
                    setEditText(question.text);
                  }}
                  aria-label={`Edit “${question.text}”`}
                  className="rounded-sm text-[0.75rem] font-medium"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={question.id.startsWith('new-')}
                  onClick={() => remove(question)}
                  aria-label={`Remove “${question.text}”`}
                  className="rounded-sm text-[0.75rem] text-muted transition-colors hover:text-ink"
                >
                  Remove
                </button>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
