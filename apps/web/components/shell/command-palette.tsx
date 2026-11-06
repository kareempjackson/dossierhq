'use client';

import {
  Bell,
  Briefcase,
  FileText,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Mark } from '@/components/brand/logo';
import { cn } from '@/lib/cn';
import { NAV_SECTIONS } from './nav-links';

type PaletteClient = {
  id: string;
  name: string;
  summary: string;
  needsYou: boolean;
};
type PaletteReport = { id: string; clientName: string; week: string };

type Item = {
  key: string;
  label: string;
  meta?: string;
  href: string;
  icon: LucideIcon | 'mark';
};
type Group = { label: string; items: Item[] };

const Context = createContext<{ open: () => void } | null>(null);

/** Opens the palette, from anything inside the workspace. */
export function useCommandPalette() {
  const context = useContext(Context);
  if (!context)
    throw new Error('useCommandPalette needs a CommandPalette around it');
  return context;
}

const noSubscription = () => () => {};

/** ⌘ on Apple keyboards, Ctrl elsewhere. */
export function useModifierKey() {
  return useSyncExternalStore(
    noSubscription,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'),
    () => '⌘',
  );
}

/** "harbour" matches "Harbour Dental"; names that start with it come first. */
function matches(query: string, text: string) {
  return text.toLowerCase().includes(query);
}
function byStart(query: string) {
  return (a: { label: string }, b: { label: string }) =>
    Number(!a.label.toLowerCase().startsWith(query)) -
    Number(!b.label.toLowerCase().startsWith(query));
}

/** Pages that aren't in the sidebar, but can be jumped to. */
const OTHER_PAGES = [
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/intelligence', label: 'Intelligence', icon: Sparkles },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function groupsFor(
  raw: string,
  clients: PaletteClient[],
  reports: PaletteReport[],
): Group[] {
  const query = raw.trim().toLowerCase();
  const pages: Item[] = [
    ...NAV_SECTIONS.flatMap((section) => section.items),
    ...OTHER_PAGES,
  ].map((page) => ({
    key: `page-${page.href}`,
    label: page.label,
    href: page.href,
    icon: page.icon,
  }));
  const clientItems: Item[] = clients.map((client) => ({
    key: `client-${client.id}`,
    label: client.name,
    meta: client.summary,
    href: `/clients/${client.id}`,
    icon: Briefcase,
  }));

  // Nothing typed: the clients that need you, and where you can go.
  if (!query) {
    const needing = clients
      .filter((client) => client.needsYou)
      .map((client) => client.id);
    return [
      {
        label: 'Clients',
        items: clientItems.filter((item) =>
          needing.includes(item.key.slice(7)),
        ),
      },
      { label: 'Pages', items: pages },
    ].filter((group) => group.items.length > 0);
  }

  const reportItems: Item[] = reports
    .filter(
      (report) =>
        matches(query, report.clientName) || matches(query, 'reports'),
    )
    .map((report) => ({
      key: `report-${report.id}`,
      label: `Reports · ${report.clientName}`,
      meta: report.week,
      href: `/reports/${report.id}`,
      icon: FileText,
    }));
  const shown =
    raw.trim().length > 32 ? `${raw.trim().slice(0, 32)}…` : raw.trim();

  return [
    {
      label: 'Clients',
      items: clientItems
        .filter((item) => matches(query, item.label))
        .sort(byStart(query))
        .slice(0, 5),
    },
    {
      label: 'Pages',
      items: [
        ...pages.filter((item) => matches(query, item.label)),
        ...reportItems,
      ].slice(0, 5),
    },
    {
      label: 'Ask Dossier',
      items: [
        {
          key: 'ask',
          label: `Ask “${shown}” across every client`,
          meta: 'Enter',
          href: `/ask?q=${encodeURIComponent(raw.trim())}`,
          icon: 'mark' as const,
        },
      ],
    },
  ].filter((group) => group.items.length > 0);
}

/**
 * Jump to a client or page, or ask Dossier, from anywhere: ⌘K (Ctrl K) or
 * the search box in the top bar opens it. Arrows move, Enter opens, ⌘Enter
 * asks, Esc or a click outside closes it.
 */
