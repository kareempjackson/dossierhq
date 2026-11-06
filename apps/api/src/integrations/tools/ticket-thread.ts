import type {
  Ticket,
  TicketEntry,
  TicketPerson,
  TicketSide,
} from '@dossierhq/contracts';
import { personKey } from '../../clients/person-key.js';
import { fromEpoch } from '../ids.js';
import { redact } from '../redact.js';

/**
 * Reading a ticket's log as a conversation between people.
 *
 * Many clients send IT email to a shared mailbox, e.g. `itsupport@…`, that
 * forwards each message into the ticketing tool. The tool then names the
 * mailbox as the requester of every ticket, and the ticket's description is
 * the forwarded email: the latest message, quoting every one before it. So
 * the people, and the conversation, are inside the description's email
 * headers. This reads them out: each message of the thread becomes an entry,
 * and whoever sent the first message started it. Technicians often reply
 * from the same mailbox, signing their name; a reply signed by one is theirs.
 */

/** Enough for a long email; what quotes or cites one cuts it shorter. */
export const ENTRY_CHARS = 4_000;

/** Someone named in an email header. */
export type Address = { name: string | null; email: string | null };

/** One email in the thread a ticket was raised with. */
export type ThreadMessage = {
  from: Address;
  to: Address[];
  cc: Address[];
  /** When it was sent, as written: no zone unless the header gave one. */
  sent: HeaderTime | null;
  body: string;
};

/** A header's time as written, as if UTC, and its zone when the header says. */
export type HeaderTime = { wall: number; offsetMinutes: number | null };

/** A technician, end user or contact in the tool's directory. */
export type DirectoryPerson = {
  name: string;
  email: string | null;
  type: 'TECHNICIAN' | 'END_USER' | 'CONTACT' | null;
};

/** One entry of the tool's log, as much of it as reading needs. */
export type RawLogEntry = {
  id?: number | string | null;
  type?: string | null;
  body?: string | null;
  htmlBody?: string | null;
  publicEntry?: boolean | null;
  system?: boolean | null;
  createTime?: number | null;
  appUserContactUid?: string | null;
  appUserContactType?: string | null;
};

/**
 * Shared mailboxes and mailing lists: no one person writes as them, so they
 * are never anyone on a ticket. `itsupport`, `helpdesk`, `bpi_team`.
 */
export const SHARED_MAILBOX =
  /^(?:it|it[-_.]?support|support|help[-_.]?desk|service[-_.]?desk|admin|administrator|info|office|reception|accounts?|billing|finance|hr|comms|communications|marketing|sales|hello|contact|enquiries)$|(?:^|[-_.])(?:team|group|all|staff|everyone|list)(?:$|[-_.])/i;

/** Mail no person sends: notifications, bounces, reports, automations. */
const AUTOMATED_LOCAL =
  /^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply)|^(?:mailer[-_.]?daemon|postmaster|notifications?|notify|alerts?|bounces?|dmarc\w*|workflows?|automations?|newsletters?)$|[-_.]no[-_.]?reply$/i;

/** Webmail and consumer addresses: their domain says nothing about a company. */
const PUBLIC_MAIL = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
]);

/** Bulk mail comes from a subdomain for it: `learn.mail.monday.com`. */
const AUTOMATED_DOMAIN =
  /(?:^|\.)(?:mail|email|e|em|news|newsletters?|marketing|learn|notify|notifications?|bounces?|campaigns?|mailer)(?:\.[^.]+){2,}$/i;

const localPart = (email: string) => email.split('@')[0] ?? '';
const domainPart = (email: string) => email.split('@')[1]?.toLowerCase() ?? '';

/** A shared mailbox or list, by address or, with no address, by name. */
export function isSharedMailbox(address: Address): boolean {
  const local = address.email
    ? localPart(address.email)
    : (address.name ?? '').trim().replace(/\s+/g, '');
  return local !== '' && SHARED_MAILBOX.test(local);
}

/** The same person: by address when both have one, else by name. */
function sameAddress(a: Address, b: Address): boolean {
  if (a.email && b.email) return a.email === b.email;
  const key = (x: Address) => personKey(x.name ?? x.email ?? '');
  return key(a) !== null && key(a) === key(b);
}

/** Mail sent by a system, not a person. */
export function isAutomated(address: Address): boolean {
  return (
    address.email !== null &&
    (AUTOMATED_LOCAL.test(localPart(address.email)) ||
      AUTOMATED_DOMAIN.test(domainPart(address.email)))
  );
}

// ---------------------------------------------------------------------------
// Plain text

/** HTML as plain text, for an entry that came only as HTML. */
export const plainText = (html: string) =>
  html
    .replace(/<\/(?:p|div)>/gi, '\n\n')
    .replace(/<(?:br|\/li)\b[^>]*>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, '\n________________________________\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** Where a reply's quoted email history starts. */
const QUOTED =
  /^(?:On\b.{5,200}\bwrote:|.*<[^>\s]+@[^>\s]+>\s*wrote:|-{2,}\s*Original Message\s*-{2,}|_{5,}|From:\s.+)$/i;

/**
 * Lines that are only an inline image's placeholder, or only the labels of
 * linked images, as a signature's `[LinkedIn] [Instagram]`.
 */
const IMAGE_LINE = /^(?:\[(?:cid:|image:?)[^\]]*\]|(?:\[[^\]]+\]\s*)+)$/i;

