/** The marketing site's links, shared by the header and the footer. */
export type NavLink = { href: string; label: string; detail?: string };

export const PRODUCT_LINKS: NavLink[] = [
  {
    href: '/welcome#tickets',
    label: 'Ticket context',
    detail: 'Every ticket read, start to finish',
  },
  {
    href: '/welcome#report',
    label: 'Client reports',
    detail: 'For their leadership or their technicians',
  },
  {
    href: '/welcome#morning',
    label: 'Needs attention',
    detail: 'What needs you, across every client',
  },
  {
    href: '/welcome#cite',
    label: 'Ask Dossier',
    detail: 'Answers that cite their sources',
  },
  {
    href: '/welcome#folder',
    label: 'Client file',
    detail: 'Everything about a client, in one place',
  },
  {
    href: '/welcome#how-it-works',
    label: 'Connections',
    detail: 'NinjaOne, Hudu, SharePoint and Fathom, read-only',
  },
];
