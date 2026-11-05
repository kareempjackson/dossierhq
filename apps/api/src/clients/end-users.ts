import type {
  AttentionItem,
  CitedText,
  Client,
  Device,
  EndUser,
  EndUserDetail,
  EndUserMeeting,
  Meeting,
  MeetingNote,
  Source,
  Ticket,
} from '@dossierhq/contracts';

/** What a client's records say about who works there. */
export type EndUserRecords = {
  client: Client;
  devices: Device[];
  tickets: Ticket[];
  meetings: Meeting[];
  notes: MeetingNote[];
  /**
   * The workspace's members' emails. Only their emails: a client's people
   * share names with the MSP's often enough.
   */
  staffEmails: string[];
};

/** One person and the records they appear in. */
export type FoundEndUser = {
  user: EndUser;
  devices: Device[];
  tickets: Ticket[];
  meetings: Meeting[];
  notes: MeetingNote[];
};

/** Where a spelling came from; the higher, the likelier it's a full name. */
const RANK = { contact: 4, meeting: 3, ticket: 2, device: 1, notes: 0 };
type Origin = keyof typeof RANK;

const TITLE = /^(?:dr|mr|mrs|ms|miss|mx|prof)\.?\s+/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTOMATED = /^(?:no-?reply|do-?not-?reply|mailer-daemon|postmaster)\b/i;
/** Built-in Windows sign-ins, which no one person uses. */
const SYSTEM_SIGN_INS = new Set([
  'administrator',
  'admin',
  'localadmin',
  'system',
  'guest',
  'defaultuser0',
]);

/**
 * Who a spelling of a name is: lower-case letters and digits, without a
 * title, a note in brackets, or an email's domain. "Dr Helen Okoro",
 * `helen.okoro@…` and `HelenOkoro` are all `helenokoro`. Null when nothing
 * is left.
 */
