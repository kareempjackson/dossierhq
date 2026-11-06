import { toolSchema, type AuditKind, type Tool } from '@dossierhq/contracts';

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

type Query = Record<string, string | string[] | undefined>;

const one = (value: Query[string]) =>
  typeof value === 'string' && value ? value : undefined;

/**
 * The view a URL asks for. Sign-ins and changes are for owners and admins
 * (`everything`); for anyone else the log is reads only.
 */
export function auditViewFrom(
  query: Query,
  everything: boolean,
): AuditView & AuditCursor {
  const tool = toolSchema.safeParse(one(query.tool));
  const kind = one(query.kind);
  const before = one(query.before);
  return {
    tool: tool.success ? tool.data : undefined,
    kind:
      everything && !tool.success && (kind === 'sign-in' || kind === 'change')
        ? kind
        : undefined,
    client: one(query.client)?.slice(0, 100),
    before,
    after: before ? undefined : one(query.after),
  };
}

/** The API's `kind` for a view: one tool is reads; nothing set is everything you may see. */
export function apiKindOf(
  view: AuditView,
  everything: boolean,
): AuditKind | undefined {
  if (view.tool) return 'read';
  return view.kind ?? (everything ? undefined : 'read');
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
