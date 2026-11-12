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
};

// Empty to start with ---------------------------------------------------------

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
};

/** The signed-in workspace's data: empty until each part reads the API. */
export function getWorkspace(): Workspace {
  return EMPTY;
}
