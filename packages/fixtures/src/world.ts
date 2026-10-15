import type { Client, Workspace } from '@dossierhq/contracts';

/**
 * The fictional Larkspur IT workspace: 14 clients and everything Dossier has
 * read about them.
 *
 * Everything is pinned to one moment so relative times stay stable.
 */
export const NOW = '2026-10-09T15:40:00.000Z';

export const workspace: Workspace = {
  id: 'larkspur-it',
  name: 'Larkspur IT',
  timeZone: 'Europe/London',
};

/**
 * The demo sign-in. The password is `larkspur-demo`; the hash below is that
 * password run through the API's scrypt settings (apps/api/src/auth/password.ts),
 * and an API test checks the two still match.
 */
export const DEMO_EMAIL = 'sam@larkspur-it.example';
export const DEMO_PASSWORD = 'larkspur-demo';

export const users = [
  {
    id: 'usr-sam-okafor',
    email: DEMO_EMAIL,
    name: 'Sam Okafor',
    title: 'Service manager',
    passwordHash:
      'scrypt$131072$8$1$_wDYIEGND9FP1UdHijTIPg$BRc8Ub4NIG5277H6eRJmW9ObGAYrXuOlZFZK6EH201w',
  },
];

export const memberships = [
  {
    workspaceId: 'larkspur-it',
    userId: 'usr-sam-okafor',
    role: 'owner' as const,
  },
];

const managedComplete = [
  'Helpdesk, 8:00 to 18:00 weekdays',
  'Monitoring and patching',
  'Backup and restore',
  'Quarterly review',
];
const managedEssentials = [
  'Helpdesk, 9:00 to 17:00 weekdays',
  'Monitoring and patching',
];

