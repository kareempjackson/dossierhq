/** Mail services anyone can use: their domain says nothing about a company. */
const PERSONAL_DOMAINS = new Set([
  'aol.com',
  'gmail.com',
  'googlemail.com',
  'hey.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'mac.com',
  'me.com',
  'msn.com',
  'outlook.com',
  'pm.me',
  'proton.me',
  'protonmail.com',
  'yahoo.com',
  'zoho.com',
]);

const capitalise = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1);

/**
 * A name to start from until onboarding asks for theirs: "rae.kim@…" is
 * "Rae Kim".
 */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0]?.split('+')[0] ?? '';
  const words = local
    .split(/[._-]+/)
    .filter((word) => /[a-z]/i.test(word))
    .map((word) => capitalise(word.toLowerCase()));
  return words.join(' ').slice(0, 100) || 'New member';
}

/**
 * The company's domain when the address is at one, e.g. "kestrel.io" for
 * "rae@mail.kestrel.io"; null for personal mail services.
 */
export function companyDomain(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (!domain.includes('.') || PERSONAL_DOMAINS.has(domain)) return null;
  const labels = domain.split('.');
  // Keep "acme.co.uk" whole, but drop "mail." from "mail.kestrel.io".
  const keep = /^(co|com|org|net|ac|gov)$/.test(labels.at(-2) ?? '') ? 3 : 2;
  return labels.slice(-keep).join('.');
}

/** A workspace name to start from until onboarding asks: "Kestrel" for kestrel.io. */
export function workspaceNameFromEmail(email: string): string {
  const domain = companyDomain(email);
  if (!domain) return 'My workspace';
  const name = domain.split('.')[0]!.split('-').map(capitalise).join(' ');
  return name.slice(0, 100);
}
