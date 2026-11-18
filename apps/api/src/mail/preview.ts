/**
 * Writes every Dossier email, with sample details, to HTML files you can
 * open in a browser. After a build: `pnpm --filter @dossierhq/api
 * email:preview [folder]` (default: email-previews in the current folder).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderNotificationEmail } from '../notifications/email.js';
import { DOSSIER_LOGO, DOSSIER_LOGO_SRC } from './logo.js';
import {
  accountExistsEmail,
  passwordResetEmail,
  signUpEmail,
  staffInviteEmail,
  workspaceInviteEmail,
} from './templates.js';

const web = 'https://app.dossierhq.com';
const site = { workspaceName: 'Ghost Savvy IT', webUrl: web };
const token = 'Xq7mK2pR9vLw4nT8sB3cF6hJ1dG5aE0yU';

const emails: Record<string, { subject: string; html: string }> = {
  'confirm-email': signUpEmail({
    email: 'david@ghostsavvy.com',
    link: `${web}/verify-email?token=${token}`,
    hours: 24,
  }),
  'account-exists': accountExistsEmail({
    name: 'David Odinegun',
    email: 'david@ghostsavvy.com',
    signInUrl: `${web}/sign-in`,
    forgotUrl: `${web}/forgot-password`,
  }),
  'password-reset': passwordResetEmail({
    name: 'David Odinegun',
    email: 'david@ghostsavvy.com',
    link: `${web}/reset-password?token=${token}`,
  }),
  invite: workspaceInviteEmail({
    inviter: 'Ama Mensah',
    workspace: 'Ghost Savvy IT',
    role: 'a technician',
    link: `${web}/invite?token=${token}`,
    days: 7,
  }),
  'staff-invite': staffInviteEmail({
    inviter: 'Kareem Jackson',
    role: 'an admin',
    link: `https://admin.dossierhq.com/invite?token=${token}`,
    days: 7,
  }),
  'sync-stopped': renderNotificationEmail(
    {
      type: 'connection.failing',
      title: 'Fathom has stopped syncing',
      body: 'Its token expired on 3 Nov, so meetings after that date are missing from client files. Update its settings on Connections to start it again.',
      link: '/connections/fathom',
    },
    site,
  ),
  'report-not-sent': renderNotificationEmail(
    {
      type: 'report.delivery-failed',
      title: 'Harbour Dental’s weekly report couldn’t be sent',
      body: 'Postmark says the address bounced. It isn’t tried again by itself.',
      link: '/reports/harbour-dental-2026-10-26',
    },
    site,
  ),
  'reports-drafted': renderNotificationEmail(
    {
      type: 'reports.drafted',
      title: '5 weekly reports drafted for the week of 26 Oct',
      body: '2 need a closer look before they can be approved.',
      link: '/reports',
    },
    site,
  ),
  'locked-out': renderNotificationEmail(
    {
      type: 'security.locked-out',
      title: 'Signing in to your account is paused',
      body: 'Someone, maybe you, tried too many wrong passwords. Wait 15 minutes, or reset your password.',
      link: null,
    },
    site,
  ),
};

const folder = resolve(process.argv[2] ?? 'email-previews');
mkdirSync(folder, { recursive: true });
const inline = `data:${DOSSIER_LOGO.contentType};base64,${DOSSIER_LOGO.content}`;
for (const [name, email] of Object.entries(emails)) {
  writeFileSync(
    join(folder, `${name}.html`),
    email.html.replaceAll(DOSSIER_LOGO_SRC, inline),
  );
}
writeFileSync(
  join(folder, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Dossier emails</title><body style="font:15px/1.6 system-ui;margin:40px"><h1>Dossier emails</h1><ul>${Object.entries(
    emails,
  )
    .map(
      ([name, email]) =>
        `<li><a href="${name}.html">${name}</a>: ${email.subject}</li>`,
    )
    .join('')}</ul></body>`,
);
console.log(`Wrote ${Object.keys(emails).length} emails to ${folder}`);
