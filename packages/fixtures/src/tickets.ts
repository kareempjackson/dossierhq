import type { RecordSource, Ticket, Urgency } from '@dossierhq/contracts';
import { prefixes } from './devices.js';
import { formatTimestamp } from './format.js';
import { NOW } from './world.js';

const HOUR = 3_600_000;
const ago = (hours: number) =>
  new Date(new Date(NOW).getTime() - hours * HOUR).toISOString();

type Spec = {
  clientId: string;
  number: number;
  subject: string;
  status: string;
  open: boolean;
  /** NinjaOne's own words, shown in the record's fields. */
  priority: 'High' | 'Medium' | 'Low';
  severity?: 'Critical' | 'Major';
  requester: string | null;
  assignedTo: string | null;
  /** Hours before NOW. */
  opened: number;
  updated: number;
};

/** Severity first, then priority, as the NinjaOne connector reads them. */
const urgencyOf = ({ priority, severity }: Spec): Urgency =>
  severity === 'Critical'
    ? 'critical'
    : severity === 'Major' || priority === 'High'
      ? 'high'
      : 'normal';

/** A few clients' NinjaOne tickets: some open, some closed in the last 90 days. */
const specs: Spec[] = [
  {
    clientId: 'harbour-dental',
    number: 4821,
    subject: 'X-ray software won’t open on surgery 2 PC',
    status: 'Open',
    open: true,
    priority: 'High',
    requester: 'Priya Nair',
    assignedTo: 'Jess Patel',
    opened: 5,
    updated: 1,
  },
  {
    clientId: 'harbour-dental',
    number: 4807,
    subject: 'Reception PCs slow since the last update',
    status: 'Waiting on client',
    open: true,
    priority: 'Medium',
    requester: 'Priya Nair',
    assignedTo: 'Owen Price',
    opened: 50,
    updated: 26,
  },
  {
    clientId: 'harbour-dental',
    number: 4760,
    subject: 'New starter needs an email account',
    status: 'Closed',
    open: false,
    priority: 'Low',
    requester: 'Priya Nair',
    assignedTo: 'Owen Price',
    opened: 8 * 24,
    updated: 7 * 24,
  },
  {
    clientId: 'harbour-dental',
    number: 4632,
    subject: 'Card reader at reception not connecting',
    status: 'Resolved',
    open: false,
    priority: 'Medium',
    requester: null,
    assignedTo: 'Jess Patel',
    opened: 41 * 24,
    updated: 40 * 24,
  },
  {
    clientId: 'northside-legal',
    number: 4819,
    subject: 'Case management system down for the whole office',
    status: 'Open',
    open: true,
    priority: 'High',
    severity: 'Critical',
    requester: 'Tom Asher',
    assignedTo: 'Sam Okafor',
    opened: 3,
    updated: 0.5,
  },
  {
    clientId: 'northside-legal',
    number: 4812,
    subject: 'Scanner on floor 2 sends blank pages',
    status: 'Open',
    open: true,
    priority: 'Low',
    requester: 'Tom Asher',
    assignedTo: null,
    opened: 30,
    updated: 30,
  },
  {
    clientId: 'northside-legal',
    number: 4701,
    subject: 'Set up a shared mailbox for conveyancing',
    status: 'Closed',
    open: false,
    priority: 'Medium',
    requester: 'Tom Asher',
    assignedTo: 'Owen Price',
    opened: 22 * 24,
    updated: 20 * 24,
  },
  {
    clientId: 'marlow-freight',
    number: 4816,
    subject: 'Depot tablets can’t reach the warehouse system',
    status: 'Open',
    open: true,
    priority: 'Medium',
    severity: 'Major',
    requester: 'Gareth Lloyd',
    assignedTo: 'Jess Patel',
    opened: 20,
    updated: 4,
  },
  {
    clientId: 'marlow-freight',
    number: 4790,
    subject: 'Add two drivers to the dispatch app',
    status: 'Paused',
    open: true,
    priority: 'Low',
    requester: 'Gareth Lloyd',
    assignedTo: 'Owen Price',
    opened: 4 * 24,
    updated: 3 * 24,
  },
  {
    clientId: 'marlow-freight',
    number: 4655,
    subject: 'Finance PC blue screen on start-up',
    status: 'Closed',
    open: false,
    priority: 'High',
    requester: 'Gareth Lloyd',
    assignedTo: 'Sam Okafor',
    opened: 61 * 24,
    updated: 60 * 24,
  },
  {
    clientId: 'cedar-street-clinic',
    number: 4810,
    subject: 'Printer in consulting room 3 jams every morning',
    status: 'Open',
    open: true,
    priority: 'Medium',
    requester: 'Dr Helen Okoro',
    assignedTo: 'Owen Price',
    opened: 28,
    updated: 9,
  },
  {
    clientId: 'cedar-street-clinic',
    number: 4744,
    subject: 'Remote access for the new locum',
    status: 'Resolved',
    open: false,
    priority: 'Medium',
    requester: 'Dr Helen Okoro',
    assignedTo: 'Jess Patel',
    opened: 12 * 24,
    updated: 11 * 24,
  },
];

export const tickets: Ticket[] = specs.map((spec) => {
  const key = `${prefixes[spec.clientId]!.toLowerCase()}-${spec.number}`;
  return {
    id: `tkt-${key}`,
    clientId: spec.clientId,
    number: String(spec.number),
    subject: spec.subject,
    status: spec.status,
    open: spec.open,
    urgency: urgencyOf(spec),
    requester: spec.requester,
    assignedTo: spec.assignedTo,
    openedAt: ago(spec.opened),
    updatedAt: ago(spec.updated),
    sourceId: `src-${key}-ticket`,
  };
});

/** The NinjaOne record behind each ticket. */
export const ticketSources: RecordSource[] = specs.map((spec, index) => {
  const ticket = tickets[index]!;
  return {
    id: ticket.sourceId,
    kind: 'record',
    clientId: ticket.clientId,
    tool: 'ninjaone',
    recordId: `#${spec.number}`,
    recordType: 'Ticket',
    title: spec.subject,
    recordedAt: ticket.updatedAt,
    url: `https://ninjaone.example/#/ticketing/ticket/${spec.number}`,
    fields: [
      { label: 'Status', value: spec.status },
      { label: 'Priority', value: spec.priority },
      ...(spec.severity ? [{ label: 'Severity', value: spec.severity }] : []),
      ...(spec.requester
        ? [{ label: 'Requester', value: spec.requester }]
        : []),
      {
        label: 'Assigned to',
        value: spec.assignedTo ?? 'Not assigned',
      },
      {
        label: 'Opened',
        value: formatTimestamp(ticket.openedAt, 'Europe/London'),
      },
    ],
  };
});
