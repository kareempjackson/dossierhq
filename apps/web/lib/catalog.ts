/**
 * What Dossier offers, independent of any workspace: how each tool connects,
 * the models it drafts with, where API keys come from, and what it can
 * notify about. Wording and facts come from the app this one replaced
 * (its tool guides and settings, in git history under apps/web/src).
 */
import type { Tool as ToolId } from '@dossierhq/contracts';

export type ToolField = {
  name: string;
  label: string;
  type: 'text' | 'url' | 'secret' | 'select';
  optional?: boolean;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
};

export type ToolGuide = {
  id: ToolId;
  name: string;
  /** What connecting brings in, under the form's title. */
  intro: string;
  /** Read in the Manage details. */
  reads: string;
  fields: ToolField[];
  /** "Six steps in NinjaOne": the number word and where the steps happen. */
  stepsIn: string;
  steps: string[];
  /** Under the steps. */
  note?: string;
  /** NinjaOne signs in; the others connect with what's typed. */
  signIn?: boolean;
};

export const TOOL_GUIDES: Record<ToolId, ToolGuide> = {
  ninjaone: {
    id: 'ninjaone',
    name: 'NinjaOne',
    intro:
      'Organizations become clients. Reads devices, patch status, active alerts and tickets.',
    reads: 'organizations, devices, alerts, patch status, tickets',
    fields: [
      {
        name: 'region',
        label: 'Region',
        type: 'select',
        hint: 'The address you sign in to NinjaOne at.',
        options: [
          { value: 'app', label: 'United States (app.ninjarmm.com)' },
          { value: 'us2', label: 'United States 2 (us2.ninjarmm.com)' },
          { value: 'ca', label: 'Canada (ca.ninjarmm.com)' },
          { value: 'eu', label: 'Europe (eu.ninjarmm.com)' },
          { value: 'oc', label: 'Oceania (oc.ninjarmm.com)' },
          { value: 'jp', label: 'Japan (jp.ninjarmm.com)' },
          { value: 'fed', label: 'FedRAMP (fed.ninjarmm.com)' },
        ],
      },
      { name: 'clientId', label: 'Client ID', type: 'text' },
      {
        name: 'clientSecret',
        label: 'Client secret',
        type: 'secret',
        optional: true,
        hint: 'Leave it empty if NinjaOne gave you only a client ID. Connecting without tickets needs one.',
      },
    ],
    stepsIn: 'Six steps in NinjaOne',
    steps: [
      'In NinjaOne, go to Administration, then Apps, API, Client app IDs, and choose Add.',
      'Set the platform to Web and name it Dossier.',
      'Add the redirect URI shown here, exactly as it is.',
      'Tick only the Monitoring scope. Allow Authorization code and Refresh token.',
      'Save, then copy the client ID, and the secret if shown. It shows only once.',
      'Choose Sign in with NinjaOne as a technician who can see every client’s tickets.',
    ],
    note: 'Not using NinjaOne tickets? An API Services app with the Client credentials grant connects without signing in, and reads everything but tickets.',
    signIn: true,
  },
  hudu: {
    id: 'hudu',
    name: 'Hudu',
    intro:
      'Companies become clients. Reads assets, websites and expiry dates, never passwords.',
    reads: 'companies, assets, websites, expiry dates',
    fields: [
      {
        name: 'url',
        label: 'Hudu address',
        type: 'url',
        placeholder: 'https://yourcompany.huducloud.com',
      },
      { name: 'apiKey', label: 'API key', type: 'secret' },
    ],
    stepsIn: 'Four steps in Hudu',
    steps: [
      'In Hudu, open the admin area, then API keys, and choose New API key.',
      'Leave password access, destructive actions and exports switched off. Hudu has no read-only key; this is the closest to one.',
      'If you limit the key to certain IP addresses, include the one Dossier’s server uses.',
      'Copy the key straight away. Hudu hides it after a few minutes.',
    ],
  },
  sharepoint: {
    id: 'sharepoint',
    name: 'SharePoint',
    intro:
      'Reads the files in each client’s folder. A folder joins the client with the same name.',
    reads: 'client folders and file names, never contents',
    fields: [
      { name: 'tenantId', label: 'Directory (tenant) ID', type: 'text' },
      { name: 'clientId', label: 'Application (client) ID', type: 'text' },
      { name: 'clientSecret', label: 'Client secret', type: 'secret' },
    ],
    stepsIn: 'Five steps in Microsoft Entra',
    steps: [
      'In the Microsoft Entra admin center, go to App registrations, choose New registration, name it Dossier and keep it single tenant.',
      'Under API permissions, add Microsoft Graph, Application permissions, Sites.Read.All, then grant admin consent.',
      'Under Certificates & secrets, add a client secret and copy its value. Note when it expires; Dossier will say when it stops working.',
      'Copy the directory (tenant) ID and application (client) ID from the app’s overview.',
      'Choose Find sites, then pick the site, library and folder that hold a folder for each client.',
    ],
  },
  fathom: {
    id: 'fathom',
    name: 'Fathom',
    intro:
      'Reads client meetings from the last 90 days, with Fathom’s summary of each and the action items you took on.',
    reads: 'meetings, summaries, action items',
    fields: [{ name: 'apiKey', label: 'API key', type: 'secret' }],
    stepsIn: 'Three steps in Fathom',
    steps: [
      'In Fathom, open Settings, then API access, and create a key.',
      'A key sees the meetings its owner recorded or can view, so create it as someone who sees your client meetings.',
      'Meetings join a client by the email domain of the outside invitees, taken from Hudu company websites or the client’s name. Attach any that don’t match from the client’s Meetings tab.',
    ],
  },
};