export function CommandPalette({
  clients,
  reports,
  children,
}: {
  clients: PaletteClient[];
  reports: PaletteReport[];
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const modifier = useModifierKey();
  const id = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const groups = useMemo(
    () => groupsFor(query, clients, reports),
    [query, clients, reports],
  );
  const items = groups.flatMap((group) => group.items);
  const optionId = (index: number) => `${id}-option-${index}`;

  const open = useCallback(() => {
    setQuery('');
    setActive(0);
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  const close = () => dialog.current?.close();
  const go = (item: Item) => {
    close();
    router.push(item.href);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (dialog.current?.open) close();
        else open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    document
      .getElementById(optionId(active))
      ?.scrollIntoView({ block: 'nearest' });
  });

  // Where each group's items start in the flat list the arrows move through.
  const offsets = groups.map((_, groupIndex) =>
    groups
      .slice(0, groupIndex)
      .reduce((count, group) => count + group.items.length, 0),
  );
  return (
    <Context.Provider value={{ open }}>
      {children}
      <dialog
        ref={dialog}
        aria-label="Search and ask"
        onClick={(event) => {
          // A click on the dimmed backdrop lands on the dialog itself.
          if (event.target === event.currentTarget) close();
        }}
        className="mx-auto mt-[14vh] w-[min(40rem,calc(100%-2rem))] overflow-hidden rounded-2xl bg-white p-0 text-ink shadow-float backdrop:bg-ink/25 open:flex open:flex-col"
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <Mark height={16} />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls={`${id}-list`}
            aria-activedescendant={
              items.length > 0 ? optionId(active) : undefined
            }
            aria-label="Search clients and pages, or ask Dossier"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && items.length > 0) {
                event.preventDefault();
                setActive((current) => (current + 1) % items.length);
              } else if (event.key === 'ArrowUp' && items.length > 0) {
                event.preventDefault();
                setActive(
                  (current) => (current - 1 + items.length) % items.length,
                );
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const askItem = items.find((item) => item.key === 'ask');
                const chosen =
                  event.metaKey || event.ctrlKey ? askItem : items[active];
                if (chosen) go(chosen);
              }
            }}
            placeholder="Search clients and pages, or ask anything"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
          <kbd className="font-mono text-label tracking-normal text-muted">
            esc
          </kbd>
        </div>
        <div aria-hidden className="h-1.5 bg-grey-1" />

        <div
          id={`${id}-list`}
          role="listbox"
          aria-label="Results"
          className="max-h-[50vh] min-h-56 overflow-y-auto p-2"
        >
          {groups.map((group, groupIndex) => (
            <div
              key={group.label}
              role="group"
              aria-labelledby={`${id}-${group.label}`}
              className="pb-1"
            >
              <p
                id={`${id}-${group.label}`}
                className="px-3 pt-2 pb-1 text-[0.6875rem] text-muted"
              >
                {group.label}
              </p>
              {group.items.map((item, itemIndex) => {
                const position = offsets[groupIndex] + itemIndex;
                const Icon = item.icon;
                return (
                  <div
                    key={item.key}
                    id={optionId(position)}
                    role="option"
                    aria-selected={position === active}
                    onMouseMove={() => setActive(position)}
                    onClick={() => go(item)}
                    className={cn(
                      'flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-small',
                      position === active && 'bg-grey-1',
                    )}
                  >
                    {Icon === 'mark' ? (
                      <Mark height={13} className="w-4 text-muted" />
                    ) : (
                      <Icon
                        aria-hidden
                        className="size-4 text-muted"
                        strokeWidth={1.75}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    {item.meta && (
                      <span className="text-[0.75rem] text-muted">
                        {item.meta}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex gap-5 bg-grey-1 px-4 py-3 text-[0.6875rem] text-muted">
          <span>
            <kbd className="font-sans">↑↓</kbd> to move
          </span>
          <span>
            <kbd className="font-sans">↵</kbd> to open
          </span>
          <span>
            <kbd className="font-sans">{modifier}↵</kbd> to ask
          </span>
        </div>
      </dialog>
    </Context.Provider>
  );
}
