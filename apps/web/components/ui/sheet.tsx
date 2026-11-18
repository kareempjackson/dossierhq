'use client';

import {
  AnimatePresence,
  motion,
  useDragControls,
  type PanInfo,
} from 'motion/react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Arrives briskly and settles without a wobble, as a native sheet does. */
const SHEET_SPRING = { type: 'spring', stiffness: 420, damping: 40 } as const;

/** How far, or how fast, a sheet is pulled down before it lets go. */
const DISMISS_DISTANCE = 110;
const DISMISS_SPEED = 550;

/**
 * A sheet that rises from the bottom of a phone's screen. Pull its handle
 * down, tap outside it or press Esc to close it. It's a modal dialog, so
 * focus stays inside and the page behind can't be reached; the page also
 * stops scrolling while it's open.
 */
export function Sheet({
  open,
  onClose,
  label,
  header,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Names the sheet for screen readers. */
  label: string;
  /** Drawn under the handle; pulling it moves the sheet too. */
  header?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useDragControls();

  // Shown before the first frame, so the sheet rises from the start.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    if (!element.open) element.showModal();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = overflow;
    };
  }, [open]);

  const letGo = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_SPEED) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      onCancel={(event) => {
        // Esc: slide away first, then close (onExitComplete).
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 text-ink backdrop:bg-transparent"
    >
      <AnimatePresence onExitComplete={() => dialog.current?.close()}>
        {open && (
          <motion.div
            key="backdrop"
            aria-hidden
            className="absolute inset-0 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
        )}
        {open && (
          <motion.div
            key="sheet"
            className={cn(
              'absolute inset-x-0 bottom-0 mx-auto flex max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] max-w-lg flex-col rounded-t-[1.75rem] bg-white pb-safe shadow-float',
              className,
            )}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SHEET_SPRING}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.9 }}
            onDragEnd={letGo}
          >
            <div
              onPointerDown={(event) => drag.start(event)}
              className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
            >
              <span
                aria-hidden
                className="mx-auto mt-2.5 mb-1 block h-1.5 w-10 rounded-full bg-grey-3"
              />
              {header}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}
