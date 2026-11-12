/**
 * What Dossier offers, independent of any workspace: how each tool connects,
 * and what's planned. Wording and facts come from the app this one replaced
 * (its tool guides, in git history under apps/web/src). Models, providers
 * and notifications come from @dossierhq/contracts, through the API.
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
