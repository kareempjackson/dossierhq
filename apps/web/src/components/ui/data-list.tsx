'use client';

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { ListCard } from '@/components/ui/list-card';
import { cn } from '@/lib/cn';

/** One row, rendered on the server, with what search and filters look at. */
export type DataRow = {
  id: string;
  /** Everything a person might type to find it. */
  text: string;
  /** Its value for each filter, by the filter's name. */
  values?: Record<string, string>;
  /** The heading it sits under in a `groups` layout, e.g. its day. */
  group?: string;
  /** A `<tr>` in a table, an `<li>` in any other layout. */
  node: ReactNode;
};

export type DataFilter = {
  /** Its URL parameter, e.g. `status`. */
  name: string;
  /** e.g. "Status". */
  label: string;
  options: { value: string; label: string }[];
  /** Pills suit two to four options; a menu suits more. */
  as?: 'segments' | 'menu';
};

export type DataLayout =
  | { kind: 'table'; caption: string; head: ReactNode }
  /** A card of rows separated by hairlines. */
  | { kind: 'list' }
  /** Rows that are cards themselves. */
  | { kind: 'cards' }
  /** A list card per group, under the group's heading. */
  | { kind: 'groups' };

/**
 * Search, filters and pages for a list the server has rendered. All of it
 * happens in the browser, so typing never waits on the network, and it's
 * kept in the URL (`q`, each filter's name, `page`) so a reload or a shared
 * link shows the same thing. Press / to search; Escape clears it.
 */
