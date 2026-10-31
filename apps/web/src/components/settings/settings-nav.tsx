'use client';

import {
  Bell,
  KeyRound,
  Receipt,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { cn } from '@/lib/cn';

const icons = {
  account: UserRound,
  notifications: Bell,
  people: Users,
  model: Sparkles,
  keys: KeyRound,
  spend: Receipt,
} satisfies Record<string, LucideIcon>;

export type SettingsNavItem = {
  /** The SettingsSection's id. */
  id: string;
  label: string;
  icon: keyof typeof icons;
};

/** How long a jump's own scrolling may run before reading the page again. */
const JUMP_MS = 1000;

/**
 * Jumps between the sections of the settings page, and marks the one being
 * read. A column beside them from 1280px; below that, a bar that stays at
 * the top of the sheet as it scrolls.
 */
export function SettingsNav({ items }: { items: SettingsNavItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  const jumpingUntil = useRef(0);
  const list = useRef<HTMLUListElement>(null);

  // On a phone the bar can scroll sideways; keep the marked section in it.
  useEffect(() => {
    const bar = list.current;
    const link = bar?.querySelector('[aria-current]');
    if (!bar || !link || bar.scrollWidth <= bar.clientWidth) return;
    const edges = bar.getBoundingClientRect();
    const box = link.getBoundingClientRect();
    if (box.left < edges.left) bar.scrollBy({ left: box.left - edges.left });
    if (box.right > edges.right)
      bar.scrollBy({ left: box.right - edges.right });
  }, [active]);

  useEffect(() => {
    let frame = 0;

    // The sheet scrolls from 768px and the window below it, so this listens
    // to every scroll and acts on the one holding the sections.
    function measure(target: EventTarget | null) {
      if (performance.now() < jumpingUntil.current) return;
      const sections = items
        .map((item) => document.getElementById(item.id))
        .filter((section) => section !== null);
      const first = sections[0];
      const scroller =
        target instanceof Element ? target : document.scrollingElement;
      if (!first || !scroller?.contains(first)) return;

      const top =
        scroller === document.scrollingElement
          ? 0
          : scroller.getBoundingClientRect().top;
      const line = top + Math.min(160, scroller.clientHeight * 0.3);
      let current = first.id;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= line) current = section.id;
      }
      // At the very bottom, the last section, however short it is.
      const end = scroller.scrollHeight - scroller.clientHeight;
      if (end > 1 && scroller.scrollTop >= end - 2) {
        current = sections.at(-1)!.id;
      }
      setActive(current);
    }

    function onScroll(event: Event) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measure(event.target));
    }

    document.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      cancelAnimationFrame(frame);
    };
  }, [items]);

  function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const section = document.getElementById(id);
    if (!section) return;
    event.preventDefault();
    // Clicks are timed on the same clock as performance.now().
    jumpingUntil.current = event.timeStamp + JUMP_MS;
    setActive(id);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({
      behavior: still ? 'auto' : 'smooth',
      block: 'start',
    });
    section.focus({ preventScroll: true });
    window.history.replaceState(null, '', `#${id}`);
  }

  return (
    <nav
      aria-label="Settings"
      className={cn(
        // Sticky offsets count from inside the sheet's 48px padding once it
        // scrolls, from 768px: -top-12 puts the bar on the sheet's top edge.
        'sticky top-0 z-10 -mx-5 mb-8 border-b border-hairline bg-sheet/90 px-5 py-2 backdrop-blur-md sm:-mx-10 sm:px-10 md:-top-12',
        'xl:top-0 xl:mx-0 xl:mb-0 xl:border-0 xl:bg-transparent xl:p-0 xl:backdrop-blur-none',
      )}
    >
      <ul
        ref={list}
        className="flex gap-1 overflow-x-auto scrollbar-none xl:flex-col xl:overflow-visible"
      >
        {items.map((item) => {
          const Icon = icons[item.icon];
          const current = item.id === active;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                aria-current={current ? 'location' : undefined}
                onClick={(event) => jump(event, item.id)}
                className={cn(
                  'flex h-9 items-center gap-2.5 rounded-full px-3 text-body sm:px-3.5 whitespace-nowrap transition-colors -outline-offset-2',
                  current
                    ? 'bg-surface text-ink'
                    : 'text-muted hover:bg-surface-soft hover:text-ink',
                )}
              >
                <Icon
                  aria-hidden
                  className="hidden size-4 shrink-0 sm:block"
                  strokeWidth={1.75}
                />
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