/**
 * Tools Dossier will read later. Listed on Connections as coming soon, so
 * people see what's planned; nothing connects to them yet, and the API
 * doesn't know them.
 */
export const PLANNED_TOOLS: { name: string; brings?: string }[] = [
  { name: 'IT Glue', brings: 'Documentation, configurations and expiry dates' },
  { name: 'Halo', brings: 'Tickets, contracts and clients' },
  { name: 'Guru', brings: 'Knowledge cards and how-tos' },
  { name: 'ConnectWise', brings: 'Tickets, agreements and devices' },
  { name: 'SyncroMSP', brings: 'Tickets, assets and alerts' },
  { name: 'Atlas' },
  { name: 'Kaseya', brings: 'Devices, patching and alerts' },
  { name: 'Atera', brings: 'Devices, alerts and tickets' },
  { name: 'Datto RMM', brings: 'Devices, patching and alerts' },
];

export type Provider = 'anthropic' | 'openai' | 'google' | 'xai';

export const PROVIDERS: Record<
  Provider,
  { name: string; product: string; placeholder: string; keysUrl: string }
> = {
  anthropic: {
    name: 'Anthropic',
    product: 'Claude',
    placeholder: 'sk-ant-…',
    keysUrl: 'https://platform.claude.com/settings/keys',
  },
  openai: {
    name: 'OpenAI',
    product: 'ChatGPT',
    placeholder: 'sk-…',
    keysUrl: 'https://platform.openai.com/api-keys',
  },
  google: {
    name: 'Google',
    product: 'Gemini',
    placeholder: 'AIza…',
    keysUrl: 'https://aistudio.google.com/apikey',
  },
  xai: {
    name: 'xAI',
    product: 'Grok',
    placeholder: 'xai-…',
    keysUrl: 'https://console.x.ai',
  },
};

export type Model = {
  id: string;
  name: string;
  provider: Provider;
  summary: string;
  note?: string;
  /** Dollars per million tokens: input, output, cache read, cache write. */
  prices: [number, number, number, number];
  /** About what drafting for one client costs, as shown. */
  perClient: string;
};

export const MODELS: Model[] = [
  {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    provider: 'anthropic',
    summary:
      'The default. Careful judgement across many records, at a middle price.',
    prices: [4, 20, 0.2, 5],
    perClient: '$0.16',
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    provider: 'anthropic',
    summary: 'Half the price of Opus 5.5, and quicker.',
    prices: [2, 10, 0.2, 2.5],
    perClient: '$0.08',
  },
  {
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    provider: 'anthropic',
    summary: 'The cheapest and quickest. Best for short answers.',
    note: 'Prompts over 100K tokens cost 5× more. Counts the same text as about 30% more tokens.',
    prices: [0.1, 0.5, 0.01, 0.125],
    perClient: 'Under $0.01',
  },
  {
    id: 'claude-fable-5-1',
    name: 'Claude Fable 5.1',
    provider: 'anthropic',
    summary: 'Anthropic’s most capable model, at 2.5× the price of Opus 5.5.',
    note: 'Needs an Anthropic account with 30-day data retention; it isn’t available under zero data retention.',
    prices: [10, 50, 0.25, 12.5],
    perClient: '$0.40',
  },
  {
    id: 'gpt-6-astra',
    name: 'GPT-6 Astra',
    provider: 'openai',
    summary: 'OpenAI’s most capable model, at 2.5× the price of Opus 5.5.',
    note: 'Prompts over 272K tokens cost twice as much to read.',
    prices: [10, 50, 1, 10],
    perClient: '$0.40',
  },
  {
    id: 'gpt-6-1-sol',
    name: 'GPT-6.1 Sol',
    provider: 'openai',
    summary: 'OpenAI’s balance of judgement and price: half of Opus 5.5.',
    note: 'Prompts over 272K tokens cost twice as much to read.',
    prices: [2, 10, 0.1, 2],
    perClient: '$0.08',
  },
  {
    id: 'gpt-6-luna',
    name: 'GPT-6 Luna',
    provider: 'openai',
    summary: 'OpenAI’s cheapest and quickest. Best for short answers.',
    note: 'Prompts over 272K tokens cost twice as much to read.',
    prices: [0.1, 0.5, 0.01, 0.1],
    perClient: 'Under $0.01',
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    provider: 'google',
    summary: 'Google’s most capable model, at half the price of Opus 5.5.',
    note: 'An introductory price: Google doubles it on 1 December 2026.',
    prices: [2, 10, 0.1, 2],
    perClient: '$0.08',
  },
  {
    id: 'gemini-3-8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'google',
    summary: 'Quicker and cheaper than Argon, and good at most drafting.',
    note: 'An introductory price: Google doubles it on 1 January 2027.',
    prices: [0.75, 3.75, 0.075, 0.75],
    perClient: '$0.03',
  },
  {
    id: 'gemini-3-5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    provider: 'google',
    summary: 'Google’s cheapest and quickest. Best for short answers.',
    prices: [0.3, 2.5, 0.03, 0.3],
    perClient: '$0.02',
  },
  {
    id: 'grok-4-7',
    name: 'Grok 4.7',
    provider: 'xai',
    summary: 'xAI’s most capable model, with cheaper output than most.',
    note: 'Prompts of 200K tokens or more cost twice as much.',
    prices: [2, 6, 0.5, 2],
    perClient: '$0.05',
  },
  {
    id: 'grok-4-3',
    name: 'Grok 4.3',
    provider: 'xai',
    summary: 'Cheaper than Grok 4.7, and quicker.',
    note: 'Prompts of 200K tokens or more cost twice as much.',
    prices: [1.25, 2.5, 0.2, 1.25],
    perClient: '$0.03',
  },
];

