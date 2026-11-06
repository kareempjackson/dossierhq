import { cn } from '@/lib/cn';
import { MARK_PATH } from './logo';

/**
 * The Index pattern: the mark mirrored on a grid. One pattern per surface.
 * Marks take the text colour; `accents` lists [row, column] cells that take
 * `accentClassName` instead.
 */
export function IndexPattern({
  rows = 5,
  cols = 7,
  accents = [],
  accentClassName = 'text-lime',
  className,
}: {
  rows?: number;
  cols?: number;
  accents?: ReadonlyArray<readonly [number, number]>;
  accentClassName?: string;
  className?: string;
}) {
  const cell = 100;
  const scale = 0.63;
  const markWidth = 69.43 * scale;
  const markHeight = 73.84 * scale;
  const offsetX = (cell - markWidth) / 2;
  const offsetY = (cell - markHeight) / 2;

  return (
    <svg
      viewBox={`0 0 ${cols * cell} ${rows * cell}`}
      className={cn('block', className)}
      aria-hidden
    >
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => {
          const mirrored = (row + col) % 2 === 1;
          const accent = accents.some(([r, c]) => r === row && c === col);
          const x = col * cell + offsetX + (mirrored ? markWidth : 0);
          const y = row * cell + offsetY;
          return (
            <path
              key={`${row}-${col}`}
              d={MARK_PATH}
              transform={`translate(${x} ${y}) scale(${mirrored ? -scale : scale} ${scale})`}
              className={cn('fill-current', accent && accentClassName)}
            />
          );
        }),
      )}
    </svg>
  );
}
