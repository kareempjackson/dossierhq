import Image, { type StaticImageData } from 'next/image';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { AuthPanel, AuthPanelTitle } from './auth-shell';

/**
 * A statement at the top of the panel and an illustration below it. The
 * artwork has wide transparent margins, so it's sized near the panel's width
 * and placed by the page: pass its position, width and any translate.
 * Size it by the smaller of a share of the panel's width and of the
 * screen's height, so it grows on wide screens and never reaches the text
 * on short ones, e.g. `w-[min(92%,78vh)]`.
 */
export function IllustratedPanel({
  tone,
  title,
  body,
  illustration,
  illustrationClassName,
}: {
  tone: 'lime' | 'lilac' | 'stone';
  title: ReactNode;
  body: ReactNode;
  illustration: StaticImageData;
  illustrationClassName: string;
}) {
  return (
    <AuthPanel tone={tone}>
      <div className="relative z-10 px-8 pt-12 xl:px-14 xl:pt-16">
        <AuthPanelTitle>{title}</AuthPanelTitle>
        <p
          className={cn(
            'mt-8 max-w-sm',
            tone === 'stone' ? 'text-paper/70' : 'text-muted',
          )}
        >
          {body}
        </p>
      </div>
      <Image
        src={illustration}
        alt=""
        sizes="(min-width: 1280px) 40rem, 48vw"
        loading="eager"
        className={cn(
          'pointer-events-none absolute h-auto',
          illustrationClassName,
        )}
      />
    </AuthPanel>
  );
}
