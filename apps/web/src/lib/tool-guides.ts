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
  /**
   * Connecting goes through the tool's own sign-in page: the form shows the
   * redirect URI to register, and `alternative` says how to skip signing in.
   */
  signIn?: { alternative: string };
};

/** What each tool needs, and how to get it without granting more than reads. */
export const TOOL_GUIDES: Record<Tool, ToolGuide> = {
  ninjaone: {
    reads:
      'Organizations become clients. Reads devices, patch status, active alerts and tickets.',
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
      {
        name: 'clientSecret',
        label: 'Client secret',
        secret: true,
        optional: true,
        hint: 'Leave it empty if NinjaOne gave you only a client ID. Connecting without tickets needs one.',
      },
    ],
    steps: [
      'In NinjaOne, go to Administration, then Apps, API, Client app IDs, and choose Add.',
      'Set the application platform to Web and name it Dossier.',
      'Add the redirect URI shown here, exactly as it is.',
      'Tick only the Monitoring scope, and allow the Authorization code and Refresh token grant types.',
      'Save, then copy the client ID, and the client secret if NinjaOne shows one. It shows it only once.',
      'Choose Sign in with NinjaOne, and sign in as a technician who can see every client’s tickets. Dossier reads what they can see.',
    ],
    signIn: {
      alternative:
        'Not using NinjaOne tickets? An API Services (machine-to-machine) app with the Client credentials grant connects without signing in, and reads everything but tickets.',
    },
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
      'Reads client meetings from the last 90 days, with Fathom’s summary of each and the action items the MSP took on.',
    fields: [{ name: 'apiKey', label: 'API key', secret: true }],
    steps: [
      'In Fathom, open Settings, then API access, and create a key.',
      'A key sees the meetings its owner recorded or can view, so create it as someone who sees your client meetings.',
      'Meetings join a client by the email domain of the outside invitees, taken from Hudu company websites or the client’s name. Attach any that don’t match from the client’s Meetings tab.',
    ],
  },
};
