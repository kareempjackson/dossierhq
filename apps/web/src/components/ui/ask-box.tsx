'use client';

import { QUESTION_MAX_LENGTH } from '@dossierhq/contracts';
import { ArrowUp } from 'lucide-react';
import { useActionState, useEffect, useId, useState } from 'react';
import { askDossier, type AskState } from '@/app/ask-actions';
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
  /** Why questions can't be asked now, e.g. Ask is off; disables the box. */
  unavailable?: string | null;
  className?: string;
};

/**
 * The floating question box. Asking goes to the answer's page, which fills
 * in while Dossier reads; a question it won't take stays here, with why.
 */
export function AskBox({
  placeholder = 'Ask about a client, device or report',
  unavailable = null,
  className,
}: AskBoxProps) {
  const inputId = useId();
  const [question, setQuestion] = useState('');
  const [state, ask, asking] = useActionState<AskState, FormData>(
    askDossier,
    {},
  );

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

  const ready = question.trim().length > 0 && !asking && !unavailable;

  return (
    // scroll-mt keeps the box clear of the sheet's top edge when jumped to.
    <div id={ASK_ANCHOR} className={cn('scroll-mt-6', className)}>
      <form
        action={ask}
        className={cn(
          'flex items-center gap-2 rounded-full bg-sheet py-1.5 pr-1.5 pl-5 shadow-float outline-offset-2 focus-within:outline-2 focus-within:outline-brand',
          unavailable && 'opacity-70',
        )}
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
          maxLength={QUESTION_MAX_LENGTH}
          disabled={Boolean(unavailable)}
          placeholder={placeholder}
          className="h-10 min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
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
      <p
        role="status"
        className={cn(
          'mt-2 min-h-4.5 px-5 text-meta',
          state.error && !asking ? 'text-alert' : 'text-muted',
        )}
      >
        {asking
          ? 'Asking…'
          : (state.error ??
            unavailable ??
            'Dossier answers from every client’s records, and shows what each answer rests on.')}
      </p>
    </div>
  );
}
