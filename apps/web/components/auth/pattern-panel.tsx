import type { ReactNode } from 'react';
import { IndexPattern } from '@/components/brand/index-pattern';
import { AuthPanel } from './auth-shell';

/**
 * Lime with the Index pattern across the top; the page fills the rest. Four
 * rows of the pattern, or five on tall screens. The window cuts between rows
 * (the grid is 100 units a cell, shifted up 20), never through a mark.
 */
export function PatternPanel({ children }: { children: ReactNode }) {
  return (
    <AuthPanel tone="lime">
      <div className="shrink-0 px-4">
        <div className="relative aspect-[700/380] overflow-hidden [@media(min-height:58rem)]:aspect-[700/480]">
          <IndexPattern
            rows={5}
            cols={7}
            accents={[
              [0, 6],
              [2, 1],
              [3, 3],
              [4, 5],
            ]}
            accentClassName="text-ink"
            className="absolute inset-x-0 top-0 w-full -translate-y-[4%] text-white"
          />
        </div>
      </div>
      {children}
    </AuthPanel>
  );
}
