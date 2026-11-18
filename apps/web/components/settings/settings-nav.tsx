'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export const SETTINGS_SECTIONS = [
  { id: 'account', label: 'Your account' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'people', label: 'People' },
  { id: 'ai-model', label: 'AI model' },
  { id: 'api-keys', label: 'API keys' },
  { id: 'spend', label: 'Spend' },
] as const;

/** Jumps to each section, and marks the one being read. */
export function SettingsNav() {
  const [current, setCurrent] = useState<string>(SETTINGS_SECTIONS[0].id);
  const list = useRef<HTMLUListElement>(null);

  // On a phone the menu is a row that scrolls sideways; keep the section
  // being read in view as the page moves.
  useEffect(() => {
    const scroller = list.current;
    const link = scroller?.querySelector<HTMLElement>('[aria-current]');
    if (!scroller || !link || scroller.scrollWidth <= scroller.clientWidth) {
      return;
    }
    scroller.scrollTo({
      left: link.offsetLeft - (scroller.clientWidth - link.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, [current]);

  useEffect(() => {
    const sections = SETTINGS_SECTIONS.map(({ id }) =>
      document.getElementById(id),
    ).filter((section): section is HTMLElement => section !== null);
    // The section nearest the top of the screen is the one being read.
    const pick = () => {
      const passed = sections.filter(
        (section) => section.getBoundingClientRect().top <= 120,
      );
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4;
      setCurrent(
        atBottom
          ? sections[sections.length - 1].id
          : (passed.pop() ?? sections[0]).id,
      );
    };
    pick();
    window.addEventListener('scroll', pick, { passive: true });
    return () => window.removeEventListener('scroll', pick);
  }, []);

  return (
    // On a phone it sticks under the top bar, as a row of pills.
    <nav
      aria-label="Settings"
      className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 -mx-4 bg-white/85 px-4 py-2 backdrop-blur-xl backdrop-saturate-150 sm:-mx-8 sm:px-8 lg:top-6 lg:mx-0 lg:self-start lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
    >
      <ul
        ref={list}
        className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:px-0"
      >
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={current === section.id ? 'location' : undefined}
              className={cn(
                'block rounded-lg px-3 py-2 text-small whitespace-nowrap transition-colors max-lg:press max-lg:rounded-full max-lg:px-3.5',
                current === section.id
                  ? 'bg-grey-2 font-medium'
                  : 'text-muted hover:text-ink max-lg:bg-grey-1',
              )}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
