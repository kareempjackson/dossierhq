import { createHash } from 'node:crypto';

const digest = (parts: (string | number)[]) =>
  createHash('sha256').update(parts.map(String).join('\u001f'));

/** A short, stable hash of the parts, for record IDs. */
export const stableHash = (...parts: (string | number)[]) =>
  digest(parts).digest('base64url').slice(0, 16);

/** Lowercase hex, for IDs that appear in URLs. */
export const shortHex = (...parts: (string | number)[]) =>
  digest(parts).digest('hex').slice(0, 6);

const stripMarks = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** `Harbour Dental Ltd.` → `harbour-dental-ltd`. */
export function slugify(name: string): string {
  const slug = stripMarks(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'client';
}

const LEGAL_SUFFIXES = new Set([
  'ltd',
  'limited',
  'llc',
  'llp',
  'lp',
  'inc',
  'incorporated',
  'plc',
  'co',
  'company',
  'corp',
  'corporation',
  'pty',
  'gmbh',
  'bv',
  'sa',
  'sarl',
  'ag',
]);

/**
 * How names are compared across tools: `The Harbour Dental Co. Ltd` and
 * `harbour dental` are the same client.
 */
export function normalizeName(name: string): string {
  const words = stripMarks(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words[0] === 'the' && words.length > 1) words.shift();
  while (words.length > 1 && LEGAL_SUFFIXES.has(words.at(-1)!)) words.pop();
  return words.join(' ');
}

/** `https://www.harbourdental.co.uk/contact` → `harbourdental.co.uk`. */
export function domainOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  if (text.includes('@')) return domainOf(text.split('@').pop());
  try {
    const host = new URL(
      /^[a-z]+:\/\//i.test(text) ? text : `https://${text}`,
    ).hostname
      .toLowerCase()
      .replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

/** One line, at most `max` characters. */
export function oneLine(text: string, max = 160): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

/** Epoch seconds (or milliseconds) to ISO. */
export function fromEpoch(value: number): string {
  return new Date(value > 1e12 ? value : value * 1000).toISOString();
}

/** `2026-11-12` → `12 Nov`, or `12 Nov 2027` outside the current year. */
export function formatDay(date: string, now: Date): string {
  const day = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(day.getUTCFullYear() !== now.getUTCFullYear() && { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(day);
}

export const DAY_MS = 86_400_000;