export type NotificationEvent = {
  id: string;
  label: string;
  description: string;
  /** Urgent: in Dossier and by email. Quiet: in Dossier only. */
  urgent: boolean;
  /** Always emailed; the switch can't be turned off. */
  emailLocked?: boolean;
};

export const NOTIFICATION_GROUPS: {
  id: string;
  name: string;
  description: string;
  events: NotificationEvent[];
}[] = [
  {
    id: 'connections',
    name: 'Connections',
    description: 'When a tool stops syncing, and when it starts again.',
    events: [
      {
        id: 'connection-failed',
        label: 'A connection stops syncing',
        description: 'What went wrong, and whether its settings need changing.',
        urgent: true,
      },
      {
        id: 'connection-recovered',
        label: 'A connection syncs again',
        description: 'After it had stopped.',
        urgent: false,
      },
    ],
  },
  {
    id: 'reports',
    name: 'Weekly reports',
    description: 'Drafts to review, and reports going out to clients.',
    events: [
      {
        id: 'reports-drafted',
        label: 'Weekly reports are drafted',
        description: 'Ready to review, with how many need a closer look.',
        urgent: false,
      },
      {
        id: 'report-sent',
        label: 'A report goes to a client',
        description: 'Sent by someone else, or on schedule.',
        urgent: false,
      },
      {
        id: 'report-failed',
        label: 'A report couldn’t be sent',
        description: 'It isn’t tried again by itself.',
        urgent: true,
      },
      {
        id: 'report-no-recipients',
        label: 'An approved report has no one to go to',
        description: 'Its time to send came, but the client has no recipients.',
        urgent: true,
      },
    ],
  },
  {
    id: 'people',
    name: 'People',
    description: 'Who joins the workspace, and changes to their roles.',
    events: [
      {
        id: 'member-joined',
        label: 'Someone joins the workspace',
        description: 'When they accept an invite.',
        urgent: false,
      },
      {
        id: 'role-changed',
        label: 'A role changes',
        description: 'Yours, or anyone’s if you’re an admin.',
        urgent: false,
      },
      {
        id: 'member-removed',
        label: 'Someone is removed',
        description: 'From the workspace, by an admin.',
        urgent: false,
      },
    ],
  },
  {
    id: 'sign-in',
    name: 'Your sign-in',
    description: 'Changes to how you sign in, so you can act if it wasn’t you.',
    events: [
      {
        id: 'two-factor-off',
        label: 'Two-factor sign-in is turned off',
        description: 'For your account.',
        urgent: true,
        emailLocked: true,
      },
      {
        id: 'password-reset',
        label: 'Your password is reset',
        description: 'Every other session is signed out when it is.',
        urgent: true,
        emailLocked: true,
      },
      {
        id: 'recovery-code-used',
        label: 'A recovery code is used',
        description: 'To sign in to your account in place of a code.',
        urgent: true,
        emailLocked: true,
      },
      {
        id: 'locked-out',
        label: 'Sign-in is paused after wrong passwords',
        description: 'Someone, maybe you, tried too many times.',
        urgent: true,
        emailLocked: true,
      },
    ],
  },
  {
    id: 'intelligence',
    name: 'Intelligence',
    description: 'What Dossier drafts for your clients.',
    events: [
      {
        id: 'drafted',
        label: 'New recommendations are drafted',
        description: 'For clients whose records changed.',
        urgent: false,
      },
      {
        id: 'drafting-failed',
        label: 'Drafting fails',
        description: 'At most once a day.',
        urgent: true,
      },
    ],
  },
];
