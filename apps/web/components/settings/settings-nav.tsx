'use client';

import { useEffect, useState } from 'react';
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
    <nav aria-label="Settings" className="lg:sticky lg:top-6 lg:self-start">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={current === section.id ? 'location' : undefined}
              className={cn(
                'block rounded-lg px-3 py-2 text-small whitespace-nowrap transition-colors',
                current === section.id
                  ? 'bg-grey-2 font-medium'
                  : 'text-muted hover:text-ink',
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
