import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

// `relative` keeps absolutely positioned children (such as sr-only labels)
// inside the scroll container instead of stretching the document.
const scrollClasses = {
  md: 'md:relative md:min-h-0 md:overflow-y-auto md:overscroll-contain',
  xl: 'xl:relative xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain',
} as const;

type SheetProps = ComponentPropsWithoutRef<'div'> & {
  as?: 'div' | 'section' | 'aside' | 'article';
  /**
   * Where the sheet becomes its own scroll container, so the ground and the
   * sidebar stay put. `md` suits a page with one sheet. `xl` suits sheets that
   * sit side by side only from 1280px; below that they stack and scroll
   * together inside <main>.
   */
  scroll?: keyof typeof scrollClasses;
};

/** The raised white surface the workspace sits on. Pages render one or two. */
export function Sheet({
  as: Tag = 'div',
  scroll,
  className,
  ...props
}: SheetProps) {
  return (
    <Tag
      className={cn(
        'rounded-sheet bg-sheet shadow-sheet',
        scroll && scrollClasses[scroll],
        className,
      )}
      {...props}
    />
  );
}
