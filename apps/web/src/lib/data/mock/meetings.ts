import type {
  Meeting,
  MeetingSource,
  RecordSource,
} from '@dossierhq/contracts';
import { formatTimestamp } from '@/lib/format';

type Person = { name: string; role: 'client' | 'msp'; title: string };
type Quote = { at: string; by: Person; quote: string; id?: string };
type Point = { text: string; quote: Quote };

type MeetingDef = {
  id: string;
  clientId: string;
  callId: number;
  title: string;
  occurredAt: string;
  durationMinutes: number;
  people: Person[];
  planning: Point[];
  concerns: Point[];
  askedFor: Point[];
  /** Quotes cited elsewhere, such as promises behind commitments. */
  other?: Quote[];
};

const sam: Person = { name: 'Sam Okafor', role: 'msp', title: 'Larkspur IT' };
const person = (name: string, title: string): Person => ({
  name,
  role: 'client',
  title,
});

const priya = person('Priya Nair', 'practice manager');
const leo = person('Dr Leo Brandt', 'principal dentist');
const tom = person('Tom Asher', 'operations director');
const rachel = person('Rachel Ng', 'head of conveyancing');
const gareth = person('Gareth Lloyd', 'finance director');
const helen = person('Dr Helen Okoro', 'partner');
const mark = person('Mark Tierney', 'bursar');

const point = (text: string, quote: Quote): Point => ({ text, quote });

