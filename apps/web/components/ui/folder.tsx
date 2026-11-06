import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A client folder. The tab's colour is what the file needs: lime to act,
 * lilac when Dossier drafted something, stone when all is calm. The coloured
 * back shows 3px above the grey body, like a folder seen from the front.
 * Give the tab a label (`tab="Step 1"`) and it grows to fit it. Pass
 * `padded={false}` to lay out the body edge to edge.
 */
export type FolderTone = 'act' | 'drafted' | 'calm';

const tones: Record<FolderTone, string> = {
  act: 'bg-lime',
  drafted: 'bg-lilac',
  calm: 'bg-stone',
};

export function Folder({
  tone = 'calm',
  tab,
  padded = true,
  className,
  bodyClassName,
  children,
}: {
  tone?: FolderTone;
  tab?: ReactNode;
  padded?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const labelled = tab !== undefined;
  return (
    <div
      className={cn('relative', labelled ? 'pt-6' : 'pt-[1.125rem]', className)}
    >
      <span
        aria-hidden={labelled ? undefined : true}
        className={cn(
          'absolute top-0 left-0 rounded-t-lg',
          labelled
            ? 'flex h-8 min-w-[4.5rem] px-3 pt-1 text-small text-ink'
            : 'h-6 w-[4.5rem]',
          tones[tone],
        )}
      >
        {tab}
      </span>
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-0 bottom-0 rounded-xl rounded-tl-none',
          labelled ? 'top-6' : 'top-[1.125rem]',
          tones[tone],
        )}
      />
      <div
        className={cn(
          'relative mt-[3px] rounded-xl rounded-tl-none bg-grey-2',
          padded && 'p-4',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
