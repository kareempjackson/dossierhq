/** The marketing site's links, shared by the header and the footer. */
export type NavLink = { href: string; label: string; detail?: string };

export const PRODUCT_LINKS: NavLink[] = [
  {
    href: '/welcome#folder',
    label: 'Client file',
    detail: 'Everything about a client, in one place',
  },
  {
    href: '/welcome#cite',
    label: 'Ask Dossier',
    detail: 'Questions answered from the records',
  },
  {
    href: '/welcome#report',
    label: 'Weekly reports',
    detail: 'Drafted every Monday, sent once approved',
  },
  {
    href: '/welcome#connect',
    label: 'Connections',
    detail: 'NinjaOne, Hudu, SharePoint and Fathom',
  },
  {
    href: '/welcome#how-it-works',
    label: 'Audit log',
    detail: 'Every read, written down',
  },
];

export const RESOURCE_LINKS: NavLink[] = [
  { href: '/security', label: 'Security' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/help', label: 'Help centre' },
  { href: '/status', label: 'Status' },
];
