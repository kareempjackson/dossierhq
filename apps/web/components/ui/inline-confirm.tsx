'use client';

import type { LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { BusyIcon } from './spinner';

/**
 * Asking first, in place, for something that can't be taken back: a
 * trigger, and the confirm that replaces it. Cancel or Escape puts the
 * trigger back, with focus on it.
 */
export type Confirm = {
  asking: boolean;
  /** Cancelled before: the trigger comes back focused. */
  cancelled: boolean;
  ask: () => void;
  cancel: () => void;
};

export function useConfirm(): Confirm {
  const [asking, setAsking] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  return {
    asking,
    cancelled,
    ask: () => setAsking(true),
    cancel: () => {
      setCancelled(true);
      setAsking(false);
    },
  };
}

/** A quiet text trigger, such as Delete or Detach. */
export function ConfirmTrigger({
  confirm,
  busy,
  children,
  className,
}: {
  confirm: Confirm;
  busy: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      // It's drawn afresh after the confirm, so this focuses it then.
      autoFocus={confirm.cancelled}
      onClick={confirm.ask}
      disabled={busy}
      className={cn(
        'rounded-sm text-muted hover:text-ink disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The question, with Cancel and the action. In a wrapping flex row it
 * takes a line of its own unless `fill` is off.
 */
export function ConfirmPanel({
  confirm,
  busy,
  label,
  message,
  confirmLabel,
  icon,
  onConfirm,
  fill = true,
  className,
}: {
  confirm: Confirm;
  busy: boolean;
  /** What the group is, for screen readers, e.g. "Delete this question". */
  label: string;
  message: ReactNode;
  confirmLabel: string;
  icon?: LucideIcon;
  onConfirm: () => void;
  fill?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) confirm.cancel();
      }}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left',
        fill && 'basis-full',
        className,
      )}
    >
      <p className="text-small text-ink">{message}</p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          autoFocus
          disabled={busy}
          onClick={confirm.cancel}
        >
          Cancel
        </Button>
        <Button variant="ink" size="sm" disabled={busy} onClick={onConfirm}>
          {icon && <BusyIcon icon={icon} busy={busy} />}
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
