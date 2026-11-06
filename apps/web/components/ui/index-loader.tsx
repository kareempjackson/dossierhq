'use client';

import { motion, useReducedMotion } from 'motion/react';
import { MARK_PATH } from '@/components/brand/logo';
import { cn } from '@/lib/cn';

/*
 * The Index pattern (components/brand/index-pattern.tsx) at loader size: a
 * small grid of the mark, mirrored cell by cell, with lime passing across it
 * corner to corner, as if Dossier were reading down a drawer of files.
 */
const ROWS = 3;
const COLS = 5;
const CELL = 100;
const SCALE = 0.63;
const MARK_WIDTH = 69.43 * SCALE;
const MARK_HEIGHT = 73.84 * SCALE;

/* Motion blends the fill itself, so these are the token values as hex. */
const STONE = '#d6d3cc'; // --color-stone
const LIME = '#e8f54c'; // --color-lime

/** One pass across the grid, then a short rest, in seconds. */
const CYCLE = 1.8;
/** How far behind its neighbour each diagonal lights up, in seconds. */
const STEP = 0.11;
/** A wait shorter than this shows nothing at all, in seconds. */
const APPEAR_AFTER = 0.3;

const MARKS = Array.from({ length: ROWS * COLS }, (_, index) => {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  const mirrored = (row + col) % 2 === 1;
  const x = col * CELL + (CELL - MARK_WIDTH) / 2 + (mirrored ? MARK_WIDTH : 0);
  const y = row * CELL + (CELL - MARK_HEIGHT) / 2;
  return {
    index,
    diagonal: row + col,
    transform: `translate(${x} ${y}) scale(${mirrored ? -SCALE : SCALE} ${SCALE})`,
  };
});

/**
 * Dossier at work: shown where content will be while it's read. It stays
 * invisible for a beat, so a quick read never shows it, then fades in.
 * Give it the height of the content it stands in for, so nothing below it
 * moves when the content arrives. For people who ask for less motion the
 * grid holds still.
 */
export function IndexLoader({
  label = 'Loading',
  className,
}: {
  /** What's being read, for screen readers. */
  label?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div role="status" className={cn('grid place-items-center', className)}>
      <motion.svg
        viewBox={`0 0 ${COLS * CELL} ${ROWS * CELL}`}
        aria-hidden
        className="block w-24"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          delay: APPEAR_AFTER,
          duration: 0.45,
          ease: [0.4, 0, 1, 1],
        }}
      >
        {MARKS.map((mark) => (
          <g key={mark.index} transform={mark.transform}>
            <motion.path
              d={MARK_PATH}
              fill={STONE}
              animate={
                reduce ? undefined : { fill: [STONE, LIME, LIME, STONE, STONE] }
              }
              transition={{
                duration: CYCLE,
                times: [0, 0.1, 0.18, 0.4, 1],
                ease: 'easeInOut',
                repeat: Infinity,
                delay: mark.diagonal * STEP,
              }}
            />
          </g>
        ))}
      </motion.svg>
      <span className="sr-only">{label}</span>
    </div>
  );
}