export function personKey(spelling: string): string | null {
  const key = (spelling.trim().split('@')[0] ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .replace(TITLE, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  return key || null;
}

/** Prefixes that begin a surname, so `JohnMcDonald` keeps its `McDonald`. */
const SURNAME_PREFIXES = new Set([
  'mc',
  'mac',
  'de',
  'di',
  'da',
  'du',
  'la',
  'le',
  'van',
  'von',
  'fitz',
]);

/**
 * A run-together sign-in written as a name: `KiaLewis` is "Kia Lewis",
 * `ann.lee` is "Ann Lee", `JohnMcDonald` is "John McDonald". Anything with a
 * space, an email, or a single word such as `itsupport` stays as it is.
 */
export function spacedName(signIn: string): string {
  if (/\s|@/.test(signIn)) return signIn;
  if (/[._]/.test(signIn)) {
    return signIn
      .split(/[._]+/)
      .filter(Boolean)
      .map((word) =>
        word === word.toLowerCase()
          ? word.charAt(0).toUpperCase() + word.slice(1)
          : word,
      )
      .join(' ');
  }
  const [first = '', ...rest] = signIn.split(/(?<=\p{Ll})(?=\p{Lu})/u);
  return rest.reduce((name, word) => {
    const last = name.split(/[\s-]/).at(-1)!.toLowerCase();
    return SURNAME_PREFIXES.has(last) ? name + word : `${name} ${word}`;
  }, first);
}

/** Noon on the day, so a day's notes sit among that day's recordings. */
const noonOn = (day: string) => `${day}T12:00:00.000Z`;

/**
 * The people at a client, by name, each with the devices they sign in to,
 * the tickets they raised and the meetings they were in. Notes only add to
 * people found elsewhere: their attendees are typed by hand, so "Priya"
 * there could be anyone.
 */
export function findEndUsers(records: EndUserRecords): FoundEndUser[] {
  const { client } = records;
  const staffEmails = new Set(
    records.staffEmails.map((email) => email.toLowerCase()),
  );
  // The MSP's side of the client's own records; never the primary contact.
  const staffKeys = new Set(
    [
      ...records.tickets.flatMap((ticket) => ticket.assignedTo ?? []),
      ...records.meetings.flatMap((meeting) =>
        meeting.attendees
          .filter((attendee) => attendee.role === 'msp')
          .map((attendee) => attendee.name),
      ),
    ].flatMap((name) => personKey(name) ?? []),
  );
  const contactKey =
    client.primaryContact && personKey(client.primaryContact.name);
  if (contactKey) staffKeys.delete(contactKey);

  type Person = {
    key: string;
    spellings: { text: string; origin: Origin }[];
    email: string | null;
    devices: Set<Device>;
    tickets: Set<Ticket>;
    meetings: Set<Meeting>;
    notes: Set<MeetingNote>;
  };
  const people = new Map<string, Person>();

  /** Who a spelling names, or null for the MSP's people and automated senders. */
  function person(raw: string | null, origin: Origin): Person | null {
    const text = raw?.trim().replace(/\s+/g, ' ');
    if (!text) return null;
    const key = personKey(text);
    const email = EMAIL.test(text) ? text.toLowerCase() : null;
    if (
      !key ||
      staffKeys.has(key) ||
      SYSTEM_SIGN_INS.has(key) ||
      (email && (staffEmails.has(email) || AUTOMATED.test(email)))
    ) {
      return null;
    }
    let found = people.get(key);
    if (!found) {
      if (origin === 'notes') return null;
      found = {
        key,
        spellings: [],
        email: null,
        devices: new Set(),
        tickets: new Set(),
        meetings: new Set(),
        notes: new Set(),
      };
      people.set(key, found);
    }
    found.spellings.push({ text, origin });
    found.email ??= email;
    return found;
  }

  const contact = client.primaryContact
    ? person(client.primaryContact.name, 'contact')
    : null;
  for (const device of records.devices) {
    person(device.assignedTo, 'device')?.devices.add(device);
  }
  for (const ticket of records.tickets) {
    person(ticket.requester, 'ticket')?.tickets.add(ticket);
  }
  for (const meeting of records.meetings) {
    for (const attendee of meeting.attendees) {
      if (attendee.role === 'client') {
        person(attendee.name, 'meeting')?.meetings.add(meeting);
      }
    }
  }
  for (const note of records.notes) {
    for (const attendee of note.attendees) {
      person(attendee, 'notes')?.notes.add(note);
    }
  }

  return [...people.values()]
    .map((p): FoundEndUser => {
      const name = fullestSpelling(p.spellings);
      const tickets = [...p.tickets];
      const meetings = [...p.meetings];
      const notes = [...p.notes];
      const contactTimes = [
        ...tickets.map((ticket) => ticket.openedAt),
        ...meetings.map((meeting) => meeting.occurredAt),
        ...notes.map((note) => noonOn(note.occurredOn)),
      ].sort();
      return {
        user: {
          id: p.key,
          clientId: client.id,
          name,
          role: p === contact ? client.primaryContact!.role || null : null,
          primaryContact: p === contact,
          email: p.email,
          signIns: [
            ...new Set(
              p.spellings
                .filter((s) => s.origin === 'device' && s.text !== name)
                .map((s) => s.text),
            ),
          ],
          deviceIds: [...p.devices].map((device) => device.id),
          tickets: tickets.length,
          openTickets: tickets.filter((ticket) => ticket.open).length,
          meetings: meetings.length + notes.length,
          lastContactAt: contactTimes.at(-1) ?? null,
        },
        devices: [...p.devices],
        tickets,
        meetings,
        notes,
      };
    })
    .sort((a, b) => a.user.name.localeCompare(b.user.name));
}

/**
 * The name to show: one with a space over a run-together sign-in, anything
 * over an email address, then the likeliest source; the first seen on a tie.
 * A run-together sign-in, when it's all there is, gets its spaces.
 */
function fullestSpelling(spellings: { text: string; origin: Origin }[]) {
  const score = ({ text, origin }: { text: string; origin: Origin }) =>
    (EMAIL.test(text) ? 0 : 10) + (text.includes(' ') ? 5 : 0) + RANK[origin];
  const best = spellings.reduce((best, s) =>
    score(s) > score(best) ? s : best,
  ).text;
  return spacedName(best);
}

/**
 * Everything about one person: their records, what they said in each
 * meeting (the points resting on their own words in `sources`), and the
 * client's attention items that cite their devices or tickets.
 */
export function endUserDetail(
  found: FoundEndUser,
  sources: Source[],
  attention: AttentionItem[],
): EndUserDetail {
  const theirWords = new Set(
    sources
      .filter(
        (source) =>
          source.kind === 'meeting' &&
          personKey(source.speakerName) === found.user.id,
      )
      .map((source) => source.id),
  );
  const theirs = (points: CitedText[]) =>
    points.filter((point) => point.sourceIds.some((id) => theirWords.has(id)));
  const at = (meeting: EndUserMeeting) =>
    meeting.kind === 'meeting'
      ? meeting.occurredAt
      : noonOn(meeting.occurredOn);
  const meetings: EndUserMeeting[] = [
    ...found.meetings.map((meeting) => ({
      kind: 'meeting' as const,
      id: meeting.id,
      title: meeting.title,
      occurredAt: meeting.occurredAt,
      said: {
        planning: theirs(meeting.planning),
        concerns: theirs(meeting.concerns),
        askedFor: theirs(meeting.askedFor),
        readAt: meeting.readAt,
      },
    })),
    ...found.notes.map((note) => ({
      kind: 'notes' as const,
      id: note.id,
      title: note.title,
      occurredOn: note.occurredOn,
    })),
  ].sort((a, b) => (at(a) < at(b) ? 1 : at(a) > at(b) ? -1 : 0));
  const theirRecords = new Set([
    ...found.devices.map((device) => device.sourceId),
    ...found.tickets.map((ticket) => ticket.sourceId),
  ]);

  return {
    user: found.user,
    devices: found.devices,
    tickets: found.tickets,
    meetings,
    attention: attention.filter((item) =>
      item.sourceIds.some((id) => theirRecords.has(id)),
    ),
    profile: null,
  };
}
