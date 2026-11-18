'use client';

import { useState, type ReactNode } from 'react';
import type { Style } from '@/lib/client-paths';
import { StyleSwitch } from './style-switch';

/**
 * Something Dossier wrote in both versions, drawn on the server, with the
 * switch between them beside its heading.
 */
export function Styled({
  initial,
  heading,
  technical,
  executive,
}: {
  initial: Style;
  heading: ReactNode;
  technical: ReactNode;
  executive: ReactNode;
}) {
  const [style, setStyle] = useState(initial);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {heading}
        <StyleSwitch value={style} onChange={setStyle} />
      </div>
      {style === 'executive' ? executive : technical}
    </>
  );
}
