import type { AuditCount, Tool } from '@dossierhq/contracts';

/**
 * The audit log's views and links, safe for the browser: types only from the
 * contracts, so the tab bar doesn't ship zod. The server reads views through
 * lib/audit-view.ts, which checks tools against the contracts' list.
 */

export const AUDIT_PATH = '/audit-log';

/**
 * What the audit log shows, kept in the URL so a page can be shared, opened
 * again, or stepped back to: everything, sign-ins (`?kind=sign-in`),
 * changes (`?kind=change`) or one tool's reads (`?tool=ninjaone`), for every
 * client or one (`?client=`), and which page (`?before=` or `?after=`, the
 * cursors the API gave the neighbouring page).
 */
export type AuditView = {
  kind?: 'sign-in' | 'change';
  tool?: Tool;
  client?: string;
};
export type AuditCursor = { before?: string; after?: string };

/** A tool the log can be filtered to, with its name. */
export type AuditTool = { id: Tool; name: string };

/**
 * The view a URL asks for, given each parameter's value (`read`) and the
 * tools there are. Sign-ins and changes are for owners and admins
 * (`everything`); for anyone else the log is reads only.
 */
export function auditViewOf(
  read: (key: string) => string | undefined,
  everything: boolean,
  tools: readonly Tool[],
): AuditView & AuditCursor {
  const asked = read('tool');
  const tool = tools.find((each) => each === asked);
  const kind = read('kind');
  const before = read('before');
  return {
    tool,
    kind:
      everything && !tool && (kind === 'sign-in' || kind === 'change')
        ? kind
        : undefined,
    client: read('client')?.slice(0, 100),
    before,
    after: before ? undefined : read('after'),
  };
}

/** The URL of a view (and page) under `path`. */
export function auditHref(
  path: string,
  { kind, tool, client, before, after }: AuditView & AuditCursor,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({
    kind,
    tool,
    client,
    before,
    after,
  })) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export type AuditTab = {
  label: string;
  href: string;
  /** Undefined until the counts are known. */
  count?: number;
  current: boolean;
};

/** All, sign-ins and changes (owners and admins), then each tool's reads. */
export function auditTabs(
  view: AuditView,
  everything: boolean,
  tools: readonly AuditTool[],
  counts: readonly AuditCount[] | null,
): AuditTab[] {
  const client = view.client;
  const tab = (filter: AuditView, label: string): AuditTab => ({
    label,
    href: auditHref(AUDIT_PATH, { ...filter, client }),
    count: countOf(filter, everything, counts),
    current: filter.kind === view.kind && filter.tool === view.tool,
  });
  return [
    tab({}, everything ? 'All' : 'All reads'),
    ...(everything
      ? [
          tab({ kind: 'sign-in' }, 'Sign-ins'),
          tab({ kind: 'change' }, 'Changes'),
        ]
      : []),
    ...tools.map((tool) => tab({ tool: tool.id }, tool.name)),
  ];
}

/** How many entries a view holds, from the log's counts; undefined until they're known. */
export function countOf(
  { kind, tool }: AuditView,
  everything: boolean,
  counts: readonly AuditCount[] | null,
): number | undefined {
  const keep = (count: AuditCount) =>
    tool
      ? count.kind === 'read' && count.tool === tool
      : kind
        ? count.kind === kind
        : everything || count.kind === 'read';
  return counts?.filter(keep).reduce((total, count) => total + count.count, 0);
}