const clientDetails: Omit<Client, 'domains'>[] = [
  {
    id: 'harbour-dental',
    name: 'Harbour Dental',
    industry: 'Dental practice',
    location: 'Portsmouth',
    seats: 22,
    primaryContact: { name: 'Priya Nair', role: 'Practice manager' },
    contract: {
      plan: 'Managed Complete',
      startedOn: '2023-04-01',
      renewsOn: '2027-03-31',
      monthlyFee: 1840,
      currency: 'GBP',
      includes: managedComplete,
    },
  },
  {
    id: 'northside-legal',
    name: 'Northside Legal',
    industry: 'Law firm',
    location: 'Leeds',
    seats: 38,
    primaryContact: { name: 'Tom Asher', role: 'Operations director' },
    contract: {
      plan: 'Managed Complete',
      startedOn: '2022-12-01',
      renewsOn: '2026-11-30',
      monthlyFee: 3100,
      currency: 'GBP',
      includes: managedComplete,
    },
  },
  {
    id: 'cedar-street-clinic',
    name: 'Cedar Street Clinic',
    industry: 'GP surgery',
    location: 'Bristol',
    seats: 31,
    primaryContact: { name: 'Dr Helen Okoro', role: 'Partner' },
    contract: {
      plan: 'Managed Complete',
      startedOn: '2024-01-15',
      renewsOn: '2027-01-14',
      monthlyFee: 2650,
      currency: 'GBP',
      includes: managedComplete,
    },
  },
  {
    id: 'marlow-freight',
    name: 'Marlow Freight',
    industry: 'Logistics',
    location: 'Southampton',
    seats: 54,
    primaryContact: { name: 'Gareth Lloyd', role: 'Finance director' },
    contract: {
      plan: 'Managed Complete with Security',
      startedOn: '2021-06-01',
      renewsOn: '2027-05-31',
      monthlyFee: 4200,
      currency: 'GBP',
      includes: [...managedComplete, 'Endpoint detection and response'],
    },
  },
  {
    id: 'fenwick-rowe',
    name: 'Fenwick & Rowe',
    industry: 'Accountants',
    location: 'Reading',
    seats: 17,
    primaryContact: { name: 'Sarah Fenwick', role: 'Partner' },
    contract: {
      plan: 'Managed Essentials',
      startedOn: '2024-07-01',
      renewsOn: '2027-06-30',
      monthlyFee: 1150,
      currency: 'GBP',
      includes: managedEssentials,
    },
  },
  {
    id: 'bramble-hill-school',
    name: 'Bramble Hill School',
    industry: 'Independent school',
    location: 'Guildford',
    seats: 86,
    primaryContact: { name: 'Mark Tierney', role: 'Bursar' },
    contract: {
      plan: 'Managed Complete',
      startedOn: '2023-09-01',
      renewsOn: '2027-08-31',
      monthlyFee: 5200,
      currency: 'GBP',
      includes: managedComplete,
    },
  },
  {
    id: 'oakline-architects',
    name: 'Oakline Architects',
    industry: 'Architecture practice',
    location: 'Brighton',
    seats: 19,
    primaryContact: { name: 'Jo Pemberton', role: 'Studio manager' },
    contract: {
      plan: 'Managed Essentials',
      startedOn: '2025-02-01',
      renewsOn: '2027-01-31',
      monthlyFee: 1320,
      currency: 'GBP',
      includes: managedEssentials,
    },
  },
  {
    id: 'saltmarsh-veterinary',
    name: 'Saltmarsh Veterinary',
    industry: 'Veterinary practice',
    location: 'Chichester',
    seats: 24,
    primaryContact: { name: 'Ellie Shaw', role: 'Practice manager' },
    contract: {
      plan: 'Managed Complete',
      startedOn: '2024-05-01',
      renewsOn: '2027-04-30',
      monthlyFee: 1760,
      currency: 'GBP',
      includes: managedComplete,
    },
  },
  {
    id: 'kestrel-property',
    name: 'Kestrel Property Group',
    industry: 'Property management',
    location: 'Winchester',
    seats: 29,
    primaryContact: { name: 'Daniel Moss', role: 'Managing director' },
    contract: {
      plan: 'Managed Complete',
      startedOn: '2022-03-01',
      renewsOn: '2027-02-28',
      monthlyFee: 2240,
      currency: 'GBP',
      includes: managedComplete,
    },
  },
  {
    id: 'lindqvist-engineering',
    name: 'Lindqvist Engineering',
    industry: 'Engineering consultancy',
    location: 'Basingstoke',
    seats: 41,
    primaryContact: { name: 'Anna Lindqvist', role: 'Director' },
    contract: {
      plan: 'Managed Complete',
      startedOn: '2023-11-01',
      renewsOn: '2026-10-31',
      monthlyFee: 3350,
      currency: 'GBP',
      includes: managedComplete,
    },
  },
  {
    id: 'pinewood-physio',
    name: 'Pinewood Physiotherapy',
    industry: 'Physiotherapy clinic',
    location: 'Farnham',
    seats: 12,
    primaryContact: { name: 'Chris Hale', role: 'Owner' },
    contract: {
      plan: 'Managed Essentials',
      startedOn: '2025-04-01',
      renewsOn: '2027-03-31',
      monthlyFee: 760,
      currency: 'GBP',
      includes: managedEssentials,
    },
  },
  {
    id: 'copperleaf-studio',
    name: 'Copperleaf Studio',
    industry: 'Design agency',
    location: 'London',
    seats: 15,
    primaryContact: { name: 'Maya Chen', role: 'Founder' },
    contract: {
      plan: 'Managed Essentials',
      startedOn: '2025-01-06',
      renewsOn: '2027-01-05',
      monthlyFee: 980,
      currency: 'GBP',
      includes: managedEssentials,
    },
  },
  {
    id: 'ashby-hotel',
    name: 'The Ashby Hotel',
    industry: 'Hotel',
    location: 'Bath',
    seats: 47,
    primaryContact: { name: 'Robert Vane', role: 'General manager' },
    contract: {
      plan: 'Managed Complete',
      startedOn: '2022-05-01',
      renewsOn: '2027-04-30',
      monthlyFee: 2890,
      currency: 'GBP',
      includes: managedComplete,
    },
  },
  {
    id: 'rowan-care-homes',
    name: 'Rowan Care Homes',
    industry: 'Care provider',
    location: 'Salisbury',
    seats: 63,
    primaryContact: { name: 'Linda Marsh', role: 'Registered manager' },
    contract: {
      plan: 'Managed Complete',
      startedOn: '2021-10-01',
      renewsOn: '2027-09-30',
      monthlyFee: 3780,
      currency: 'GBP',
      includes: managedComplete,
    },
  },
];

/** Each with one made-up domain, for matching meetings. */
export const clients: Client[] = clientDetails.map((client) => ({
  ...client,
  domains: [`${client.id.replaceAll('-', '')}.example`],
}));

/** Most recently opened first. */
export const recentClientIds = [
  'harbour-dental',
  'northside-legal',
  'marlow-freight',
  'cedar-street-clinic',
  'bramble-hill-school',
];
