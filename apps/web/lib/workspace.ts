import type { TagTone } from '@/components/ui/tag';

/**
 * What each workspace screen shows. Nothing here is fetched yet: every
 * screen starts empty and shows its empty state. Connecting the API means
 * replacing these functions, one screen at a time, with reads through
 * lib/data (as lib/data/auth.ts does for the session). Who's signed in and
 * their workspace already come from the API, held in the browser's store.
 */

export type FolderTone = 'act' | 'drafted' | 'calm';

export type Client = {
  id: string;
  name: string;
  /** What the file needs: act, Dossier drafted something, or calm. */
  tone: FolderTone;
  /** The one line under the name, e.g. "3 need attention". */
  summary: string;
  /** Which tab it falls under on the clients page. */
  status: ClientStatus;
  /** What renews next, and in how many days. */
  renewal: { what: string; inDays: number };
  devices: number;
  lastMeeting: string;
  owner: string;
};

export type ClientStatus = 'attention' | 'renewal' | 'healthy';

export type AttentionItem = {
  id: string;
  title: string;
  /** The citation number shown after the title. */
  cite: number;
  detail: string;
  status: { tone: TagTone; label: string };
  source: string;
};

export type Renewal = { clientId: string; what: string; inDays: number };

export type Report = { id: string; clientId: string; week: string };

export type Notification = {
  id: string;
  title: string;
  body: string;
  /** As shown, e.g. "10 min ago", "Yesterday", "27 Oct". */
  when: string;
  unread: boolean;
  action?: { label: string; href: string };
};

export type Ask = {
  id: string;
  /** As listed in the history. */
  title: string;
  /** As it was asked. */
  question: string;
  askedBy: string;
  askedAt: string;
  /** What the answer rests on, e.g. "3 clients · 6 records". */
  scope: string;
  answer: {
    heading: string;
    lines: { label: string; text: string; cite: number }[];
    actions: { label: string; href: string; variant: 'ink' | 'outline' }[];
    /** Back to front, as the cited-files stack shows them. */
    cited: { source: string; date: string; title: string }[];
  };
};

export type Workspace = {
  /** When Dossier last read the tools, e.g. "4 minutes ago"; null before any read. */
  lastRead: string | null;
  /** The six folders under "Your clients" on Today. */
  pinnedClientIds: string[];
  clients: Client[];
  /** The client that needs you most, and what it needs. */
  focus: { clientId: string; items: AttentionItem[] } | null;
  signalsThisWeek: number;
  renewals: Renewal[];
  /** Questions anyone in the workspace has asked, newest first. */
  asks: Ask[];
  /** Client reports, newest first. */
  reports: Report[];
  /** What happened in the workspace, newest first. */
  notifications: Notification[];
  weekly: WeeklyReports;
  intelligence: IntelligenceSettings;
  team: Team;
};

// Reports ---------------------------------------------------------------------

export type ReportDraft = {
  id: string;
  clientId: string;
  /** As the client reads them, each citing a line in the client's file. */
  answers: { question: string; answer: string; cite: number; check?: string }[];
  /** Back to front, as the cited-files stack shows them. */
  cited: { source: string; date: string; title: string }[];
};

export type ApprovedReport = {
  clientId: string;
  approvedBy: string;
  approvedAt: string;
};

export type ReportQuestion = {
  id: string;
  text: string;
  clientId: string | null;
};

export type DeliverySettings = {
  senderName: string;
  replyTo: string;
  colour: string;
  draftAt: string;
  sendAt: string;
};

export type WeeklyReports = {
  /** e.g. "Week of 26 Oct"; null until there's a week of reports. */
  week: string | null;
  /** e.g. "26 Oct to 1 Nov". */
  period: string | null;
  /** When approved drafts go out next, e.g. "Mon 9 Nov, 09:00". */
  sends: string | null;
  drafts: ReportDraft[];
  /** Approved, and waiting to be sent. */
  approved: ApprovedReport[];
  questions: ReportQuestion[];
  delivery: DeliverySettings;
};

// Intelligence ----------------------------------------------------------------

export type Toggle = {
  id: string;
  label: string;
  detail?: string;
  on: boolean;
};

export type IntelligenceSettings = {
  /** The model drafting for the workspace; null until it's known. */
  model: {
    name: string;
    key: string;
    perClient: string;
    last30Days: string;
    runs: number;
  } | null;
  drafts: Toggle[];
  lookFor: Toggle[];
  reads: Toggle[];
};

// Settings --------------------------------------------------------------------

export type SpendRow = {
  what: string;
  runs: number;
  tokensRead: string;
  fromCache: number;
  tokensWritten: string;
  cost: number;
};

export type Member = {
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Technician';
};

/** Everyone else in the workspace, and who's been invited. */
export type Team = {
  members: Member[];
  pending: { email: string; role: 'Admin' | 'Technician'; expires: string }[];
};

// Report recipients ---------------------------------------------------------

/** Who a report goes to. The client file reads them from the API. */
export type Recipient = { name: string; email: string };

// Empty to start with ---------------------------------------------------------

const on = (id: string, label: string, detail?: string): Toggle => ({
  id,
  label,
  detail,
  on: true,
});

/** What Dossier can draft, look for and read: the options, at their defaults. */
const INTELLIGENCE: IntelligenceSettings = {
  model: null,
  drafts: [
    on(
      'recommendations',
      'Recommendations',
      'Next steps per client, after syncs',
    ),
    on('report-questions', 'Report questions', 'Answers in each weekly report'),
    on(
      'meeting-notes',
      'Meeting notes',
      'Plans, worries and asks from meetings',
    ),
    on('ask', 'Ask Dossier', 'Answers to questions typed into Ask'),
    on(
      'patterns',
      'Patterns across clients',
      'The same problem at several clients',
    ),
  ],
  lookFor: [
    on('backups', 'Backups and restores'),
    on('patching', 'Patching and updates'),
    on('security', 'Security and access'),
    on('device-health', 'Device health'),
    on('expiry', 'Expiry and renewals'),
    on('promises', 'Promises to the client'),
    on('helpdesk', 'Helpdesk'),
    on('plans', 'Plans and concerns'),
  ],
  reads: [
    on('devices', 'Devices and alerts', 'NinjaOne'),
    on('tickets', 'Tickets', 'NinjaOne'),
    { ...on('ticket-notes', 'Internal ticket notes', 'NinjaOne'), on: false },
    on('meetings', 'Meetings', 'Fathom'),
    on('documentation', 'Documentation', 'Hudu'),
    on('file-names', 'File names', 'SharePoint'),
    on('meeting-notes', 'Meeting notes', 'Dossier'),
  ],
};

const EMPTY: Workspace = {
  lastRead: null,
  pinnedClientIds: [],
  clients: [],
  focus: null,
  signalsThisWeek: 0,
  renewals: [],
  asks: [],
  reports: [],
  notifications: [],
  weekly: {
    week: null,
    period: null,
    sends: null,
    drafts: [],
    approved: [],
    questions: [],
    delivery: {
      senderName: '',
      replyTo: '',
      colour: '#002e3b',
      draftAt: 'Mondays at 07:00',
      sendAt: 'Mondays at 09:00',
    },
  },
  intelligence: INTELLIGENCE,
  team: { members: [], pending: [] },
};

/** The signed-in workspace's data: empty until each part reads the API. */
export function getWorkspace(): Workspace {
  return EMPTY;
}

/** What drafting has cost over the last 30 days: nothing yet. */
export function getSpend(): { rows: SpendRow[]; fromCache: number } {
  return { rows: [], fromCache: 0 };
}