/** One blank line between paragraphs, none at the ends; secrets redacted. */
function tidy(lines: string[]): string {
  const kept: string[] = [];
  for (const line of lines) {
    if (IMAGE_LINE.test(line)) continue;
    if (!line && (kept.length === 0 || kept.at(-1) === '')) continue;
    kept.push(line);
  }
  while (kept.at(-1) === '') kept.pop();
  const text = redact(kept.join('\n'));
  return text.length <= ENTRY_CHARS
    ? text
    : `${text.slice(0, ENTRY_CHARS - 1).trimEnd()}…`;
}

/** Lines with spaces evened out, `<mailto:…>` noise and `>` quote marks gone. */
function lines(raw: string): string[] {
  return (
    raw
      .replace(/\r\n?/g, '\n')
      .replace(/[    ]/g, ' ')
      .replace(/<mailto:[^>\s]*>/gi, '')
      .replace(/\[mailto:[^\]\s]*\]/gi, '')
      // Outlook writes a link as its text and then `<https://…>`.
      .replace(/(\S)\s?<https?:\/\/[^>\s]*>/gi, '$1')
      .split('\n')
      .map((line) =>
        line
          .replace(/^(?:\s*>)+ ?/, '')
          .replace(/[ \t]+/g, ' ')
          .trim(),
      )
  );
}

/**
 * An entry's text, paragraphs kept so it can be shown whole, without the email
 * history a reply quotes, and with anything that looks like a password
 * redacted, so it's never stored. What quotes it puts it on one line.
 */
export function entryText(body: string): string {
  const kept: string[] = [];
  for (const line of body
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())) {
    if (kept.length > 0 && QUOTED.test(line)) break;
    if (line.startsWith('>')) continue;
    kept.push(line);
  }
  return tidy(kept);
}

// ---------------------------------------------------------------------------
// Email threads

const SEPARATOR = /^(?:_{8,}|-{2,}\s*(?:original|forwarded) message\s*-{2,})$/i;
/** `From: …`, `Sent: …`: a header line, by its key. */
const HEADER =
  /^(from|sent|date|to|cc|bcc|subject|when|where|importance|attachments|reply-to)\s*:\s*(.*)$/i;
/** The same without a colon, as some clients write under "Original Message". */
const BARE_HEADER = /^(from|sent|date|to|cc|subject)\s+(.*)$/i;
/** `On Thu, Aug 27, 2026 at 1:27 PM Linga M <linga@…> wrote:` */
const ON_WROTE =
  /^On\s+(.*?\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?)\s*,?\s*(.*?)\s*(?:<([^<>\s]+@[^<>\s]+)>)?\s*wrote:$/i;

