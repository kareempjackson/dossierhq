/**
 * Where you are, for the phone's chrome: which tab of the bottom bar is lit,
 * and where the top bar's back button goes. Pure, so it's the same on the
 * server and in the browser.
 */

export type MobileTab = 'today' | 'clients' | 'ask' | 'reports' | 'more';

/** The pages behind More, which light it while you're on one. */
export const MORE_PATHS = [
  '/meetings',
  '/notes',
  '/connections',
  '/audit-log',
  '/intelligence',
  '/settings',
] as const;

/** Marks the phone's top bar, so a page's title can measure what covers it. */
export const MOBILE_HEADER = 'data-mobile-header';

const under = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`);

/** The tab for this page; none for Notifications, which the bell opens. */
export function tabFor(pathname: string): MobileTab | null {
  if (pathname === '/') return 'today';
  if (under(pathname, '/clients')) return 'clients';
  if (under(pathname, '/ask')) return 'ask';
  if (under(pathname, '/reports')) return 'reports';
  if (MORE_PATHS.some((path) => under(pathname, path))) return 'more';
  return null;
}

/** Views of the reports page, which are tabs there rather than pages below it. */
const REPORT_VIEWS = new Set(['approved', 'questions', 'delivery']);

/**
 * The page a back button goes up to, and its name; null on a page the tab
 * bar reaches directly. Up, not back through history: a client's tabs are
 * views of one file, not a stack to step through.
 */
export function parentOf(
  pathname: string,
): { href: string; label: string } | null {
  const parts = pathname.split('/').filter(Boolean);
  const [section, id, tab, item] = parts;

  if (section === 'clients' && id) {
    const file = `/clients/${id}`;
    if (tab === 'tickets' && item) {
      return { href: `${file}/tickets`, label: 'Tickets' };
    }
    if (tab === 'users' && item) {
      return { href: `${file}/users`, label: 'Users' };
    }
    return { href: '/clients', label: 'Clients' };
  }
  if (section === 'reports' && id && !REPORT_VIEWS.has(id)) {
    return { href: '/reports', label: 'Reports' };
  }
  if (section === 'ask' && id) return { href: '/ask', label: 'Ask' };
  if (section === 'connections' && id) {
    return { href: '/connections', label: 'Connections' };
  }
  return null;
}
