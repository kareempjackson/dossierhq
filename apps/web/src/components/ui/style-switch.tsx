'use client';

import {
  DEFAULT_WRITING_STYLE,
  STYLE_NAMES,
  WRITING_STYLE_COOKIE,
  type WritingStyle,
} from '@dossierhq/contracts';
import { createContext, use, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Executive first: it's the one people switch to. */
const ORDER: WritingStyle[] = ['executive', 'technical'];
const YEAR_SECONDS = 365 * 24 * 60 * 60;

const StyleContext = createContext<{
  chosen: WritingStyle | null;
  choose: (style: WritingStyle) => void;
}>({ chosen: null, choose: () => {} });

/**
 * Which version of Dossier's drafts this person picked on this page. Every
 * switch shares it, and a cookie keeps it, so the next page the server
 * renders starts in it. Until they pick, each section shows the style the
 * server read for them (`initial`).
 */
export function StyleProvider({ children }: { children: ReactNode }) {
  const [chosen, setChosen] = useState<WritingStyle | null>(null);
  const choose = (next: WritingStyle) => {
    setChosen(next);
    document.cookie = `${WRITING_STYLE_COOKIE}=${next}; path=/; max-age=${YEAR_SECONDS}; samesite=lax`;
  };
  return <StyleContext value={{ chosen, choose }}>{children}</StyleContext>;
}

/** The style to show: the one picked here, else what the server read. */
export function useWritingStyle(initial: WritingStyle = DEFAULT_WRITING_STYLE) {
  const { chosen, choose } = use(StyleContext);
  return { style: chosen ?? initial, choose };
}

/**
 * Executive | Technical, beside what Dossier drafted. Both versions are
 * already on the page, so it switches on the click.
 */
export function StyleSwitch({
  initial,
  className,
}: {
  initial: WritingStyle;
  className?: string;
}) {
  const { style, choose } = useWritingStyle(initial);
  return (
    <div
      role="group"
      aria-label="Written for"
      className={cn('inline-flex rounded-full bg-surface p-1', className)}
    >
      {ORDER.map((option) => {
        const active = option === style;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => choose(option)}
            className={cn(
              'flex h-7 items-center rounded-full px-3 text-meta transition-colors',
              active
                ? 'bg-sheet text-ink shadow-card'
                : 'text-muted hover:text-ink',
            )}
          >
            {STYLE_NAMES[option]}
          </button>
        );
      })}
    </div>
  );
}

/** One of two renderings, by the version this person reads. */
export function Styled({
  initial,
  technical,
  executive,
}: {
  initial: WritingStyle;
  technical: ReactNode;
  executive: ReactNode;
}) {
  const { style } = useWritingStyle(initial);
  return <>{style === 'executive' ? executive : technical}</>;
}
