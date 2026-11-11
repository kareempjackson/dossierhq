/**
 * Addresses, thresholds and wording that the clients screens' browser
 * components share with lib/client-views. Nothing here imports a value from
 * @dossierhq/contracts, so using it in the browser doesn't ship the
 * contracts and zod with it.
 */

const at = (clientId: string) => `/clients/${encodeURIComponent(clientId)}`;

/** Where a ticket's page is: by its number, which is what people quote. */
export const ticketHref = (clientId: string, number: string) =>
  `${at(clientId)}/tickets/${encodeURIComponent(number)}`;

/** A meeting, opened on the client's Meetings tab. */
export const meetingHref = (clientId: string, meetingId: string) =>
  `${at(clientId)}/meetings?meeting=${encodeURIComponent(meetingId)}`;

/** Where a person's page is, under the client's Users tab. */
export const userHref = (clientId: string, userId: string) =>
  `${at(clientId)}/users/${encodeURIComponent(userId)}`;

/**
 * A person's id on the Users tab, from how they're named, as the API keys
 * them: lower-case letters and digits, without a title or an email's
 * domain. "Dr Helen Okoro" and `helen.okoro@…` are both `helenokoro`.
 */
export function personId(spelling: string): string | null {
  const key = (spelling.trim().split('@')[0] ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .replace(/^(?:dr|mr|mrs|ms|miss|mx|prof)\.?\s+/i, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  return key || null;
}

/** A renewal this close, or past, counts as "renewal soon". */
export const RENEWAL_SOON_DAYS = 60;

/** An open ticket with no update for longer than this is stuck. */
export const STUCK_AFTER_DAYS = 7;

/** "in 12 days", "tomorrow", "today", "3 days overdue". */
export function renewsIn(days: number): string {
  if (days < 0) return `${-days} ${days === -1 ? 'day' : 'days'} overdue`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** "a", "a and b", "a, b and c". */
export const andList = (items: string[]) =>
  items.length > 1
    ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
    : (items[0] ?? '');

/** "Priya Nair" → "PN", for an avatar. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
