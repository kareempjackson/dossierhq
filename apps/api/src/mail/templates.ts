import { renderLayout } from './layout.js';
import { DOSSIER_LOGO } from './logo.js';
import type { MailAttachment } from './mailer.js';

/**
 * The emails Dossier sends about getting in: confirming a sign-up, an
 * address that already has an account, resetting a password, and invites.
 * Each has the plain text it always had and the HTML of the email layout.
 */
export type DossierEmail = {
  subject: string;
  text: string;
  html: string;
  attachments: MailAttachment[];
};

const withLogo = (email: Omit<DossierEmail, 'attachments'>): DossierEmail => ({
  ...email,
  attachments: [DOSSIER_LOGO],
});

/** "24 hours", "1 hour", "7 days". */
const span = (count: number, unit: 'hour' | 'day') =>
  `${count} ${unit}${count === 1 ? '' : 's'}`;

export function signUpEmail({
  email,
  link,
  hours,
}: {
  email: string;
  link: string;
  hours: number;
}): DossierEmail {
  return withLogo({
    subject: 'Confirm your email for Dossier',
    text: [
      'Hi,',
      '',
      `To finish creating your Dossier account for ${email}, confirm your email by opening this link within the next ${hours} hours:`,
      '',
      link,
      '',
      'Dossier will then help you set up your workspace. It takes about five minutes.',
      '',
      'If you didn’t sign up for Dossier, ignore this email. Without the link, no account is made.',
    ].join('\n'),
    html: renderLayout({
      eyebrow: 'Confirm your email',
      title: 'One more click and your account is ready.',
      paragraphs: [
        `Confirm that ${email} is yours, and Dossier will walk you through setting up your workspace. The link works for ${span(hours, 'hour')}.`,
      ],
      action: { label: 'Confirm email', url: link, tone: 'act' },
      reason:
        'You’re getting this because someone signed up for Dossier with this address. If it wasn’t you, ignore it: without the link, no account is made.',
    }),
  });
}

export function accountExistsEmail({
  name,
  email,
  signInUrl,
  forgotUrl,
}: {
  name: string;
  email: string;
  signInUrl: string;
  forgotUrl: string;
}): DossierEmail {
  return withLogo({
    subject: 'You already have a Dossier account',
    text: [
      `Hi ${name},`,
      '',
      `Someone, hopefully you, tried to sign up for Dossier with ${email}. That email already has an account, so no new one was made.`,
      '',
      `Sign in: ${signInUrl}`,
      `Forgotten your password? ${forgotUrl}`,
      '',
      'If it wasn’t you, nothing has changed and you can ignore this email.',
    ].join('\n'),
    html: renderLayout({
      eyebrow: 'Already signed up',
      title: 'You already have a Dossier account.',
      paragraphs: [
        `Someone, hopefully you, tried to sign up with ${email}. That address already has an account, so no new one was made.`,
      ],
      action: { label: 'Sign in', url: signInUrl, tone: 'act' },
      links: [
        {
          lead: 'Forgotten your password?',
          label: 'Choose a new one',
          url: forgotUrl,
        },
      ],
      reason:
        'You’re getting this because someone tried to sign up with this address. If it wasn’t you, nothing has changed.',
    }),
  });
}

export function passwordResetEmail({
  name,
  email,
  link,
}: {
  name: string;
  email: string;
  link: string;
}): DossierEmail {
  return withLogo({
    subject: 'Reset your Dossier password',
    text: [
      `Hi ${name},`,
      '',
      `Someone asked to reset the password for your Dossier account (${email}). To choose a new one, open this link within the next hour:`,
      '',
      link,
      '',
      'The link works once, and signs you out of Dossier everywhere else. If you didn’t ask for it, ignore this email: your password stays as it is.',
    ].join('\n'),
    html: renderLayout({
      eyebrow: 'Reset your password',
      title: 'Choose a new password.',
      paragraphs: [
        `Someone asked to reset the password for ${email}. The link works once, for the next hour, and signs you out of Dossier everywhere else.`,
      ],
      action: { label: 'Choose a new password', url: link, tone: 'act' },
      reason:
        'You’re getting this because someone asked to reset your password. If it wasn’t you, ignore it: your password stays as it is.',
    }),
  });
}

export function workspaceInviteEmail({
  inviter,
  workspace,
  role,
  link,
  days,
}: {
  inviter: string;
  workspace: string;
  /** "an admin", "a technician". */
  role: string;
  link: string;
  days: number;
}): DossierEmail {
  return withLogo({
    subject: `${inviter} invited you to ${workspace} on Dossier`,
    text: [
      'Hi,',
      '',
      `${inviter} invited you to join ${workspace} on Dossier as ${role}. Dossier shows what needs attention at each of your clients, and drafts their weekly reports.`,
      '',
      `To join, open this link within ${days} days and choose a password:`,
      '',
      link,
      '',
      `If you weren’t expecting this, ignore it, or reply to ask ${inviter} about it.`,
    ].join('\n'),
    html: renderLayout({
      eyebrow: 'You’re invited',
      title: `${inviter} invited you to ${workspace}.`,
      paragraphs: [
        `Join as ${role}. Dossier shows what needs attention at each of your clients, and drafts their weekly reports.`,
        `Choose a password to start. The link works for ${span(days, 'day')}.`,
      ],
      action: { label: `Join ${workspace}`, url: link, tone: 'act' },
      reason: `You’re getting this because ${inviter} invited you. If you weren’t expecting it, ignore it, or reply to ask them.`,
    }),
  });
}

export function staffInviteEmail({
  inviter,
  role,
  link,
  days,
}: {
  inviter: string;
  /** "an admin", "support". */
  role: string;
  link: string;
  days: number;
}): DossierEmail {
  return withLogo({
    subject: `${inviter} invited you to Dossier Admin`,
    text: [
      'Hi,',
      '',
      `${inviter} invited you to join Dossier's staff as ${role}. Dossier Admin is where the team looks after every workspace on Dossier.`,
      '',
      `To join, open this link within ${days} days. You'll choose a password and add Dossier Admin to an authenticator app:`,
      '',
      link,
      '',
      `If you weren’t expecting this, ignore it, or reply to ask ${inviter} about it.`,
    ].join('\n'),
    html: renderLayout({
      eyebrow: 'Dossier Admin',
      title: `${inviter} invited you to Dossier Admin.`,
      paragraphs: [
        `Join as ${role}. Dossier Admin is where the team looks after every workspace on Dossier.`,
        `You’ll choose a password and add Dossier Admin to an authenticator app. The link works for ${span(days, 'day')}.`,
      ],
      action: { label: 'Join Dossier Admin', url: link, tone: 'act' },
      reason: `You’re getting this because ${inviter} invited you to Dossier’s staff. If you weren’t expecting it, ignore it, or reply to ask them.`,
    }),
  });
}
