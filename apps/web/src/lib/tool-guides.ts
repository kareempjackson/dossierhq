import {
  NINJAONE_REGIONS,
  ninjaOneRegionSchema,
  type Tool,
} from '@dossierhq/contracts';

export type GuideField = {
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  /** Never echoed back or shown again once saved. */
  secret?: boolean;
  optional?: boolean;
  type?: 'url';
  options?: { value: string; label: string }[];
};

export type ToolGuide = {
  /** What connecting it does, in a line. */
  reads: string;
  fields: GuideField[];
  /** How to create read-only credentials in the tool, in order. */
  steps: string[];
};

/** What each tool needs, and how to get it without granting more than reads. */
export const TOOL_GUIDES: Record<Tool, ToolGuide> = {
  ninjaone: {
    reads:
      'Organizations become clients. Reads devices, patch status and active alerts.',
    fields: [
      {
        name: 'region',
        label: 'Region',
        hint: 'The address you sign in to NinjaOne at.',
        options: ninjaOneRegionSchema.options.map((value) => ({
          value,
          label: NINJAONE_REGIONS[value].label,
        })),
      },
      { name: 'clientId', label: 'Client ID' },
      { name: 'clientSecret', label: 'Client secret', secret: true },
    ],
    steps: [
      'In NinjaOne, go to Administration, then Apps, API, Client app IDs, and choose Add.',
      'Set the application platform to API Services (machine-to-machine) and name it Dossier.',
      'Tick only the Monitoring scope, allow the Client credentials grant type, and leave the redirect URIs empty.',
      'Save, then copy the client ID and client secret.',
    ],
  },
  hudu: {
    reads:
      'Companies become clients. Reads assets, websites and expiry dates, never passwords.',
    fields: [
      {
        name: 'url',
        label: 'Hudu address',
        placeholder: 'https://yourcompany.huducloud.com',
        type: 'url',
      },
      { name: 'apiKey', label: 'API key', secret: true },
    ],
    steps: [
      'In Hudu, open the admin area, then API keys, and choose New API key.',
      'Leave password access, destructive actions and exports switched off. Hudu has no read-only key; this is the closest to one.',
      'If you limit the key to certain IP addresses, include the one Dossier’s server uses.',
      'Copy the key straight away. Hudu hides it after a few minutes.',
    ],
  },
  sharepoint: {
    reads:
      'Reads the files in each client’s folder. A folder joins the client with the same name.',
    fields: [
      {
        name: 'siteUrl',
        label: 'Site address',
        placeholder: 'https://yourcompany.sharepoint.com/sites/Clients',
        type: 'url',
      },
      {
        name: 'folder',
        label: 'Folder of client folders',
        hint: 'Inside the library, e.g. Clients. Leave empty if the client folders are at the top.',
        optional: true,
      },
      {
        name: 'library',
        label: 'Library',
        hint: 'Leave empty for the site’s main Documents library.',
        optional: true,
      },
      { name: 'tenantId', label: 'Directory (tenant) ID' },
      { name: 'clientId', label: 'Application (client) ID' },
      { name: 'clientSecret', label: 'Client secret', secret: true },
    ],
    steps: [
      'In the Microsoft Entra admin center, go to App registrations, choose New registration, name it Dossier and keep it single tenant.',
      'Under API permissions, add Microsoft Graph, Application permissions, Sites.Read.All, then grant admin consent. To limit Dossier to one site, use Sites.Selected and give it read access to that site instead.',
      'Under Certificates & secrets, add a client secret and copy its value. Note when it expires; Dossier will say when it stops working.',
      'Copy the directory (tenant) ID and application (client) ID from the app’s overview.',
    ],
  },
  fathom: {
    reads:
      'Reads client meetings from the last 90 days, and the action items the MSP took on.',
    fields: [{ name: 'apiKey', label: 'API key', secret: true }],
    steps: [
      'In Fathom, open Settings, then API access, and create a key.',
      'A key sees the meetings its owner recorded or can view, so create it as someone who sees your client meetings.',
      'Meetings join a client by the email domain of the outside invitees, taken from Hudu company websites or the client’s name.',
    ],
  },
};
