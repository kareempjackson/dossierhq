import { toolSchema, type AuditKind } from '@dossierhq/contracts';
import { auditViewOf, type AuditCursor, type AuditView } from './audit-paths';

export { auditHref, type AuditCursor, type AuditView } from './audit-paths';

type Query = Record<string, string | string[] | undefined>;

const one = (value: Query[string]) =>
  typeof value === 'string' && value ? value : undefined;

/**
 * The view a URL asks for (see lib/audit-paths.ts). Sign-ins and changes
 * are for owners and admins (`everything`); for anyone else the log is
 * reads only.
 */
export function auditViewFrom(
  query: Query,
  everything: boolean,
): AuditView & AuditCursor {
  return auditViewOf((key) => one(query[key]), everything, toolSchema.options);
}

/** The API's `kind` for a view: one tool is reads; nothing set is everything you may see. */
export function apiKindOf(
  view: AuditView,
  everything: boolean,
): AuditKind | undefined {
  if (view.tool) return 'read';
  return view.kind ?? (everything ? undefined : 'read');
}