const defs: MeetingDef[] = [
  {
    id: 'mtg-hd-0930',
    clientId: 'harbour-dental',
    callId: 20931,
    title: 'Monthly check-in',
    occurredAt: '2026-09-30T13:00:00.000Z',
    durationMinutes: 42,
    people: [priya, leo, sam],
    planning: [
      point(
        'Opening a seventh surgery in November, which needs a workstation and an intraoral camera',
        {
          at: '00:05:10',
          by: priya,
          quote:
            'We are opening surgery seven in November, so we will need another workstation and the camera set up before then.',
        },
      ),
    ],
    concerns: [
      point('Losing X-ray images would mean closing the practice for a day', {
        id: 'src-hd-call-restore-ask',
        at: '00:14:32',
        by: priya,
        quote:
          'If we lost the X-ray images we would have to close for the day. Can we test a restore before the end of the month?',
      }),
    ],
    askedFor: [
      point('A restore test of the imaging share before the end of October', {
        id: 'src-hd-call-restore-ask',
        at: '00:14:32',
        by: priya,
        quote:
          'If we lost the X-ray images we would have to close for the day. Can we test a restore before the end of the month?',
      }),
      point('A price for replacing the two slow reception PCs', {
        at: '00:27:48',
        by: priya,
        quote:
          'Can you send me a price for replacing the two reception PCs? They are painfully slow.',
      }),
    ],
    other: [
      {
        id: 'src-hd-call-restore-promise',
        at: '00:16:05',
        by: sam,
        quote:
          'We will run a full restore test of the imaging share before the 31st and send you the results.',
      },
      {
        id: 'src-hd-call-quote-promise',
        at: '00:28:20',
        by: sam,
        quote: 'I will get you a quote for both by the ninth.',
      },
    ],
  },
  {
    id: 'mtg-hd-0902',
    clientId: 'harbour-dental',
    callId: 20488,
    title: 'Monthly check-in',
    occurredAt: '2026-09-02T13:00:00.000Z',
    durationMinutes: 35,
    people: [priya, sam],
    planning: [
      point('Moving appointment reminders from phone calls to text messages', {
        at: '00:03:40',
        by: priya,
        quote:
          'We are switching reminders to texts from October, so the front desk will be on the phones less.',
      }),
    ],
    concerns: [
      point('Reception staff get locked out after password changes', {
        at: '00:11:05',
        by: priya,
        quote:
          'Every time the passwords change, someone on reception is locked out for half the morning.',
      }),
    ],
    askedFor: [
      point('A way for staff to reset their own passwords', {
        at: '00:12:30',
        by: priya,
        quote:
          'Is there a way they can reset it themselves without calling you?',
      }),
    ],
    other: [
      {
        id: 'src-hd-call-sspr-promise',
        at: '00:21:30',
        by: sam,
        quote:
          'We will turn on self-service password reset for the reception team this month.',
      },
    ],
  },
  {
    id: 'mtg-nl-1006',
    clientId: 'northside-legal',
    callId: 21002,
    title: 'Monthly check-in',
    occurredAt: '2026-10-06T10:00:00.000Z',
    durationMinutes: 38,
    people: [tom, sam],
    planning: [
      point('Four trainee solicitors start in January', {
        at: '00:03:12',
        by: tom,
        quote:
          'We have four trainees starting in January, so we will need laptops and accounts ready.',
      }),
    ],
    concerns: [
      point('Wants to see value for money before renewing', {
        id: 'src-nl-call-review',
        at: '00:08:47',
        by: tom,
        quote:
          'Before we renew we are reviewing every supplier, IT included. I want to see what we have had for the money.',
      }),
    ],
    askedFor: [
      point('A summary of this year’s work before the renewal meeting', {
        at: '00:09:30',
        by: tom,
        quote:
          'Could you put together what you have done for us this year before we sit down on the renewal?',
      }),
    ],
  },
  {
    id: 'mtg-nl-0918',
    clientId: 'northside-legal',
    callId: 20714,
    title: 'Quarterly review',
    occurredAt: '2026-09-18T09:30:00.000Z',
    durationMinutes: 55,
    people: [tom, rachel, sam],
    planning: [
      point('Moving the conveyancing team onto its own SharePoint site', {
        at: '00:06:20',
        by: rachel,
        quote:
          'We would like conveyancing on its own SharePoint site before the end of October.',
      }),
    ],
    concerns: [
      point('Remote staff sign in without a second factor', {
        at: '00:19:55',
        by: tom,
        quote:
          'Our insurer has asked whether everyone working from home uses two-factor. I cannot say yes yet.',
      }),
    ],
    askedFor: [
      point('MFA on every remote account before the insurance renewal', {
        at: '00:21:40',
        by: tom,
        quote: 'Can we get that sorted before the insurance renewal?',
      }),
    ],
    other: [
      {
        id: 'src-nl-call-mfa-promise',
        at: '00:22:10',
        by: sam,
        quote:
          'We will have MFA on every remote account by the second of October.',
      },
      {
        id: 'src-nl-call-sp-promise',
        at: '00:07:05',
        by: sam,
        quote:
          'We will have the conveyancing site ready in the first week of October.',
      },
    ],
  },
  {
    id: 'mtg-mf-1002',
    clientId: 'marlow-freight',
    callId: 20977,
    title: 'Monthly check-in',
    occurredAt: '2026-10-02T13:00:00.000Z',
    durationMinutes: 47,
    people: [gareth, sam],
    planning: [
      point('Opening a second depot in Eastleigh in January', {
        id: 'src-mf-call-depot',
        at: '00:31:15',
        by: gareth,
        quote:
          'The Eastleigh depot opens in January. Can you get me costs for the network and wi-fi by the end of the month?',
      }),
    ],
    concerns: [
      point('Dispatch laptops are shared between shifts', {
        at: '00:18:40',
        by: gareth,
        quote:
          'The dispatch laptops get passed around between shifts, and I have no idea who is logged in to what.',
      }),
    ],
    askedFor: [
      point('Network and wi-fi costs for Eastleigh by the end of October', {
        id: 'src-mf-call-depot',
        at: '00:31:15',
        by: gareth,
        quote:
          'The Eastleigh depot opens in January. Can you get me costs for the network and wi-fi by the end of the month?',
      }),
    ],
    other: [
      {
        id: 'src-mf-call-depot-promise',
        at: '00:33:00',
        by: sam,
        quote:
          'I will come back with a network design and costs before the end of the month.',
      },
    ],
  },
  {
    id: 'mtg-csc-0924',
    clientId: 'cedar-street-clinic',
    callId: 20802,
    title: 'Monthly check-in',
    occurredAt: '2026-09-24T12:30:00.000Z',
    durationMinutes: 30,
    people: [helen, sam],
    planning: [
      point('Online appointment booking from January', {
        at: '00:04:15',
        by: helen,
        quote:
          'We want patients booking online from January, so the system needs to cope with that.',
      }),
    ],
    concerns: [
      point('The clinical system slows down in the afternoons', {
        at: '00:09:50',
        by: helen,
        quote:
          'By three o’clock the clinical system crawls. The doctors notice.',
      }),
    ],
    askedFor: [
      point('A check of the clinical system server’s capacity', {
        at: '00:11:20',
        by: helen,
        quote: 'Can someone look at the server and tell us if it needs more?',
      }),
    ],
  },
  {
    id: 'mtg-bh-0915',
    clientId: 'bramble-hill-school',
    callId: 20652,
    title: 'Start of term review',
    occurredAt: '2026-09-15T09:00:00.000Z',
    durationMinutes: 50,
    people: [mark, sam],
    planning: [
      point('Year 7 moves to Chromebooks this term, about 90 devices', {
        at: '00:18:05',
        by: mark,
        quote:
          'All of Year 7 are on Chromebooks this year, about ninety devices.',
      }),
    ],
    concerns: [
      point('Wi-fi in the sports hall drops during exams', {
        at: '00:26:30',
        by: mark,
        quote:
          'The wi-fi in the sports hall dropped twice during mock exams. That cannot happen in the summer.',
      }),
    ],
    askedFor: [
      point('A wi-fi survey of the sports hall before the January mocks', {
        at: '00:27:45',
        by: mark,
        quote: 'Can you survey the sports hall before the January mocks?',
      }),
    ],
    other: [
      {
        id: 'src-bh-call-chromebooks',
        at: '00:19:40',
        by: sam,
        quote:
          'We will have all the Year 7 Chromebooks enrolled before half term.',
      },
    ],
  },
  ...shortMeetings(),
];

