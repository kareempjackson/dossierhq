'use client';

import { ChevronsUpDown, LogOut, Settings } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useFormStatus } from 'react-dom';
import { endSupportView, signOut } from '@/app/(auth)/actions';
import { BusyIcon } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';
import type { SessionMe } from '@/lib/session-me';
import { useAppSelector } from '@/lib/store/hooks';
import { selectSupport, selectUser } from '@/lib/store/session-slice';

type User = SessionMe['user'];

/**
 * Who's signed in, at the foot of the sidebar, opening a menu above it:
 * their settings, and the way out. Room is kept for the name until it's
 * known; the menu works before then, so there's always a way out.
 *
 * The whole thing is the sign-out form, so the row can say it's signing
 * out after the menu has closed.
 */
export function SidebarUser() {
  const user = useAppSelector(selectUser);
  // In a support view the way out ends the view, as the banner's does.
  const support = useAppSelector(selectSupport) !== null;
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // A press anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!form.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  return (
    <form
      ref={form}
      action={support ? endSupportView : signOut}
      onSubmit={() => setOpen(false)}
      className="relative"
    >
      <Trigger
        buttonRef={trigger}
        user={user}
        support={support}
        open={open}
        menuId={menuId}
        onOpen={() => setOpen(true)}
        onToggle={() => setOpen((was) => !was)}
      />
      <AnimatePresence>
        {open && (
          <Menu id={menuId} user={user} support={support} onClose={close} />
        )}
      </AnimatePresence>
    </form>
  );
}

function Trigger({
  buttonRef,
  user,
  support,
  open,
  menuId,
  onOpen,
  onToggle,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  user: User | null;
  support: boolean;
  open: boolean;
  menuId: string;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      disabled={pending}
      onClick={onToggle}
      onKeyDown={(event) => {
        // A menu button's arrows open its menu, as Enter and Space do.
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors enabled:hover:bg-white/60',
        open && 'bg-white/60',
      )}
    >
      {user ? (
        <>
          <span
            aria-hidden
            className="grid size-8 shrink-0 animate-enter place-items-center rounded-full bg-ink text-[0.6875rem] font-medium text-paper"
          >
            {initials(user.name)}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 animate-enter truncate text-small font-medium',
              pending && 'text-muted',
            )}
          >
            {pending ? (support ? 'Ending…' : 'Signing out…') : user.name}
          </span>
        </>
      ) : (
        <>
          <span aria-hidden className="size-8 shrink-0" />
          <span aria-hidden className="h-3 flex-1" />
          <span className="sr-only">Your account</span>
        </>
      )}
      <BusyIcon icon={ChevronsUpDown} busy={pending} className="text-muted" />
    </button>
  );
}

/** Each choice in the menu: a sidebar link's shape, on white. */
const ITEM =
  'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-small transition-colors hover:bg-grey-1 focus-visible:bg-grey-1';

/**
 * Above the row, the way a sidebar's account menu opens. Arrows move
 * between the choices; Escape closes it and returns to the row.
 */
function Menu({
  id,
  user,
  support,
  onClose,
}: {
  id: string;
  user: User | null;
  support: boolean;
  onClose: (refocus: boolean) => void;
}) {
  const list = useRef<HTMLDivElement>(null);

  // Opening it puts you on the first choice, as a menu button's menu does.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const moveTo = (index: number) => {
      event.preventDefault();
      items[(index + items.length) % items.length]?.focus();
    };
    if (event.key === 'ArrowDown') moveTo(at + 1);
    else if (event.key === 'ArrowUp') moveTo(at - 1);
    else if (event.key === 'Home') moveTo(0);
    else if (event.key === 'End') moveTo(items.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      onClose(true);
    } else if (event.key === 'Tab') onClose(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
      style={{ transformOrigin: 'bottom left' }}
      className="absolute inset-x-0 bottom-full z-20 mb-2 rounded-2xl bg-white p-1.5 shadow-float"
    >
      {user && (
        <div className="px-2.5 pt-1.5 pb-2">
          <p className="truncate text-small font-medium">{user.name}</p>
          <p className="truncate text-[0.75rem] text-muted">{user.email}</p>
        </div>
      )}
      <div
        ref={list}
        id={id}
        role="menu"
        aria-label="Your account"
        onKeyDown={onKeyDown}
        className="flex flex-col gap-0.5"
      >
        <Link
          href="/settings"
          role="menuitem"
          tabIndex={-1}
          onClick={() => onClose(false)}
          className={ITEM}
        >
          <Settings
            aria-hidden
            className="size-4 text-muted"
            strokeWidth={1.75}
          />
          Settings
        </Link>
        <button type="submit" role="menuitem" tabIndex={-1} className={ITEM}>
          <LogOut
            aria-hidden
            className="size-4 text-muted"
            strokeWidth={1.75}
          />
          {support ? 'End support view' : 'Sign out'}
        </button>
      </div>
    </motion.div>
  );
}

/** "Kareem Jackson" → "KJ". */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}
