import type { RecordSource } from '@dossierhq/contracts';
import { z } from 'zod';
import type {
  ClientLookup,
  ExternalOrg,
  ToolConnector,
  ToolRead,
  ToolSession,
} from '../connector.js';
import { ToolError } from '../http.js';

/** How deep to look inside each client's folder, and how many files to keep. */
const MAX_DEPTH = 4;
const MAX_FILES_PER_CLIENT = 300;
const MAX_PAGES = 200;

const token = z.object({ access_token: z.string() });
const site = z.object({ id: z.string(), webUrl: z.string().nullish() });
const drive = z.object({
  id: z.string(),
  name: z.string().nullish(),
  webUrl: z.string().nullish(),
  driveType: z.string().nullish(),
});
const item = z.object({
  id: z.string(),
  name: z.string(),
  webUrl: z.string(),
  lastModifiedDateTime: z.string().nullish(),
  size: z.number().nullish(),
  file: z.object({ mimeType: z.string().nullish() }).nullish(),
  folder: z.object({ childCount: z.number().nullish() }).nullish(),
  lastModifiedBy: z
    .object({
      user: z.object({ displayName: z.string().nullish() }).nullish(),
    })
    .nullish(),
});
const page = <T extends z.ZodType>(schema: T) =>
  z.object({
    value: z.array(schema),
    '@odata.nextLink': z.string().nullish(),
  });

type Item = z.infer<typeof item>;

const SELECT =
  'id,name,webUrl,lastModifiedDateTime,size,file,folder,lastModifiedBy';

/** Percent-encodes each segment of a drive path, as Graph expects. */
const encodePath = (path: string) =>
  path.split('/').filter(Boolean).map(encodeURIComponent).join('/');

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/**
 * SharePoint client files through Microsoft Graph, app-only. One library
 * folder holds a folder per client; folders whose names match a client attach
 * to it (SharePoint never creates clients), and the files inside become
 * records.
 */
