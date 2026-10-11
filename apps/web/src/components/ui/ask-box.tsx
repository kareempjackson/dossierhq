'use client';

import { ArrowUp } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { cn } from '@/lib/cn';

/** The anchor the sidebar's "Ask Dossier" link jumps to: `/#ask`. */
export const ASK_ANCHOR = 'ask';

/**
 * Brings the ask box to the top of whatever scrolls around it (the sheet on
 * desktop, the page on phones) and focuses the input without a second jump.
 * Returns false when the box isn't on this page.
 */
export function revealAskBox({ smooth = true } = {}): boolean {
  const section = document.getElementById(ASK_ANCHOR);
  if (!section) return false;
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  section.scrollIntoView({
    block: 'start',
    behavior: smooth && !reduceMotion ? 'smooth' : 'auto',
  });
  section.querySelector('input')?.focus({ preventScroll: true });
  return true;
}

type AskBoxProps = {
  placeholder?: string;
  className?: string;
};

/** The floating question box. Answers need the API, so for now it says so. */
export function AskBox({
  placeholder = 'Ask about a client, device or report',
  className,
}: AskBoxProps) {
  const inputId = useId();
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<string | null>(null);

  // Arriving at /#ask from another page, or the hash changing later.
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === `#${ASK_ANCHOR}`)
        revealAskBox({ smooth: false });
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setAsked(question.trim());
    setQuestion('');
  }

  const ready = question.trim().length > 0;

  return (
    // scroll-mt keeps the box clear of the sheet's top edge when jumped to.
    <div id={ASK_ANCHOR} className={cn('scroll-mt-6', className)}>
      <form
        onSubmit={submit}
        className="flex items-center gap-2 rounded-full bg-sheet py-1.5 pr-1.5 pl-5 shadow-float outline-offset-2 focus-within:outline-2 focus-within:outline-brand"
      >
        <label htmlFor={inputId} className="sr-only">
          Ask Dossier
        </label>
        <input
          id={inputId}
          name="question"
          autoComplete="off"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={placeholder}
          className="h-10 min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          aria-label="Ask"
          disabled={!ready}
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full transition-colors',
            ready
              ? 'bg-brand text-white hover:bg-brand-hover'
              : 'bg-surface text-muted',
          )}
        >
          <ArrowUp aria-hidden className="size-4" strokeWidth={2} />
        </button>
      </form>
      <p role="status" className="mt-2 min-h-4.5 px-5 text-meta text-muted">
        {asked &&
          `Answers will appear here once Dossier is connected. You asked: “${asked}”`}
      </p>
    </div>
  );
}
