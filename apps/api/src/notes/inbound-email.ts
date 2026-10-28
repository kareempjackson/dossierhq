import { NOTE_MAX_LENGTH } from '@dossierhq/contracts';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { domainOf } from '../integrations/ids.js';

const addressSchema = z.object({
  Email: z.string(),
  Name: z.string().nullish(),
  /** What came after a + in the address, e.g. a workspace's token. */
  MailboxHash: z.string().nullish(),
});

/** The parts of Postmark's inbound webhook Dossier reads; the rest is ignored. */
export const postmarkInboundSchema = z.object({
  FromFull: addressSchema,
  ToFull: z.array(addressSchema).nullish(),
  CcFull: z.array(addressSchema).nullish(),
  OriginalRecipient: z.string().nullish(),
  MailboxHash: z.string().nullish(),
  Subject: z.string().nullish(),
  /** When it was sent, as the email's Date header has it. */
  Date: z.string().nullish(),
  TextBody: z.string().nullish(),
  HtmlBody: z.string().nullish(),
});
export type PostmarkInbound = z.infer<typeof postmarkInboundSchema>;

/** The shape of the token in a workspace's address. */
const TOKEN = /^[a-z0-9]{16,64}$/;

/**
 * True when a request carries the webhook's token as its Basic password,
 * as Postmark sends it from `https://postmark:<token>@…`.
 */
export function webhookAuthorized(
  header: string | undefined,
  token: string,
): boolean {
  const [scheme, encoded] = (header ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const password = decoded.slice(decoded.indexOf(':') + 1);
  // Hashed first, so the comparison takes as long whatever the length.
  const digest = (text: string) => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(password), digest(token));
}

/** The workspace token after the + in the address the email went to. */
export function inboxTokenOf(email: PostmarkInbound): string | null {
  const recipients = [...(email.ToFull ?? []), ...(email.CcFull ?? [])];
  const plus = (address: string | null | undefined) =>
    address?.split('@')[0]?.split('+')[1];
  const candidates = [
    email.MailboxHash,
    ...recipients.map((r) => r.MailboxHash),
    plus(email.OriginalRecipient),
    ...recipients.map((r) => plus(r.Email)),
  ];
  return (
    candidates
      .map((candidate) => candidate?.trim().toLowerCase())
      .find((candidate) => candidate && TOKEN.test(candidate)) ?? null
  );
}

/** The subject without its Fwd: and Re: prefixes, or "Forwarded notes". */
export function titleOf(subject: string | null | undefined): string {
  let title = (subject ?? '').trim();
  for (;;) {
    const bare = title.replace(/^(fwd?|fw|re)\s*:\s*/i, '');
    if (bare === title) break;
    title = bare;
  }
  return title.slice(0, 200).trim() || 'Forwarded notes';
}

/**
 * The email's words: its plain text, or its HTML made plain, tidied and cut
 * to the longest notes can be. Empty when it has none.
 */
export function bodyOf(email: PostmarkInbound): string {
  const text = email.TextBody?.trim()
    ? email.TextBody
    : plainText(email.HtmlBody ?? '');
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, NOTE_MAX_LENGTH)
    .trim();
}

/** HTML as plain text, for email with no plain part. */
function plainText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '’')
    .replace(/&amp;/g, '&');
}

/** The day it was sent in the workspace's time zone, else today there. */
export function dayOf(
  date: string | null | undefined,
  timeZone: string,
  now: Date,
): string {
  const sent = date ? new Date(date) : now;
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(Number.isNaN(sent.getTime()) ? now : sent);
}

/**
 * Every email domain the email mentions: its recipients, and addresses in
 * its text, such as the people on a forwarded thread.
 */
export function domainsIn(email: PostmarkInbound): string[] {
  const addresses = [...(email.ToFull ?? []), ...(email.CcFull ?? [])].map(
    (r) => r.Email,
  );
  const text = `${email.TextBody ?? ''}\n${email.HtmlBody ?? ''}`;
  for (const match of text.matchAll(/[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g)) {
    addresses.push(match[0]);
  }
  return [
    ...new Set(
      addresses.map((a) => domainOf(a)).filter((d): d is string => d !== null),
    ),
  ];
}
