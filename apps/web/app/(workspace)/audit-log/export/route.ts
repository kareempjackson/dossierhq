import { hasRole, TOOL_NAMES, type AuditEntry } from '@dossierhq/contracts';
import { unstable_rethrow } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { apiKindOf, auditViewFrom } from '@/lib/audit-view';
import { getAuditPage } from '@/lib/data/audit';
import { getMe } from '@/lib/data/auth';
import { getClientNames } from '@/lib/data/clients';

/** The most rows one file holds; the newest come first. */
const MAX_ROWS = 10_000;
/** The API's largest page. */
const PER_REQUEST = 200;

/**
 * The audit log as CSV, for the same view as the page (filter and client,
 * not the page): every matching entry, newest first, read from the API a
 * page at a time. Technicians get reads only, as on the page.
 */
export async function GET(request: NextRequest) {
  try {
    const me = await getMe();
    const everything = hasRole(me.role, 'admin');
    const view = auditViewFrom(
      Object.fromEntries(request.nextUrl.searchParams),
      everything,
    );
    const names = await getClientNames().catch(() => new Map<string, string>());

    const entries: AuditEntry[] = [];
    let before: string | undefined;
    let more = false;
    do {
      const page = await getAuditPage({
        kind: apiKindOf(view, everything),
        tool: view.tool,
        clientId: view.client,
        before,
        limit: PER_REQUEST,
      });
      entries.push(...page.data);
      before = page.older ?? undefined;
      more = Boolean(before);
    } while (more && entries.length < MAX_ROWS);

    const rows = [
      [
        'Time (UTC)',
        'Who',
        'Email',
        'What',
        'Tool',
        'Client',
        'Records',
        'Outcome',
        'IP address',
      ],
      ...entries
        .slice(0, MAX_ROWS)
        .map((entry) => [
          entry.at,
          entry.actor?.name ?? 'Dossier',
          entry.actor?.email ?? '',
          entry.what,
          entry.tool ? TOOL_NAMES[entry.tool] : '',
          entry.clientId
            ? (names.get(entry.clientId) ?? entry.clientId)
            : entry.kind === 'read'
              ? 'All clients'
              : '',
          entry.kind === 'read' ? String(entry.recordCount) : '',
          entry.outcome,
          entry.ip ?? '',
        ]),
    ];
    const name = more
      ? `dossier-audit-log-newest-${MAX_ROWS}.csv`
      : 'dossier-audit-log.csv';
    return new Response(
      `${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`,
      {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${name}"`,
          'cache-control': 'no-store',
        },
      },
    );
  } catch (error) {
    // Lets "sign in again" redirects through.
    unstable_rethrow(error);
    return new Response(
      'Dossier couldn’t export the audit log. Try again in a moment.',
      { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }
}

/**
 * One CSV cell, quoted. A value a spreadsheet would run as a formula
 * (starting with =, +, -, @, tab or return) is kept as text.
 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