/** "Smith, Jane" is "Jane Smith"; quotes go; an address isn't a name. */
function cleanName(raw: string | undefined): string | null {
  let name = (raw ?? '').replace(/^["'\s]+|["'\s]+$/g, '').trim();
  if (!name || name.includes('@')) return null;
  const parts = name.split(',').map((part) => part.trim());
  if (parts.length === 2 && parts.every((part) => /^[\p{L}'-]+$/u.test(part))) {
    name = `${parts[1]} ${parts[0]}`;
  }
  return name;
}

/** Everyone a header line names: `A <a@x>; "B" <b@x>`, `a@x`, or bare names. */
export function addresses(value: string): Address[] {
  const found: Address[] = [];
  const one = (part: string) => {
    const bracketed = /^(.*?)<([^<>\s]+@[^<>\s]+)>/.exec(part.trim());
    if (bracketed) {
      found.push({
        name: cleanName(bracketed[1]),
        email: bracketed[2]!.toLowerCase(),
      });
      return;
    }
    const bare = /[^\s<>;,"']+@[^\s<>;,"']+\.[a-z]{2,}/i.exec(part);
    if (bare) {
      found.push({ name: null, email: bare[0].toLowerCase() });
      return;
    }
    const name = cleanName(part);
    if (name) found.push({ name, email: null });
  };
  // Outlook separates with semicolons, so a name may hold a comma; others
  // separate with commas, and quote names that hold one.
  if (value.includes(';')) {
    for (const part of value.split(';')) one(part);
  } else {
    for (const match of value.matchAll(
      /("[^"]*"|[^,<>]*?)\s*<[^<>\s]+@[^<>\s]+>|[^\s<>,;"']+@[^\s<>,;"']+\.[a-z]{2,}|[^,]+/gi,
    )) {
      one(match[0]);
    }
  }
  const seen = new Set<string>();
  return found.filter((address) => {
    const key = address.email ?? address.name!.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/**
 * A header's date and time, in any of the ways mail clients write them:
 * `Monday, October 26, 2026 12:40:39 PM (UTC-04:00) …`,
 * `Thursday, 27 August 2026 at 22:24`, `Thu, Aug 27, 2026 at 1:27 PM`,
 * `1 Sep 2026, at 08:00`, `23/09/2026 12:37:58 PM`. Null when it can't tell.
 */
export function headerTime(text: string): HeaderTime | null {
  const t = text.replace(/\s+/g, ' ');
  let year: number;
  let month: number;
  let day: number;
  const named =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/i.exec(t);
  const yearMatch = /\b(20\d{2})\b/.exec(t);
  if (named && yearMatch) {
    month = MONTHS.indexOf(named[1]!.toLowerCase());
    const after = /^\s*(\d{1,2})\b(?![:.]\d)/.exec(
      t.slice(named.index + named[0].length),
    );
    const before = /\b(\d{1,2})\s*$/.exec(t.slice(0, named.index));
    day = Number(after?.[1] ?? before?.[1]);
    year = Number(yearMatch[1]);
  } else {
    const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/.exec(t);
    if (!numeric) return null;
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    // Day first, as most of the world writes it, unless it can't be.
    [day, month] = a <= 12 && b > 12 ? [b, a - 1] : [a, b - 1];
    year = Number(numeric[3]);
  }
  const time = /\b(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([ap])?\.?m?\.?/i.exec(
    t.replace(/\(?(?:UTC|GMT)\s*[+-]\s*\d{1,2}(?::?\d{2})?\)?/gi, ''),
  );
  let hours = Number(time?.[1] ?? 0);
  const ampm = time?.[4]?.toLowerCase();
  if (ampm === 'p' && hours < 12) hours += 12;
  if (ampm === 'a' && hours === 12) hours = 0;
  const wall = Date.UTC(
    year,
    month,
    day,
    hours,
    Number(time?.[2] ?? 0),
    Number(time?.[3] ?? 0),
  );
  if (
    !Number.isFinite(wall) ||
    month < 0 ||
    !(day >= 1 && day <= 31) ||
    hours > 23
  ) {
    return null;
  }
  const zone = /(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i.exec(t);
  const offsetMinutes = zone
    ? (zone[1] === '-' ? -1 : 1) * (Number(zone[2]) * 60 + Number(zone[3] ?? 0))
    : /\((?:UTC|GMT)\)/i.test(t)
      ? 0
      : null;
  return { wall, offsetMinutes };
}

/**
 * The email thread in a forwarded message: the text above the first header
 * (what the forwarder wrote, if anything), then each message, newest first,
 * as the email has them.
 */
export function emailThread(raw: string): {
  note: string;
  messages: ThreadMessage[];
} {
  const all = lines(raw);
  const messages: ThreadMessage[] = [];
  let body: string[] = [];
  const note: string[] = [];
  let current: ThreadMessage | null = null;
  let marked = false;

  const close = () => {
    if (current) current.body = tidy(body);
    else note.push(...body);
    body = [];
  };

  for (let i = 0; i < all.length; i++) {
    const line = all[i]!;
    if (SEPARATOR.test(line)) {
      marked = true;
      continue;
    }

    // `On … wrote:`, which mail clients may wrap over a few lines.
    if (/^On\s/i.test(line)) {
      let joined = line;
      let end = i;
      while (!/wrote:$/i.test(joined) && end < i + 3 && end + 1 < all.length) {
        end++;
        joined = `${joined} ${all[end]}`.trim();
      }
      // A wrap inside the address leaves `< ann@…>`.
      const wrote = ON_WROTE.exec(
        joined.replace(/<\s+/g, '<').replace(/\s+>/g, '>'),
      );
      if (wrote) {
        close();
        current = {
          from: {
            name: cleanName(wrote[2]),
            email: wrote[3]?.toLowerCase() ?? null,
          },
          to: [],
          cc: [],
          sent: headerTime(wrote[1]!),
          body: '',
        };
        messages.push(current);
        i = end;
        marked = false;
        continue;
      }
    }

    // A block of headers, starting with who it's from.
    const startsBlock =
      /^from\s*:/i.test(line) || (marked && /^from\s+\S/i.test(line));
    if (startsBlock) {
      const fields = new Map<string, string>();
      let end = i;
      for (; end < all.length; end++) {
        const header =
          HEADER.exec(all[end]!) ??
          (marked ? BARE_HEADER.exec(all[end]!) : null);
        if (!header) break;
        const key = header[1]!.toLowerCase();
        if (!fields.has(key)) fields.set(key, header[2]!.trim());
      }
      const from = fields.get('from');
      if (
        from !== undefined &&
        (fields.has('sent') ||
          fields.has('date') ||
          fields.has('to') ||
          fields.has('subject'))
      ) {
        close();
        const sender = addresses(from)[0] ?? {
          name: cleanName(from),
          email: null,
        };
        current = {
          from: sender,
          to: addresses(fields.get('to') ?? ''),
          cc: addresses(fields.get('cc') ?? ''),
          sent: headerTime(fields.get('sent') ?? fields.get('date') ?? ''),
          body: '',
        };
        messages.push(current);
        i = end - 1;
        marked = false;
        continue;
      }
    }
    marked = false;
    body.push(line);
  }
  close();
  return { note: tidy(note), messages };
}

// ---------------------------------------------------------------------------
// Who wrote what

const GREETING = /^(?:hi|hello|hey|dear|good (?:morning|afternoon|evening))\b/i;
const SIGN_OFF =
  /^(?:(?:best|kind|warm)?\s*(?:regards|wishes)|best|thanks|thank you|many thanks|cheers|sincerely|respectfully)[,!.]*\s*/i;

/** How far up from the end a sign-off is looked for, past a signature block. */
const SIGNATURE_LINES = 25;

/**
 * The technician who signed a reply sent from a shared mailbox, as
 * `Kind regards, / Giovanni` or `Giovanni Jno Baptiste` above the mailbox's
 * signature block; and the body cut after their name, without that block.
 */
export function signedBy(
  body: string,
  technicians: readonly DirectoryPerson[],
): { person: DirectoryPerson; body: string } | null {
  const firstNames = new Map<string, DirectoryPerson[]>();
  for (const tech of technicians) {
    const first = personKey(tech.name.split(/\s+/)[0] ?? '');
    if (first) firstNames.set(first, [...(firstNames.get(first) ?? []), tech]);
  }
  const all = body.split('\n');
  let looked = 0;
  for (let i = all.length - 1; i >= 0 && looked < SIGNATURE_LINES; i--) {
    const line = all[i]!.trim();
    if (!line) continue;
    looked++;
    if (GREETING.test(line)) continue;
    const words = line
      .replace(SIGN_OFF, '')
      .replace(/[,.!]+$/, '')
      .trim();
    if (!words || words.split(/\s+/).length > 4) continue;
    const key = personKey(words);
    if (!key) continue;
    const person =
      technicians.find((tech) => personKey(tech.name) === key) ??
      (firstNames.get(key)?.length === 1 ? firstNames.get(key)![0]! : null);
    if (person) {
      return { person, body: tidy(all.slice(0, i + 1)) };
    }
  }
  return null;
}

/** What a ticket's log says, read as a conversation. */
export type TicketRead = {
  entries: TicketEntry[];
  people: TicketPerson[];
  /** Numbers of the tickets a technician merged into this one. */
  merged: string[];
};

/** What reading a ticket's log needs besides the log. */
export type TicketReadContext = {
  /** The tool's people by UID. */
  directory: ReadonlyMap<string, DirectoryPerson>;
  /** The tool's people by its numeric ID, for the assignee. */
  directoryById?: ReadonlyMap<string, DirectoryPerson>;
  /** The ticket as the board has it. */
  ticket: {
    requester: string | null;
    assignedTo: string | null;
    updatedAt: string;
  };
  /** Domains the MSP's people write from, e.g. its technicians'. */
  mspDomains: ReadonlySet<string>;
};

const ID_SEP = ':';

/**
 * A ticket's log as a conversation, oldest first, and everyone on it. The
 * description of a ticket raised by email is split into its messages, and
 * whoever sent the first of them a person wrote started it. With no person,
 * the system whose mail it was did; with no email at all, the requester.
 */
export function readTicketLog(
  log: readonly RawLogEntry[],
  context: TicketReadContext,
): TicketRead {
  const { directory, ticket, mspDomains } = context;
  const technicians = [...directory.values()].filter(
    (person) => person.type === 'TECHNICIAN',
  );
  const directoryByEmail = new Map(
    [...directory.values()].flatMap((person) =>
      person.email ? [[person.email.toLowerCase(), person] as const] : [],
    ),
  );
  const directoryByKey = new Map(
    [...directory.values()].flatMap((person) => {
      const key = personKey(person.name);
      return key ? [[key, person] as const] : [];
    }),
  );
  const requester = ticket.requester
    ? (addresses(ticket.requester)[0] ?? null)
    : null;
  const mailbox = requester && isSharedMailbox(requester) ? requester : null;
  // The client's own domain: the mailbox's, when it's at a company domain.
  const clientDomains = new Set(
    [mailbox?.email]
      .flatMap((email) => (email ? [domainPart(email)] : []))
      .filter(
        (domain) =>
          domain && !PUBLIC_MAIL.has(domain) && !mspDomains.has(domain),
      ),
  );

  /** Directory entry for an address, by email, then by name. */
  const known = (address: Address) =>
    (address.email ? directoryByEmail.get(address.email) : undefined) ??
    (address.name
      ? directoryByKey.get(personKey(address.name) ?? '')
      : undefined);

  /** Mail no person wrote: a system's, or a list's at another company. */
  const automatedSender = (address: Address) => {
    if (isAutomated(address)) return true;
    if (!address.email || !isSharedMailbox(address)) return false;
    const domain = domainPart(address.email);
    return !clientDomains.has(domain) && !mspDomains.has(domain);
  };

  const sideOf = (address: Address): TicketSide => {
    const person = known(address);
    // "Kareem via monday.com <notifications@…>" is monday.com, not Kareem.
    if (automatedSender(address) && person?.email !== address.email) {
      return 'automated';
    }
    if (person?.type === 'TECHNICIAN') return 'msp';
    // NinjaOne's other people are end users and contacts: the client's.
    if (person) return 'client';
    if (automatedSender(address)) return 'automated';
    const domain = address.email ? domainPart(address.email) : '';
    if (clientDomains.has(domain)) return 'client';
    if (mspDomains.has(domain)) return 'msp';
    // Mail clients leave the address off people in the same company.
    if (!address.email && mailbox) return 'client';
    // Whoever the tool says asked, when that isn't a shared mailbox.
    if (requester && !mailbox && sameAddress(address, requester)) {
      return 'client';
    }
    return 'outside';
  };

  // Everyone, keyed by email (or by name when there's none), in the order met.
  type Found = TicketPerson & {
    order: number;
    names: string[];
    /** Their side rests on an address or the directory, not a bare name. */
    sure: boolean;
  };
  const found = new Map<string, Found>();
  const aliases = new Map<string, string>();
  let order = 0;
  let reporterSet = false;
  const add = (
    address: Address,
    role: TicketPerson['role'],
    via: TicketPerson['via'],
    internal: boolean,
    side = sideOf(address),
  ) => {
    if (side === 'automated' ? role !== 'reporter' : isSharedMailbox(address)) {
      return;
    }
    const person = side === 'automated' ? undefined : known(address);
    // A lone first name with no address could be anyone.
    if (
      !address.email &&
      !person &&
      (address.name ?? '').trim().split(/\s+/).length < 2
    ) {
      return;
    }
    const email = address.email ?? person?.email?.toLowerCase() ?? null;
    const nameKey = personKey(person?.name ?? address.name ?? '') ?? null;
    const key =
      (email && aliases.get(email)) ??
      (nameKey && aliases.get(nameKey)) ??
      email ??
      nameKey;
    if (!key) return;
    if (role === 'reporter') reporterSet = true;
    if (email) aliases.set(email, key);
    if (nameKey) aliases.set(nameKey, key);
    const names = [person?.name, address.name].filter((name): name is string =>
      Boolean(name),
    );
    const sure = Boolean(address.email || person);
    const before = found.get(key);
    if (before) {
      before.names.push(...names);
      before.email ??= email;
      before.internal &&= internal;
      if (role === 'reporter') before.role = 'reporter';
      // An address outweighs a bare name; else the likelier side wins.
      if (
        (sure && !before.sure) ||
        (sure === before.sure &&
          before.side === 'outside' &&
          side !== 'outside')
      ) {
        before.side = side;
      }
      before.sure ||= sure;
      return;
    }
    found.set(key, {
      name: '',
      names,
      email,
      side,
      role,
      via,
      internal,
      order: order++,
      sure,
    });
  };

  const entries: TicketEntry[] = [];
  /** The addresses behind each email's names, to name them as found. */
  const written = new Map<TicketEntry, { to: Address[]; cc: Address[] }>();
  const merged = new Set<string>();
  const emailsSeen = new Set<string>();
  let automatedStart: Address | null = null;

  const sorted = [...log].sort(
    (a, b) => (a.createTime ?? 0) - (b.createTime ?? 0),
  );
  for (const entry of sorted) {
    const type = entry.type?.toUpperCase();
    const at = entry.createTime
      ? fromEpoch(entry.createTime)
      : ticket.updatedAt;
    const author = entry.appUserContactUid
      ? directory.get(entry.appUserContactUid)
      : undefined;
    const authorAddress: Address | null = author
      ? { name: author.name, email: author.email?.toLowerCase() ?? null }
      : null;
    const isTech =
      entry.appUserContactType === 'TECHNICIAN' ||
      author?.type === 'TECHNICIAN';

    // Changes made in the tool: who worked it, though nothing's written.
    if (type === 'SAVE') {
      if (isTech && authorAddress) {
        add(authorAddress, 'involved', 'activity', true, 'msp');
      }
      continue;
    }
    if ((type !== 'DESCRIPTION' && type !== 'COMMENT') || entry.system) {
      continue;
    }

    const raw = entry.body?.trim()
      ? entry.body
      : plainText(entry.htmlBody ?? '');
    const id = entry.id != null ? String(entry.id) : null;
    const isPublic = entry.publicEntry === true;
    if (type === 'COMMENT' && /closed and merged into this ticket/i.test(raw)) {
      for (const [, number] of raw.matchAll(/#(\d+)/g)) merged.add(number!);
    }

    // A description, or mail forwarded in, is an email thread. A reply
    // someone wrote, in the tool or by email, is their own words: what it
    // quotes is already on the ticket.
    const thread =
      isTech || (type === 'COMMENT' && author) ? null : emailThread(raw);
    const expand =
      thread !== null &&
      thread.messages.length > 0 &&
      (type === 'DESCRIPTION' || !thread.note);
    if (!thread || !expand) {
      const text = entryText(raw);
      if (!text) continue;
      const fromRequester =
        !authorAddress && type === 'DESCRIPTION' && !mailbox ? requester : null;
      const address = authorAddress ?? fromRequester;
      const side = isTech ? 'msp' : address ? sideOf(address) : null;
      entries.push({
        id,
        at,
        author: address ? displayName(address, author?.name) : null,
        email: address?.email ?? null,
        side,
        via: null,
        kind: type === 'DESCRIPTION' ? 'description' : 'comment',
        public: isPublic,
        to: [],
        cc: [],
        text,
      });
      if (address) {
        const starts = type === 'DESCRIPTION' && !reporterSet;
        add(
          address,
          starts ? 'reporter' : 'involved',
          fromRequester ? 'requester' : 'author',
          !isPublic,
          side ?? undefined,
        );
      }
      continue;
    }

    // An email thread: oldest message first.
    const messages = [...thread.messages].reverse();
    const times = threadTimes(messages, entry.createTime ?? null);
    messages.forEach((message, index) => {
      const fromMailbox =
        isSharedMailbox(message.from) && !automatedSender(message.from);
      const signed = fromMailbox ? signedBy(message.body, technicians) : null;
      const sender: Address = signed
        ? {
            name: signed.person.name,
            email: signed.person.email?.toLowerCase() ?? null,
          }
        : message.from;
      const side: TicketSide = fromMailbox ? 'msp' : sideOf(sender);
      const body = signed?.body ?? message.body;
      const fingerprint = `${sender.email ?? sender.name}|${body.slice(0, 120)}`;
      if (emailsSeen.has(fingerprint)) return;
      emailsSeen.add(fingerprint);

      const first = type === 'DESCRIPTION' && index === 0;
      const email: TicketEntry = {
        id: id ? `${id}${ID_SEP}${index}` : null,
        at: times[index] ?? at,
        author: displayName(sender, known(sender)?.name),
        email: sender.email,
        side,
        via: fromMailbox
          ? (message.from.email ?? mailbox?.email ?? null)
          : first
            ? (mailbox?.email ?? null)
            : null,
        kind: first ? 'description' : 'email',
        public: true,
        to: [],
        cc: [],
        text: body,
      };
      entries.push(email);
      written.set(email, { to: message.to, cc: message.cc });

      // A person's message, or a signed one from the mailbox: the first
      // started it. An unsigned one from the mailbox is no one in particular.
      const byPerson =
        signed !== null || (!fromMailbox && side !== 'automated');
      if (byPerson) {
        add(
          sender,
          reporterSet ? 'involved' : 'reporter',
          'email',
          false,
          side,
        );
      } else if (side === 'automated') {
        automatedStart ??= message.from;
      }
      for (const recipient of [...message.to, ...message.cc]) {
        if (!automatedSender(recipient)) {
          add(recipient, 'involved', 'recipient', false);
        }
      }
    });

    // What was written above the quoted thread: a reply's own words, or a
    // note from whoever forwarded it.
    if (thread.note) {
      const address =
        authorAddress ??
        (type === 'DESCRIPTION' && !mailbox ? requester : null);
      entries.push({
        id: id ? `${id}${ID_SEP}note` : null,
        at,
        author: address ? displayName(address, author?.name) : null,
        email: address?.email ?? null,
        side: address ? sideOf(address) : null,
        via: type === 'DESCRIPTION' ? (mailbox?.email ?? null) : null,
        kind: type === 'DESCRIPTION' ? 'email' : 'comment',
        public: type === 'DESCRIPTION' || isPublic,
        to: [],
        cc: [],
        text: thread.note,
      });
      if (address) {
        add(address, 'involved', 'author', !isPublic && type !== 'DESCRIPTION');
      }
    }
  }

  // No person wrote it: the system whose mail it was started it, or else
  // whoever the tool says asked.
  if (!reporterSet && automatedStart) {
    add(automatedStart, 'reporter', 'email', false, 'automated');
  }
  if (!reporterSet && requester && !mailbox) {
    add(requester, 'reporter', 'requester', false);
  }
  if (ticket.assignedTo) {
    add(
      { name: ticket.assignedTo, email: null },
      'involved',
      'assignee',
      false,
      'msp',
    );
  }

  // The reporter first, then everyone in the order met; each by the fullest
  // name any header gave them.
  const named = new Map<string, string>();
  const people = [...found.entries()]
    .sort(
      ([, a], [, b]) =>
        Number(b.role === 'reporter') - Number(a.role === 'reporter') ||
        a.order - b.order,
    )
    .flatMap(
      ([
        key,
        { names, order: _order, sure: _sure, ...person },
      ]): TicketPerson[] => {
        const name =
          fullestName(names) ??
          (person.email ? spaced(localPart(person.email)) : '');
        if (!name) return [];
        named.set(key, name);
        return [{ ...person, name }];
      },
    );

  // Name everyone in the entries as they're named on the ticket, so
  // `kareem.jackson` reads as "Kareem Phillip-Jackson" wherever he appears.
  const nameOf = (address: Address) => {
    const key =
      (address.email && aliases.get(address.email)) ??
      aliases.get(personKey(known(address)?.name ?? address.name ?? '') ?? '');
    return (
      (key && named.get(key)) ?? displayName(address, known(address)?.name)
    );
  };
  for (const entry of entries) {
    if (entry.author && (entry.email || entry.side !== 'msp')) {
      entry.author = nameOf({ name: entry.author, email: entry.email });
    }
    const recipients = written.get(entry);
    if (recipients) {
      entry.to = recipients.to.map(nameOf);
      entry.cc = recipients.cc.map(nameOf);
    }
  }

  return {
    entries: entries.sort((a, b) => a.at.localeCompare(b.at)),
    people,
    merged: [...merged],
  };
}

/** A name to show for an address: the directory's, else the fullest written. */
function displayName(address: Address, directoryName?: string): string {
  return (
    directoryName ??
    address.name ??
    (address.email ? spaced(localPart(address.email)) : 'Someone')
  );
}

/** `kia.lewis` → "Kia Lewis"; a single word stays as it is. */
const spaced = (local: string) =>
  /[._]/.test(local)
    ? local
        .split(/[._]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : local;

/** The fullest spelling: one with a space and capitals over a handle. */
function fullestName(names: string[]): string | null {
  const score = (name: string) =>
    (name.includes(' ') ? 4 : 0) +
    (/\p{Lu}/u.test(name) ? 2 : 0) +
    (name.includes('.') ? 0 : 1) +
    name.length / 100;
  return names.reduce<string | null>(
    (best, name) => (best === null || score(name) > score(best) ? name : best),
    null,
  );
}

/**
 * When each message of a thread (oldest first) was sent, as ISO. A header
 * without a zone is written in the zone of whoever quoted it, which the
 * thread doesn't say. So it's read in the zone the newest header implies (it
 * was forwarded the moment it arrived, so its written time less the forward's
 * is its zone), and if that puts it after the reply that quoted it, it moves
 * back by whole hours until it's before. A time it can't read takes the
 * newer message's.
 */
function threadTimes(
  messages: ThreadMessage[],
  forwardedAt: number | null,
): (string | null)[] {
  const forwardMs = forwardedAt
    ? forwardedAt > 1e12
      ? forwardedAt
      : forwardedAt * 1000
    : null;
  const newest = messages.at(-1)?.sent;
  let zone = newest?.offsetMinutes ?? null;
  if (zone === null && newest && forwardMs !== null) {
    const minutes = Math.round((newest.wall - forwardMs) / 60_000 / 15) * 15;
    if (Math.abs(minutes) <= 14 * 60) zone = minutes;
  }
  const times: (number | null)[] = new Array(messages.length).fill(null);
  let limit = forwardMs ?? Infinity;
  for (let i = messages.length - 1; i >= 0; i--) {
    const sent = messages[i]!.sent;
    if (!sent) {
      times[i] = Number.isFinite(limit) ? limit : null;
      continue;
    }
    let ms = sent.wall - (sent.offsetMinutes ?? zone ?? 0) * 60_000;
    for (
      let hours = 0;
      sent.offsetMinutes === null && ms > limit && hours < 14;
      hours++
    ) {
      ms -= 3_600_000;
    }
    ms = Math.min(ms, limit);
    times[i] = ms;
    limit = ms;
  }
  return times.map((ms) => (ms === null ? null : new Date(ms).toISOString()));
}

/** Keys a name is known by: whole, and its first and last word. */
function nameKeys(name: string | null): string[] {
  if (!name) return [];
  const words = name.trim().split(/\s+/);
  return [
    ...new Set(
      [
        personKey(name),
        words.length > 2 ? personKey(`${words[0]} ${words.at(-1)}`) : null,
      ].filter((key): key is string => Boolean(key)),
    ),
  ];
}

const isFullName = (name: string) => /\S\s+\S/.test(name.trim());

const MERGED = /closed and merged into this ticket/i;

/** How a client's tickets name and place their people, all together. */
type ClientNames = {
  byEmail: Map<string, string[]>;
  emailByKey: Map<string, string>;
  byKey: Map<string, string[]>;
  /** The client's own mail domains: those its shared mailboxes are at. */
  domains: Set<string>;
  /** Names that write from the client's domain, and from another company's. */
  clientKeys: Set<string>;
  outsideKeys: Set<string>;
};

const domainOf = (email: string | null) =>
  email ? (email.split('@')[1]?.toLowerCase() ?? '') : '';

/** The fullest name a person goes by, from their address or name. */
function canonicalName(
  names: ClientNames,
  name: string,
  email: string | null,
): string {
  const key = personKey(name) ?? '';
  // "Linga Kalinde Mangachi" goes by "Linga Mangachi" when others do.
  const short = nameKeys(name).find(
    (other) => other !== key && names.byKey.has(other),
  );
  if (short) return fullestName(names.byKey.get(short)!) ?? name;
  const address = email ?? names.emailByKey.get(key);
  return (
    fullestName([
      name,
      ...((address && names.byEmail.get(address)) ?? []),
      ...(names.byKey.get(key) ?? []),
    ]) ?? name
  );
}

/**
 * What one ticket can't tell alone, from all of a client's:
 * - each person by the fullest name any ticket gives them, so `matilda` on
 *   one is "Matilda Ibeh" on all, and `rochelleking@…` is "Rochelle King";
 * - whose side they're on, by addresses alone, so the answer is the same
 *   however often it's worked out: an address at the client's own domain is
 *   the client's, and so is a personal address or bare name that goes by the
 *   name of someone who writes from it, as Kurt from Gmail; a bare name that
 *   only ever writes from another company is that company's;
 * - a ticket a technician merged into another says which;
 * - a read ticket's requester is the person who started it.
 */
export function reconcileTickets(tickets: Ticket[]): Ticket[] {
  const clients = new Map<string, ClientNames>();
  const namesOf = (clientId: string) => {
    let names = clients.get(clientId);
    if (!names) {
      names = {
        byEmail: new Map(),
        emailByKey: new Map(),
        byKey: new Map(),
        domains: new Set(),
        clientKeys: new Set(),
        outsideKeys: new Set(),
      };
      clients.set(clientId, names);
    }
    return names;
  };
  const mergedInto = new Map<string, string>();
  for (const ticket of tickets) {
    const names = namesOf(ticket.clientId);
    for (const person of ticket.people) {
      if (person.side === 'automated') continue;
      const key = personKey(person.name);
      if (person.email) {
        names.byEmail.set(person.email, [
          ...(names.byEmail.get(person.email) ?? []),
          person.name,
        ]);
        if (key) names.emailByKey.set(key, person.email);
      }
      if (key && isFullName(person.name)) {
        names.byKey.set(key, [...(names.byKey.get(key) ?? []), person.name]);
      }
    }
    for (const entry of ticket.entries) {
      if (entry.kind === 'description' && entry.via) {
        const domain = domainOf(entry.via);
        if (domain && !PUBLIC_MAIL.has(domain)) names.domains.add(domain);
      }
      if (entry.kind !== 'comment' || !MERGED.test(entry.text)) continue;
      for (const [, number] of entry.text.matchAll(/#(\d+)/g)) {
        if (number !== ticket.number) mergedInto.set(number!, ticket.number);
      }
    }
  }
  // Who writes from where: facts about addresses, never a side worked out.
  for (const ticket of tickets) {
    const names = namesOf(ticket.clientId);
    for (const person of ticket.people) {
      if (!person.email || person.side === 'msp') continue;
      if (person.side === 'automated') continue;
      const name = canonicalName(names, person.name, person.email);
      if (!isFullName(name)) continue;
      const domain = domainOf(person.email);
      const keys = names.domains.has(domain)
        ? names.clientKeys
        : PUBLIC_MAIL.has(domain)
          ? null
          : names.outsideKeys;
      for (const key of nameKeys(name)) keys?.add(key);
    }
  }

  return tickets.map((ticket) => {
    const names = namesOf(ticket.clientId);
    const within = (keys: Set<string>, name: string) =>
      isFullName(name) && nameKeys(name).some((key) => keys.has(key));
    /** Their side, from what every ticket's addresses say. */
    const sideFor = <S extends TicketSide | null>(
      side: S,
      name: string | null,
      email: string | null,
    ): S | 'client' | 'outside' => {
      if (name === null || side === 'msp' || side === 'automated') return side;
      const domain = domainOf(email);
      if (names.domains.has(domain)) return 'client';
      const personal = !email || PUBLIC_MAIL.has(domain);
      if (personal && within(names.clientKeys, name)) return 'client';
      if (!email && within(names.outsideKeys, name)) return 'outside';
      // Another company's address, once the client's own domain is known.
      if (email && !personal && names.domains.size > 0) return 'outside';
      return side;
    };

    // People, renamed, then one each: a ticket can meet the same person
    // under two addresses.
    const people: TicketPerson[] = [];
    for (const person of ticket.people) {
      const name =
        person.side === 'automated'
          ? person.name
          : canonicalName(names, person.name, person.email);
      const side = sideFor(person.side, name, person.email);
      const same = people.find(
        (p) => p.name === name && p.side !== 'automated',
      );
      if (same) {
        same.internal &&= person.internal;
        same.email ??= person.email;
        continue;
      }
      people.push({ ...person, name, side });
    }
    const entries = ticket.entries.map((entry) => {
      const author =
        entry.author && entry.side !== 'automated'
          ? canonicalName(names, entry.author, entry.email)
          : entry.author;
      return {
        ...entry,
        author,
        side: sideFor(entry.side, author, entry.email),
        to: entry.to.map((to) => canonicalName(names, to, null)),
        cc: entry.cc.map((cc) => canonicalName(names, cc, null)),
      };
    });
    return {
      ...ticket,
      people,
      entries,
      requester:
        people.find((person) => person.role === 'reporter')?.name ??
        ticket.requester,
      mergedInto: mergedInto.get(ticket.number) ?? null,
    };
  });
}