/** One recent check-in for each remaining client: planning, concern, ask. */
function shortMeetings(): MeetingDef[] {
  const rows: [
    clientId: string,
    callId: number,
    occurredAt: string,
    contact: Person,
    planning: [string, string],
    concern: [string, string],
    ask: [string, string],
  ][] = [
    [
      'fenwick-rowe',
      20901,
      '2026-09-29T09:00:00.000Z',
      person('Sarah Fenwick', 'partner'),
      [
        'The team grows to 22 for tax season in January',
        'We will be up to twenty-two people in January for tax season.',
      ],
      [
        'Clients email statements to personal addresses',
        'Clients keep emailing us statements to personal addresses. I do not like it.',
      ],
      [
        'A secure way for clients to upload documents',
        'Is there a proper portal we could use for client uploads?',
      ],
    ],
    [
      'oakline-architects',
      20887,
      '2026-09-28T14:00:00.000Z',
      person('Jo Pemberton', 'studio manager'),
      [
        'Moving to a larger studio in March',
        'We are moving to the bigger studio in March, so we will need the network there.',
      ],
      [
        'Large drawing files are slow to open from SharePoint',
        'The big drawing files take minutes to open from SharePoint.',
      ],
      [
        'Faster access to project files in the studio',
        'Can we get the project files opening faster in the studio?',
      ],
    ],
    [
      'saltmarsh-veterinary',
      20944,
      '2026-10-01T12:00:00.000Z',
      person('Ellie Shaw', 'practice manager'),
      [
        'A second consulting room opens in December',
        'The second consulting room opens in December.',
      ],
      [
        'The card machine drops off the network',
        'The card machine drops off the network a couple of times a day.',
      ],
      [
        'Someone to look at the card machine’s connection',
        'Could someone come and look at the card machine?',
      ],
    ],
    [
      'kestrel-property',
      20790,
      '2026-09-23T10:00:00.000Z',
      person('Daniel Moss', 'managing director'),
      [
        'Taking on 200 more managed properties',
        'We are taking on about two hundred more properties this winter.',
      ],
      [
        'Tenancy documents are kept in too many places',
        'Tenancy documents are all over the place, half in email, half in folders.',
      ],
      [
        'One place for tenancy documents',
        'I want one place where every tenancy document lives.',
      ],
    ],
    [
      'lindqvist-engineering',
      20577,
      '2026-09-10T13:30:00.000Z',
      person('Anna Lindqvist', 'director'),
      [
        'Bidding for two rail projects that need security accreditation',
        'We are bidding for two rail jobs and both need security accreditation.',
      ],
      [
        'Not sure the firm would pass Cyber Essentials Plus',
        'Honestly, I am not sure we would pass Cyber Essentials Plus today.',
      ],
      [
        'A Cyber Essentials Plus readiness check',
        'Can you tell us what we would need to fix to pass?',
      ],
    ],
    [
      'pinewood-physio',
      20929,
      '2026-09-30T08:30:00.000Z',
      person('Chris Hale', 'owner'),
      [
        'Opening on Saturdays from November',
        'We are opening Saturdays from November.',
      ],
      [
        'The front desk PC is slow',
        'The front desk PC is so slow the queue backs up in the mornings.',
      ],
      [
        'Advice on replacing the front desk PC',
        'What would you replace the front desk PC with?',
      ],
    ],
    [
      'copperleaf-studio',
      21038,
      '2026-10-07T15:00:00.000Z',
      person('Maya Chen', 'founder'),
      ['Two designers join in November', 'Two designers join us in November.'],
      [
        'Font licences sit in personal accounts',
        'Our font licences are spread across everyone’s personal accounts.',
      ],
      [
        'A tidy-up of software licences',
        'Can you help us get all the licences under the company?',
      ],
    ],
    [
      'ashby-hotel',
      20821,
      '2026-09-25T10:30:00.000Z',
      person('Robert Vane', 'general manager'),
      [
        'Refurbishing the second floor over winter',
        'We are refurbishing the second floor over the winter.',
      ],
      [
        'Guests complain about wi-fi in the new wing',
        'Guests in the new wing keep complaining about the wi-fi.',
      ],
      [
        'Better wi-fi coverage in the new wing',
        'Can we sort the wi-fi in the new wing before Christmas?',
      ],
    ],
    [
      'rowan-care-homes',
      20766,
      '2026-09-22T14:00:00.000Z',
      person('Linda Marsh', 'registered manager'),
      [
        'Electronic care records for the night shift',
        'The night shift moves onto electronic care records next month.',
      ],
      [
        'Night shift tablets run out of battery',
        'The tablets are flat by four in the morning on nights.',
      ],
      [
        'Charging stations for the care tablets',
        'Could we get proper charging stations for the tablets?',
      ],
    ],
  ];

  return rows.map(
    ([clientId, callId, occurredAt, contact, plan, concern, ask]) => ({
      id: `mtg-${clientId}-${occurredAt.slice(5, 10).replace('-', '')}`,
      clientId,
      callId,
      title: 'Monthly check-in',
      occurredAt,
      durationMinutes: 30,
      people: [contact, sam],
      planning: [
        point(plan[0], { at: '00:04:20', by: contact, quote: plan[1] }),
      ],
      concerns: [
        point(concern[0], { at: '00:12:05', by: contact, quote: concern[1] }),
      ],
      askedFor: [point(ask[0], { at: '00:13:40', by: contact, quote: ask[1] })],
    }),
  );
}

