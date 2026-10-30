import type {
  CredentialsFor,
  RecordSource,
  SharePointBrowse,
  SharePointPlaces,
} from '@dossierhq/contracts';
import { z } from 'zod';
import type {
  ClientLookup,
  ExternalOrg,
  SyncContext,
  ToolConnector,
  ToolRead,
  ToolSession,
} from '../connector.js';
import { ToolError } from '../http.js';

/** How deep to look inside each client's folder, and how many files to keep. */
const MAX_DEPTH = 4;
const MAX_FILES_PER_CLIENT = 300;
const MAX_PAGES = 200;

/** Libraries SharePoint makes for itself, which never hold client files. */
const SYSTEM_LIBRARIES = new Set([
  'formservertemplates',
  'preservationholdlibrary',
  'siteassets',
  'sitepages',
  'style library',
]);

/** People's own OneDrives, which turn up among the sites. */
const ONEDRIVE = /-my\.sharepoint\./i;

const token = z.object({ access_token: z.string() });
const site = z.object({
  id: z.string(),
  name: z.string().nullish(),
  displayName: z.string().nullish(),
  webUrl: z.string().nullish(),
});
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

/** A library's name in its address, e.g. "Shared Documents" for Documents. */
const libraryName = (d: z.infer<typeof drive>) =>
  decodeURIComponent(d.webUrl?.split('/').pop() ?? '');

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** The Entra app's details: the saved credentials, or a form's. */
type App = Pick<
  CredentialsFor<'sharepoint'>,
  'tenantId' | 'clientId' | 'clientSecret'
>;

/** What an app can see, for the connect form's dropdowns. */
export type SharePointListing = Omit<
  Extract<SharePointPlaces, { ok: true }>,
  'ok'
>;

export interface SharePointConnector extends ToolConnector<'sharepoint'> {
  /**
   * Every site the app can read; or, given a site, its libraries and the
   * folders inside `folder` of the chosen one (the main one by default).
   */
  browse(
    request: SharePointBrowse,
    ctx: SyncContext,
  ): Promise<SharePointListing>;
}

/**
 * SharePoint client files through Microsoft Graph, app-only. One library
 * folder holds a folder per client; folders whose names match a client attach
 * to it (SharePoint never creates clients), and the files inside become
 * records.
 */
export function sharePointConnector(
  overrides: { loginUrl?: string; graphUrl?: string } = {},
): SharePointConnector {
  const login = (
    overrides.loginUrl ?? 'https://login.microsoftonline.com'
  ).replace(/\/+$/, '');
  const graph = (
    overrides.graphUrl ?? 'https://graph.microsoft.com/v1.0'
  ).replace(/\/+$/, '');

  /** Signs in as the app; `get` and `all` then read from Graph as it. */
  async function signIn(app: App, ctx: SyncContext) {
    const refused = new ToolError(
      'credentials',
      'Microsoft didn’t accept the tenant ID, client ID and client secret. Check them, and that the secret hasn’t expired.',
    );
    const { access_token } = await ctx.http.json(
      `${login}/${encodeURIComponent(app.tenantId)}/oauth2/v2.0/token`,
      token,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: app.clientId,
          client_secret: app.clientSecret,
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
      'The app can sign in but can’t read SharePoint sites. Give it the Sites.Read.All application permission and grant admin consent.',
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

    return { get, all };
  }

  type Graph = Awaited<ReturnType<typeof signIn>>;

  /**
   * The site at `siteUrl`, its document libraries, the one called `library`
   * (or its main one), and `folder` in that library.
   */
  async function findFolder(
    api: Graph,
    {
      siteUrl,
      library: wanted,
      folder,
    }: { siteUrl: string; library: string; folder: string },
  ) {
    const url = new URL(siteUrl);
    const sitePath = url.pathname.replace(/\/+$/, '');
    const foundSite = await api.get(
      sitePath
        ? `/sites/${url.hostname}:${sitePath}`
        : `/sites/${url.hostname}`,
      site,
      'the site',
      new ToolError(
        'not-found',
        `Microsoft couldn’t find a site at ${siteUrl}.`,
      ),
    );
    const drives = await api.all(
      `/sites/${foundSite.id}/drives?$select=id,name,webUrl,driveType`,
      drive,
      'the site’s libraries',
    );
    const name = wanted.toLowerCase();
    const library = name
      ? drives.find(
          (d) =>
            d.name?.toLowerCase() === name ||
            libraryName(d).toLowerCase() === name,
        )
      : (drives.find((d) => libraryName(d) === 'Shared Documents') ??
        drives.find((d) => d.driveType === 'documentLibrary') ??
        drives[0]);
    if (!library) {
      throw new ToolError(
        'not-found',
        name
          ? `There’s no library called “${wanted}” in that site.`
          : 'That site has no document libraries.',
      );
    }
    const root = await api.get(
      folder
        ? `/drives/${library.id}/root:/${encodePath(folder)}?$select=${SELECT}`
        : `/drives/${library.id}/root?$select=${SELECT}`,
      item,
      'the client folder',
      new ToolError(
        'not-found',
        `There’s no folder “${folder}” in the ${library.name ?? 'document'} library.`,
      ),
    );
    const children = (folderId: string) =>
      api.all(
        `/drives/${library.id}/items/${folderId}/children?$select=${SELECT}&$top=200`,
        item,
        'folder contents',
      );
    return { url, sitePath, drives, library, root, children };
  }

  return {
    tool: 'sharepoint',
    access: 'read: files in the client folders of one library',
    createsClients: false,
    home: (c) => c.siteUrl,

    async browse(request, ctx) {
      const api = await signIn(request, ctx);
      if (!request.siteUrl) {
        const found = await api.all(
          '/sites?search=*&$select=id,name,displayName,webUrl',
          site,
          'the list of sites',
        );
        // People's own OneDrives turn up too; they never hold client folders.
        const sites = [
          ...new Map(
            found
              .filter((s) => s.webUrl && !ONEDRIVE.test(s.webUrl))
              .map((s) => [
                s.webUrl!,
                {
                  name: s.displayName || s.name || s.webUrl!,
                  url: s.webUrl!.replace(/\/+$/, ''),
                },
              ]),
          ).values(),
        ].sort((a, b) => a.name.localeCompare(b.name));
        ctx.audit('Sites', sites.length);
        return { sites };
      }

      const { drives, library, root, children } = await findFolder(api, {
        siteUrl: request.siteUrl,
        library: request.library,
        folder: request.folder,
      });
      const folders = (await children(root.id))
        .filter((child) => child.folder)
        .map((child) => child.name)
        .sort((a, b) => a.localeCompare(b));
      ctx.audit(
        `Folders in ${[library.name, request.folder].filter(Boolean).join('/')}`,
        folders.length,
      );
      return {
        libraries: drives
          .filter(
            (d) =>
              d.driveType === 'documentLibrary' &&
              !SYSTEM_LIBRARIES.has(libraryName(d).toLowerCase()),
          )
          .map((d) => d.name ?? libraryName(d)),
        library: library.name ?? libraryName(library),
        folders,
      };
    },

    async open(credentials, ctx): Promise<ToolSession> {
      const api = await signIn(credentials, ctx);
      // The site, its library and the folder of client folders.
      const {
        url: siteUrl,
        sitePath,
        library,
        root,
        children,
      } = await findFolder(api, credentials);

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