export function sharePointConnector(
  overrides: { loginUrl?: string; graphUrl?: string } = {},
): ToolConnector<'sharepoint'> {
  const login = (
    overrides.loginUrl ?? 'https://login.microsoftonline.com'
  ).replace(/\/+$/, '');
  const graph = (
    overrides.graphUrl ?? 'https://graph.microsoft.com/v1.0'
  ).replace(/\/+$/, '');

  return {
    tool: 'sharepoint',
    access: 'read: files in the client folders of one library',
    createsClients: false,
    home: (c) => c.siteUrl,

    async open(credentials, ctx): Promise<ToolSession> {
      const refused = new ToolError(
        'credentials',
        'Microsoft didn’t accept the tenant ID, client ID and client secret. Check them, and that the secret hasn’t expired.',
      );
      const { access_token } = await ctx.http.json(
        `${login}/${encodeURIComponent(credentials.tenantId)}/oauth2/v2.0/token`,
        token,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials',
          }).toString(),
          what: 'a sign-in token',
          errors: { 400: refused, 401: refused },
        },
      );
      const headers = { authorization: `Bearer ${access_token}` };
      const noAccess = new ToolError(
        'permission',
        'The app can sign in but can’t read this site. Give it the Sites.Read.All application permission (or Sites.Selected with read access to the site) and grant admin consent.',
      );
      const get = <T>(
        url: string,
        schema: z.ZodType<T>,
        what: string,
        missing?: ToolError,
      ) =>
        ctx.http.json(url.startsWith('http') ? url : `${graph}${url}`, schema, {
          headers,
          what,
          errors: { 403: noAccess, ...(missing && { 404: missing }) },
        });

      /** Follows @odata.nextLink, staying on the Graph host. */
      async function all<T>(path: string, schema: z.ZodType<T>, what: string) {
        const items: T[] = [];
        let next: string | null | undefined = path;
        for (let n = 0; next && n < MAX_PAGES; n++) {
          const body: { value: T[]; '@odata.nextLink'?: string | null } =
            await get(next, page(schema), what);
          items.push(...body.value);
          next = body['@odata.nextLink'];
          if (next && new URL(next).host !== new URL(graph).host) break;
        }
        return items;
      }

      // The site, its library and the folder of client folders.
      const siteUrl = new URL(credentials.siteUrl);
      const sitePath = siteUrl.pathname.replace(/\/+$/, '');
      const foundSite = await get(
        sitePath
          ? `/sites/${siteUrl.hostname}:${sitePath}`
          : `/sites/${siteUrl.hostname}`,
        site,
        'the site',
        new ToolError(
          'not-found',
          `Microsoft couldn’t find a site at ${credentials.siteUrl}.`,
        ),
      );
      const drives = await all(
        `/sites/${foundSite.id}/drives?$select=id,name,webUrl,driveType`,
        drive,
        'the site’s libraries',
      );
      const wanted = credentials.library.toLowerCase();
      const libraryName = (d: z.infer<typeof drive>) =>
        decodeURIComponent(d.webUrl?.split('/').pop() ?? '');
      const library = wanted
        ? drives.find(
            (d) =>
              d.name?.toLowerCase() === wanted ||
              libraryName(d).toLowerCase() === wanted,
          )
        : (drives.find((d) => libraryName(d) === 'Shared Documents') ??
          drives.find((d) => d.driveType === 'documentLibrary') ??
          drives[0]);
      if (!library) {
        throw new ToolError(
          'not-found',
          wanted
            ? `There’s no library called “${credentials.library}” in that site.`
            : 'That site has no document libraries.',
        );
      }
      const root = await get(
        credentials.folder
          ? `/drives/${library.id}/root:/${encodePath(credentials.folder)}?$select=${SELECT}`
          : `/drives/${library.id}/root?$select=${SELECT}`,
        item,
        'the client folder',
        new ToolError(
          'not-found',
          `There’s no folder “${credentials.folder}” in the ${library.name ?? 'document'} library.`,
        ),
      );
      const children = (folderId: string) =>
        all(
          `/drives/${library.id}/items/${folderId}/children?$select=${SELECT}&$top=200`,
          item,
          'folder contents',
        );

      let folders: Item[] = [];

      return {
        account: [siteUrl.host + sitePath, library.name, credentials.folder]
          .filter(Boolean)
          .join(' / '),

        async organizations(): Promise<ExternalOrg[]> {
          folders = (await children(root.id)).filter((child) => child.folder);
          ctx.audit('Client folders', folders.length);
          return folders.map((folder) => ({
            externalId: folder.id,
            name: folder.name,
            url: folder.webUrl,
            domains: [],
            location: null,
          }));
        },

        async read(clients: ClientLookup): Promise<ToolRead> {
          const sources: RecordSource[] = [];
          let matched = 0;
          for (const folder of folders) {
            const clientId = clients.forOrg(folder.id);
            if (!clientId) continue;
            matched++;

            const files: { item: Item; path: string }[] = [];
            let level: { id: string; path: string }[] = [
              { id: folder.id, path: '' },
            ];
            for (
              let depth = 0;
              depth < MAX_DEPTH && level.length > 0;
              depth++
            ) {
              const next: { id: string; path: string }[] = [];
              for (const parent of level) {
                for (const child of await children(parent.id)) {
                  const path = parent.path
                    ? `${parent.path}/${child.name}`
                    : child.name;
                  if (child.folder) next.push({ id: child.id, path });
                  else if (child.file)
                    files.push({ item: child, path: parent.path });
                }
              }
              level = next;
            }
            ctx.audit(`Files in ${folder.name}`, files.length, clientId);

            files
              .sort((a, b) =>
                (b.item.lastModifiedDateTime ?? '').localeCompare(
                  a.item.lastModifiedDateTime ?? '',
                ),
              )
              .slice(0, MAX_FILES_PER_CLIENT)
              .forEach(({ item: file, path }) => {
                const modifiedBy = file.lastModifiedBy?.user?.displayName;
                sources.push({
                  id: ctx.id('file', file.id),
                  kind: 'record',
                  clientId,
                  tool: 'sharepoint',
                  recordId: file.name,
                  recordType: 'File',
                  title: file.name,
                  recordedAt: file.lastModifiedDateTime
                    ? new Date(file.lastModifiedDateTime).toISOString()
                    : ctx.now.toISOString(),
                  url: file.webUrl,
                  fields: [
                    {
                      label: 'Folder',
                      value: [folder.name, path].filter(Boolean).join('/'),
                    },
                    ...(modifiedBy
                      ? [{ label: 'Modified by', value: modifiedBy }]
                      : []),
                    ...(file.size != null
                      ? [{ label: 'Size', value: formatSize(file.size) }]
                      : []),
                  ],
                });
              });
          }

          return {
            sources,
            devices: [],
            tickets: [],
            meetings: [],
            commitments: [],
            attention: [],
            scope: `Client files · ${matched} of ${folders.length} folders match a client`,
          };
        },
      };
    },
  };
}