// Building ------------------------------------------------------------------

const TIME_ZONE = 'Europe/London';

export const meetingSources: MeetingSource[] = [];
export const recordingSources: RecordSource[] = [];

function seconds(at: string): number {
  const [h = 0, m = 0, s = 0] = at.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

function build(def: MeetingDef): Meeting {
  const label = `${def.title}`;

  function sourceFor(quote: Quote): string {
    const id = quote.id ?? `src-${def.id}-${quote.at.replaceAll(':', '')}`;
    if (!meetingSources.some((source) => source.id === id)) {
      meetingSources.push({
        id,
        kind: 'meeting',
        clientId: def.clientId,
        tool: 'fathom',
        recordId: `CALL-${def.callId}`,
        recordType: 'Recording',
        title: label,
        recordedAt: def.occurredAt,
        url: `https://fathom.example/calls/${def.callId}?t=${seconds(quote.at)}`,
        meetingId: def.id,
        transcriptAt: quote.at,
        speakerRole: quote.by.role,
        speakerName: quote.by.name,
        quote: quote.quote,
        fields: [
          { label: 'Meeting', value: label },
          {
            label: 'Date',
            value: formatTimestamp(def.occurredAt, TIME_ZONE),
          },
          { label: 'Speaker', value: `${quote.by.name}, ${quote.by.title}` },
          { label: 'Transcript', value: quote.at },
        ],
      });
    }
    return id;
  }

  const cite = (p: Point) => ({
    text: p.text,
    sourceIds: [sourceFor(p.quote)],
  });
  def.other?.forEach(sourceFor);

  const recordingSourceId = `src-${def.id}-recording`;
  recordingSources.push({
    id: recordingSourceId,
    kind: 'record',
    clientId: def.clientId,
    tool: 'fathom',
    recordId: `CALL-${def.callId}`,
    recordType: 'Recording',
    title: label,
    recordedAt: def.occurredAt,
    url: `https://fathom.example/calls/${def.callId}`,
    fields: [
      { label: 'Meeting', value: label },
      { label: 'Date', value: formatTimestamp(def.occurredAt, TIME_ZONE) },
      { label: 'Length', value: `${def.durationMinutes} min` },
      {
        label: 'Attendees',
        value: def.people.map((p) => p.name).join(', '),
      },
    ],
  });

  return {
    id: def.id,
    clientId: def.clientId,
    title: def.title,
    occurredAt: def.occurredAt,
    durationMinutes: def.durationMinutes,
    attendees: def.people.map(({ name, role }) => ({ name, role })),
    planning: def.planning.map(cite),
    concerns: def.concerns.map(cite),
    askedFor: def.askedFor.map(cite),
    recordingSourceId,
  };
}

/** Newest first. */
export const meetings: Meeting[] = defs
  .map(build)
  .toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt));
