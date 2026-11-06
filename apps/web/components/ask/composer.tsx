'use client';

import { useSearchParams } from 'next/navigation';
import { useActionState, useId, useRef, useState } from 'react';
import { ask, type AskState } from '@/app/(workspace)/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

type ComposerProps = {
  placeholder: string;
  suggestions?: string[];
  suggestionsInside?: boolean;
  glow?: boolean;
};

/**
 * Where a question is typed. Suggestions fill it in; Enter asks, Shift+Enter
 * starts a new line. `glow` is the answer page's lilac-to-lime edge; the
 * history page's is grey. Either turns lilac while you type.
 */
export function Composer({
  placeholder,
  suggestions = [],
  suggestionsInside = false,
  glow = false,
  initialQuestion = '',
}: ComposerProps & { initialQuestion?: string }) {
  const [state, action, pending] = useActionState<AskState, FormData>(ask, {});
  const [question, setQuestion] = useState(initialQuestion);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  const chips = suggestions.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => {
            setQuestion(suggestion);
            textarea.current?.focus();
          }}
          className="rounded-full bg-grey-2 px-3 py-1 text-small text-muted transition-colors hover:bg-grey-3 hover:text-ink"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      {!suggestionsInside && chips && <div className="mb-3">{chips}</div>}
      <form
        action={action}
        onSubmit={(event) => {
          if (!question.trim()) {
            event.preventDefault();
            textarea.current?.focus();
          }
        }}
        className={cn(
          'rounded-[1.25rem] p-[3px] transition-colors',
          glow
            ? 'bg-linear-to-r from-lilac-soft to-lime-soft focus-within:from-lilac-deep focus-within:to-lilac-deep'
            : 'bg-grey-2 focus-within:bg-lilac-deep',
        )}
      >
        <div className="rounded-2xl bg-white p-4">
          <label htmlFor={`${id}-question`} className="sr-only">
            Your question
          </label>
          <textarea
            ref={textarea}
            id={`${id}-question`}
            name="question"
            rows={2}
            autoFocus={Boolean(initialQuestion)}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={placeholder}
            className="w-full resize-none bg-transparent text-body outline-none placeholder:text-muted"
          />
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            {suggestionsInside ? chips || <span /> : <span />}
            <Button type="submit" variant="act" disabled={pending}>
              {pending ? 'Asking…' : 'Ask'}
            </Button>
          </div>
        </div>
      </form>
      {state.error && (
        <p role="alert" className="mt-2 text-small text-attention">
          {state.error}
        </p>
      )}
    </div>
  );
}

/**
 * The composer, started from `?q=` (as the command palette sends it). Put it
 * in Suspense: the URL is only known in the browser.
 */
export function ComposerFromUrl(props: ComposerProps) {
  const question = useSearchParams().get('q') ?? '';
  return <Composer key={question} {...props} initialQuestion={question} />;
}
