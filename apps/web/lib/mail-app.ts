import { resolveMx } from 'node:dns/promises';

export type MailApp = { name: string; href: string };

const GMAIL: MailApp = { name: 'Gmail', href: 'https://mail.google.com/' };
const OUTLOOK_WORK: MailApp = {
  name: 'Outlook',
  href: 'https://outlook.office.com/mail/',
};
const OUTLOOK_HOME: MailApp = {
  name: 'Outlook',
  href: 'https://outlook.live.com/mail/',
};

/** Addresses whose domain says it all. */
const KNOWN: Record<string, MailApp> = {
  'gmail.com': GMAIL,
  'googlemail.com': GMAIL,
  'outlook.com': OUTLOOK_HOME,
  'hotmail.com': OUTLOOK_HOME,
  'hotmail.co.uk': OUTLOOK_HOME,
  'live.com': OUTLOOK_HOME,
  'msn.com': OUTLOOK_HOME,
  'icloud.com': { name: 'iCloud Mail', href: 'https://www.icloud.com/mail' },
  'me.com': { name: 'iCloud Mail', href: 'https://www.icloud.com/mail' },
  'yahoo.com': { name: 'Yahoo Mail', href: 'https://mail.yahoo.com/' },
  'proton.me': { name: 'Proton Mail', href: 'https://mail.proton.me/' },
  'protonmail.com': { name: 'Proton Mail', href: 'https://mail.proton.me/' },
};

/**
 * Where to read mail for an address, or null. Most MSPs use Google Workspace
 * or Microsoft 365 on their own domain, so other domains are told apart by
 * their mail servers. Gives up after a second and a half.
 */
export async function mailAppFor(email: string): Promise<MailApp | null> {
  const domain = email.split('@').pop()?.trim().toLowerCase();
  if (!domain) return null;
  if (KNOWN[domain]) return KNOWN[domain];
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 1500),
      ),
    ]);
    const hosts = records.map((record) => record.exchange.toLowerCase());
    if (
      hosts.some(
        (host) =>
          host.endsWith('google.com') || host.endsWith('googlemail.com'),
      )
    ) {
      return GMAIL;
    }
    if (hosts.some((host) => host.endsWith('outlook.com'))) return OUTLOOK_WORK;
  } catch {}
  return null;
}
