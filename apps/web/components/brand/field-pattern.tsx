import { cn } from '@/lib/cn';
import { MARK_PATH } from './logo';

/**
 * The Field pattern: half-files scattered dense to sparse, densest at the
 * top right. For data and section breaks. The scatter comes from a hash of
 * each cell, so it's the same on every render.
 */
export function FieldPattern({
  rows = 6,
  cols = 28,
  seed = 7,
  accentClassName = 'text-lime',
  className,
}: {
  rows?: number;
  cols?: number;
  seed?: number;
  accentClassName?: string;
  className?: string;
}) {
  const cell = 20;
  const scale = 0.19;
  const width = 69.43 * scale;
  const height = 73.84 * scale;

  const marks: { row: number; col: number; accent: boolean }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const density =
        0.65 * (col / (cols - 1)) + 0.45 * (1 - row / Math.max(rows - 1, 1));
      if (hash(row, col, seed) < density - 0.02) {
        marks.push({ row, col, accent: hash(row, col, seed + 1) < 0.12 });
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${cols * cell} ${rows * cell}`}
      className={cn('block', className)}
      aria-hidden
    >
      {marks.map(({ row, col, accent }) => {
        const mirrored = (row + col) % 2 === 1;
        const x = col * cell + (cell - width) / 2 + (mirrored ? width : 0);
        const y = row * cell + (cell - height) / 2;
        return (
          <path
            key={`${row}-${col}`}
            d={MARK_PATH}
            transform={`translate(${x} ${y}) scale(${mirrored ? -scale : scale} ${scale})`}
            className={cn('fill-current', accent && accentClassName)}
          />
        );
      })}
    </svg>
  );
}

/** A number in [0, 1) from a cell and a seed. */
function hash(row: number, col: number, seed: number) {
  let h = (row * 374761393 + col * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
