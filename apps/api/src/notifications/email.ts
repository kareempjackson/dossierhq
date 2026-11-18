import { renderLayout } from '../mail/layout.js';
import { DOSSIER_LOGO } from '../mail/logo.js';
import type { MailAttachment } from '../mail/mailer.js';
import type { Described } from './describe.js';

export type NotificationEmail = {
  subject: string;
  text: string;
  html: string;
  attachments: MailAttachment[];
};

type Look = { eyebrow: string; action: (title: string) => string };

const open = (label: string) => () => label;

/** The label over each kind of notification, and what its button says. */
const LOOKS: Record<string, Look> = {
  'connection.failing': {
    eyebrow: 'Sync stopped',
    // "Fathom has stopped syncing" → "Reconnect Fathom".
    action: (title) => {
      const tool = /^(.+?) has stopped syncing$/.exec(title)?.[1];
      return tool ? `Reconnect ${tool}` : 'Open Connections';
    },
  },
  'connection.recovered': {
    eyebrow: 'Syncing again',
    action: open('Open Connections'),
  },
  'reports.drafted': {
    eyebrow: 'Weekly reports',
    action: open('Review the reports'),
  },
  'report.sent': { eyebrow: 'Report sent', action: open('Open the report') },
  'report.delivery-failed': {
    eyebrow: 'Report not sent',
    action: open('Open the report'),
  },
  'report.no-recipients': {
    eyebrow: 'Report waiting',
    action: open('Add recipients'),
  },
  'member.joined': { eyebrow: 'People', action: open('See who’s in') },
  'member.role-changed': { eyebrow: 'People', action: open('See who’s in') },
  'member.removed': { eyebrow: 'People', action: open('See who’s in') },
  'security.two-factor-off': {
    eyebrow: 'Your sign-in',
    action: open('Open your account'),
  },
  'security.password-reset': {
    eyebrow: 'Your sign-in',
    action: open('Open your account'),
  },
  'security.recovery-code-used': {
    eyebrow: 'Your sign-in',
    action: open('Open your account'),
  },
  'security.locked-out': {
    eyebrow: 'Your sign-in',
    action: open('Open your account'),
  },
  'intelligence.drafted': {
    eyebrow: 'Intelligence',
    action: open('See what’s new'),
  },
  'intelligence.failed': {
    eyebrow: 'Drafting failed',
    action: open('Open Intelligence'),
  },
};

const sentence = (title: string) =>
  /[.!?]$/.test(title) ? title : `${title}.`;

/**
 * A notification as an email: what happened, a button to the page about
 * it, and where to choose which emails Dossier sends.
 */
export function renderNotificationEmail(
  described: Described & { type?: string },
  { workspaceName, webUrl }: { workspaceName: string; webUrl: string },
): NotificationEmail {
  const link = described.link ? new URL(described.link, webUrl).href : null;
  const settings = new URL('/settings#notifications', webUrl).href;
  const footer = `You get this as part of ${workspaceName} on Dossier. Choose what Dossier emails you in Settings: ${settings}`;
  const look = (described.type && LOOKS[described.type]) || {
    eyebrow: 'Notification',
    action: open('Open in Dossier'),
  };

  const text = [
    described.title,
    ...(described.body ? ['', described.body] : []),
    ...(link ? ['', `Open in Dossier: ${link}`] : []),
    '',
    '—',
    footer,
  ].join('\n');

  const html = renderLayout({
    eyebrow: look.eyebrow,
    title: sentence(described.title),
    paragraphs: described.body ? [described.body] : [],
    action: link
      ? { label: look.action(described.title), url: link, tone: 'ink' }
      : undefined,
    reason: `You’re getting this as part of ${workspaceName} on Dossier.`,
    reasonLink: { label: 'Choose what Dossier emails you', url: settings },
  });

  return { subject: described.title, text, html, attachments: [DOSSIER_LOGO] };
}