export function DataList({
  rows,
  layout,
  filters = [],
  noun,
  placeholder,
  pageSize = 25,
  actions,
}: {
  rows: DataRow[];
  layout: DataLayout;
  filters?: DataFilter[];
  /** Singular and plural, e.g. `['ticket', 'tickets']`. */
  noun: [string, string];
  placeholder: string;
  pageSize?: number;
  /** Buttons for the end of the toolbar. */
  actions?: ReactNode;
}) {
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      filters.flatMap((filter) => {
        const value = params.get(filter.name);
        return value && filter.options.some((o) => o.value === value)
          ? [[filter.name, value]]
          : [];
      }),
    ),
  );
  const [page, setPage] = useState(() =>
    Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1),
  );
  // Typing stays quick on long lists; the rows catch up a moment later.
  const deferred = useDeferredValue(query);
  const top = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const indexed = useMemo(
    () => rows.map((row) => ({ row, text: fold(row.text) })),
    [rows],
  );
  const searched = useMemo(() => {
    const terms = fold(deferred).split(/\s+/).filter(Boolean);
    return indexed
      .filter(({ text }) => terms.every((term) => text.includes(term)))
      .map(({ row }) => row);
  }, [indexed, deferred]);

  // Rows passing every filter but `except`, so each filter's counts say what
  // choosing that option would show.
  const passing = (row: DataRow, except?: string) =>
    filters.every(
      ({ name }) =>
        name === except || !chosen[name] || row.values?.[name] === chosen[name],
    );
  const matched = searched.filter((row) => passing(row));
  const counts = filters.map((filter) => {
    const byValue = new Map<string, number>();
    let all = 0;
    for (const row of searched) {
      if (!passing(row, filter.name)) continue;
      all++;
      const value = row.values?.[filter.name];
      if (value) byValue.set(value, (byValue.get(value) ?? 0) + 1);
    }
    return { all, byValue };
  });

  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  const visible = matched.slice(start, start + pageSize);
  const narrowed = query.trim() !== '' || Object.keys(chosen).length > 0;

  // Keep the URL in step, without a trip to the server or a history entry.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    const put = (key: string, value: string | undefined) =>
      value ? next.set(key, value) : next.delete(key);
    put('q', query.trim());
    for (const { name } of filters) put(name, chosen[name]);
    put('page', current > 1 ? String(current) : undefined);
    const text = next.toString();
    if (text !== window.location.search.replace(/^\?/, '')) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${text ? `?${text}` : ''}`,
      );
    }
  }, [query, chosen, current, filters]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      event.preventDefault();
      input.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function search(value: string) {
    setQuery(value);
    setPage(1);
  }

  function choose(name: string, value: string) {
    setChosen((previous) => {
      const next = { ...previous };
      if (value) next[name] = value;
      else delete next[name];
      return next;
    });
    setPage(1);
  }

  function clear() {
    setQuery('');
    setChosen({});
    setPage(1);
  }

  function turnTo(next: number) {
    setPage(next);
    // Back to the top of the list when it has scrolled away.
    if (top.current && top.current.getBoundingClientRect().top < 0) {
      const reduce = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      top.current.scrollIntoView({
        block: 'start',
        behavior: reduce ? 'auto' : 'smooth',
      });
    }
  }

  const [one, many] = noun;
  const summary =
    pageCount > 1
      ? `${start + 1}–${start + visible.length} of ${matched.length} ${many}`
      : `${matched.length} ${matched.length === 1 ? one : many}`;

  return (
    <div ref={top} className="scroll-mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <div role="search" className="relative w-full sm:w-72">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          />
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(event) => search(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.preventDefault();
                search('');
              }
            }}
            aria-label={`Search ${many}`}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className="peer h-9 w-full rounded-full bg-surface pr-9 pl-9 text-body text-ink transition-[background-color,box-shadow] placeholder:text-muted hover:bg-surface-soft focus:bg-sheet focus:shadow-card [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                search('');
                input.current?.focus();
              }}
              className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          ) : (
            <kbd
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-2.5 hidden h-5 min-w-5 -translate-y-1/2 place-items-center rounded-row bg-sheet px-1 font-mono text-meta-sm text-muted shadow-card peer-focus:hidden sm:grid"
            >
              /
            </kbd>
          )}
        </div>

        {filters.map((filter, index) =>
          filter.options.length < 2 ? null : (filter.as ?? 'segments') ===
            'segments' ? (
            <Segments
              key={filter.name}
              filter={filter}
              value={chosen[filter.name] ?? ''}
              counts={counts[index]!}
              onChange={(value) => choose(filter.name, value)}
            />
          ) : (
            <Menu
              key={filter.name}
              filter={filter}
              value={chosen[filter.name] ?? ''}
              counts={counts[index]!}
              onChange={(value) => choose(filter.name, value)}
            />
          ),
        )}

        {narrowed && (
          <button
            type="button"
            onClick={clear}
            className="h-9 rounded-full px-3 text-meta text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            Clear
          </button>
        )}

        {actions && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto">
            {actions}
          </div>
        )}
      </div>

      <div
        className={cn(
          'mt-4 transition-opacity',
          deferred !== query && 'opacity-60',
        )}
      >
        {matched.length === 0 ? (
          <div className="rounded-card bg-surface-soft px-5 py-10 text-center">
            <p className="font-medium text-ink">
              No {many} match
              {query.trim() ? ` “${query.trim()}”` : ' these filters'}.
            </p>
            <p className="mt-1 text-meta text-muted">
              Try fewer words, or{' '}
              <button
                type="button"
                onClick={clear}
                className="rounded-row underline underline-offset-2 hover:text-ink"
              >
                show every {one}
              </button>
              .
            </p>
          </div>
        ) : (
          <Rows layout={layout} rows={visible} />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-meta text-muted tabular-nums">
          {summary}
          {narrowed && ` · ${rows.length} in all`}
        </p>
        {pageCount > 1 && (
          <Pagination
            label={`Pages of ${many}`}
            page={current}
            pageCount={pageCount}
            onChange={turnTo}
          />
        )}
      </div>
    </div>
  );
}

/** Lowercase without accents, so "Señor" finds "senor". */
function fold(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function Rows({ layout, rows }: { layout: DataLayout; rows: DataRow[] }) {
  const nodes = rows.map((row) => <Fragment key={row.id}>{row.node}</Fragment>);
  switch (layout.kind) {
    case 'table':
      return (
        <div className="overflow-x-auto rounded-card bg-sheet shadow-card">
          <table className="w-full min-w-180 text-left">
            <caption className="sr-only">{layout.caption}</caption>
            {layout.head}
            <tbody className="divide-y divide-hairline">{nodes}</tbody>
          </table>
        </div>
      );
    case 'list':
      return <ListCard>{nodes}</ListCard>;
    case 'cards':
      return <ol className="flex flex-col gap-4">{nodes}</ol>;
    case 'groups': {
      // Consecutive rows that share a group, so a day split across two pages
      // gets its heading on both.
      const groups: { name: string; rows: DataRow[] }[] = [];
      for (const row of rows) {
        const last = groups.at(-1);
        if (last && last.name === (row.group ?? '')) last.rows.push(row);
        else groups.push({ name: row.group ?? '', rows: [row] });
      }
      return (
        <ol className="flex flex-col gap-8">
          {groups.map((group, index) => (
            <li key={`${group.name}-${index}`}>
              <h2 className="text-meta font-medium text-muted">{group.name}</h2>
              <ListCard className="mt-2">
                {group.rows.map((row) => (
                  <Fragment key={row.id}>{row.node}</Fragment>
                ))}
              </ListCard>
            </li>
          ))}
        </ol>
      );
    }
  }
}

type FilterProps = {
  filter: DataFilter;
  value: string;
  counts: { all: number; byValue: Map<string, number> };
  onChange: (value: string) => void;
};

/** Pills, with how many rows each would show. */
function Segments({ filter, value, counts, onChange }: FilterProps) {
  const options = [{ value: '', label: 'All' }, ...filter.options];
  return (
    <div
      role="group"
      aria-label={filter.label}
      className="inline-flex max-w-full rounded-full bg-surface p-1"
    >
      <div className="flex flex-wrap gap-0.5">
        {options.map((option) => {
          const active = option.value === value;
          const count = option.value
            ? (counts.byValue.get(option.value) ?? 0)
            : counts.all;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-full px-3 text-meta whitespace-nowrap transition-[color,background-color,box-shadow]',
                active
                  ? 'bg-sheet text-ink shadow-card'
                  : 'text-muted hover:text-ink',
              )}
            >
              {option.label}
              <span
                className={cn(
                  'tabular-nums',
                  count === 0 ? 'text-border-strong' : 'text-muted',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A menu for filters with more options than pills can hold. */
function Menu({ filter, value, counts, onChange }: FilterProps) {
  return (
    <label className="relative inline-flex">
      <span className="sr-only">{filter.label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-9 cursor-pointer appearance-none rounded-full pr-8 pl-3.5 text-meta transition-colors',
          value
            ? 'bg-brand-soft text-ink'
            : 'bg-surface text-muted hover:text-ink',
        )}
      >
        <option value="">
          {`Every ${filter.label.toLowerCase()} (${counts.all})`}
        </option>
        {filter.options.map((option) => (
          <option key={option.value} value={option.value}>
            {`${option.label} (${counts.byValue.get(option.value) ?? 0})`}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted"
      />
    </label>
  );
}

/** Page numbers around the current one, with the first and last always there. */
function pagesAround(page: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const shown = new Set([1, count, page - 1, page, page + 1]);
  if (page <= 4) [2, 3, 4, 5].forEach((p) => shown.add(p));
  if (page >= count - 3)
    [count - 4, count - 3, count - 2, count - 1].forEach((p) => shown.add(p));
  const pages = [...shown]
    .filter((p) => p >= 1 && p <= count)
    .sort((a, b) => a - b);
  // null marks a gap.
  return pages.flatMap((p, i) =>
    i > 0 && p - pages[i - 1]! > 1 ? [null, p] : [p],
  );
}

function Pagination({
  label,
  page,
  pageCount,
  onChange,
}: {
  label: string;
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-full bg-surface p-1"
    >
      <PageButton
        aria-label="Previous page"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft aria-hidden className="size-4" />
      </PageButton>
      {pagesAround(page, pageCount).map((p, index) =>
        p === null ? (
          <span
            key={`gap-${index}`}
            aria-hidden
            className="grid h-7 w-5 place-items-center text-meta text-muted"
          >
            …
          </span>
        ) : (
          <PageButton
            key={p}
            aria-label={`Page ${p}`}
            aria-current={p === page ? 'page' : undefined}
            active={p === page}
            onClick={() => onChange(p)}
          >
            {p}
          </PageButton>
        ),
      )}
      <PageButton
        aria-label="Next page"
        disabled={page === pageCount}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight aria-hidden className="size-4" />
      </PageButton>
    </nav>
  );
}

function PageButton({
  active = false,
  className,
  ...props
}: ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-meta tabular-nums transition-[color,background-color,box-shadow] disabled:pointer-events-none disabled:opacity-40',
        active ? 'bg-sheet text-ink shadow-card' : 'text-muted hover:text-ink',
        className,
      )}
      {...props}
    />
  );
}
