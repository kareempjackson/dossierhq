'use client';

import { MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import type { MouseEvent } from 'react';
import { ASK_ANCHOR, revealAskBox } from '@/components/ui/ask-box';

/**
 * Goes to the ask box on Home. From another page it navigates to /#ask and
 * the box reveals itself on arrival; on Home it scrolls there in place.
 */
export function AskDossierLink() {
  function revealInPlace(event: MouseEvent<HTMLAnchorElement>) {
    if (window.location.pathname === '/' && revealAskBox()) {
      event.preventDefault();
    }
  }

  return (
    <Link
      href={`/#${ASK_ANCHOR}`}
      onClick={revealInPlace}
      className="flex h-9 items-center justify-center gap-2 rounded-full bg-ink px-4 text-body font-medium text-white transition-colors hover:bg-brand-deep"
    >
      <MessageSquareText aria-hidden className="size-4" strokeWidth={1.75} />
      Ask Dossier
    </Link>
  );
}
