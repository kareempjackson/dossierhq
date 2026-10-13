import 'server-only';
import {
  attentionItemSchema,
  auditEntrySchema,
  clientListItemSchema,
  clientSchema,
  clockSchema,
  commitmentSchema,
  connectorSchema,
  deviceSchema,
  listOf,
  meetingSchema,
  meSchema,
  recommendationSchema,
  reportSchema,
  reportSummarySchema,
  signInResponseSchema,
  sourceSchema,
  workspaceSchema,
  type AttentionItem,
  type AuditEntry,
  type Client,
  type ClientListItem,
  type Commitment,
  type Connector,
  type Device,
  type Me,
  type Meeting,
  type Recommendation,
  type RecommendationStatus,
  type RecommendationUpdate,
  type Report,
  type ReportStatus,
  type ReportSummary,
  type SignInRequest,
  type SignInResponse,
  type Source,
  type Tool,
  type Workspace,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { ApiError, apiFind, apiGet, apiSend, withQuery } from '../api';

/**
 * The web app's only way to read and change Dossier data. Every function
 * returns contract types from the NestJS API; pages never call the API
 * directly. Reads are de-duplicated within a request by React's cache().
 *
 * Set PREVIEW_STATE in apps/web/.env.local to preview list states in dev:
 *   empty  every list comes back empty
 *   error  every list read fails
 *   slow   every read waits 1.5s, so loading states show
 */
const preview = process.env.PREVIEW_STATE;

async function read<T>(load: () => Promise<T>, empty: T): Promise<T> {
  if (preview === 'slow') await new Promise((r) => setTimeout(r, 1500));
  if (preview === 'error') throw new Error('PREVIEW_STATE=error');
  return preview === 'empty' ? empty : load();
}

// Session ---------------------------------------------------------------------

/** Who is signed in, and the workspace the session acts on. */
export const getMe = cache((): Promise<Me> => apiGet('/auth/me', meSchema));

export type SignInResult =
  | { ok: true; session: SignInResponse }
  | {
      ok: false;
      reason: 'invalid' | 'locked' | 'no-workspace' | 'unavailable';
    };

/** Checks credentials with the API. Never throws for a wrong password. */
export async function signIn(request: SignInRequest): Promise<SignInResult> {
  try {
    const session = await apiSend(
      'POST',
      '/auth/sign-in',
      request,
      signInResponseSchema,
      { session: 'none' },
    );
    return { ok: true, session };
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 400)
    ) {
      return { ok: false, reason: 'invalid' };
    }
    if (error instanceof ApiError && error.status === 429) {
      return { ok: false, reason: 'locked' };
    }
    if (error instanceof ApiError && error.status === 403) {
      return { ok: false, reason: 'no-workspace' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

export function signOut(): Promise<void> {
  // Never redirects: signing out of an already-expired session still has to
  // reach the cookie-clearing step in the action.
  return apiSend('POST', '/auth/sign-out', undefined, undefined, {
    session: 'best-effort',
  });
}

// Workspace and clients -----------------------------------------------------

/** The moment the data describes. Use it instead of `Date.now()`. */
export const getNow = cache(
  async (): Promise<string> => (await apiGet('/clock', clockSchema)).now,
);

export const getWorkspace = cache((): Promise<Workspace> =>
  apiGet('/workspace', workspaceSchema),
);

export const getClients = cache((): Promise<Client[]> =>
  read(async () => (await apiGet('/clients', listOf(clientSchema))).data, []),
);

export const getClient = cache((id: string): Promise<Client | null> =>
  read(() => apiFind(`/clients/${encodeURIComponent(id)}`, clientSchema), null),
);

/** Most recently opened first. */
export const getRecentClients = cache((limit: number = 5): Promise<Client[]> =>
  read(
    async () =>
      (
        await apiGet(
          withQuery('/clients/recent', { limit }),
          listOf(clientSchema),
        )
      ).data,
    [],
  ),
);

/** Every client with what's current there. Most urgent first. */
export const getClientList = cache((): Promise<ClientListItem[]> =>
  read(
    async () =>
      (await apiGet('/clients/overview', listOf(clientListItemSchema))).data,
    [],
  ),
);

// Attention, recommendations, commitments -----------------------------------
// The exported functions take an options object; the cached loaders behind
// them take plain arguments, so cache() can de-duplicate the calls.

const attentionFor = cache((clientId?: string): Promise<AttentionItem[]> =>
  read(
    async () =>
      (
        await apiGet(
          withQuery('/attention', { clientId }),
          listOf(attentionItemSchema),
        )
      ).data,
    [],
  ),
);

/** Most urgent first, then newest first. */
export function getAttentionItems({
  clientId,
}: { clientId?: string } = {}): Promise<AttentionItem[]> {
  return attentionFor(clientId);
}

const recommendationsFor = cache(
  (
    clientId?: string,
    status?: RecommendationStatus,
  ): Promise<Recommendation[]> =>
    read(
      async () =>
        (
          await apiGet(
            withQuery('/recommendations', { clientId, status }),
            listOf(recommendationSchema),
          )
        ).data,
      [],
    ),
);

/** Newest first. */
export function getRecommendations({
  clientId,
  status,
}: {
  clientId?: string;
  status?: RecommendationStatus;
} = {}): Promise<Recommendation[]> {
  return recommendationsFor(clientId, status);
}

const commitmentsFor = cache((clientId?: string): Promise<Commitment[]> =>
  read(
    async () =>
      (
        await apiGet(
          withQuery('/commitments', { clientId }),
          listOf(commitmentSchema),
        )
      ).data,
    [],
  ),
);

/** Open first (soonest due first), then done (most recent first). */
export function getCommitments({
  clientId,
}: { clientId?: string } = {}): Promise<Commitment[]> {
  return commitmentsFor(clientId);
}

// Meetings and devices ------------------------------------------------------

const meetingsFor = cache((clientId?: string): Promise<Meeting[]> =>
  read(
    async () =>
      (
        await apiGet(
          withQuery('/meetings', { clientId }),
          listOf(meetingSchema),
        )
      ).data,
    [],
  ),
);

/** Newest first. */
export function getMeetings({ clientId }: { clientId?: string } = {}): Promise<
  Meeting[]
> {
  return meetingsFor(clientId);
}

const devicesFor = cache((clientId?: string): Promise<Device[]> =>
  read(
    async () =>
      (await apiGet(withQuery('/devices', { clientId }), listOf(deviceSchema)))
        .data,
    [],
  ),
);

/** Devices needing work first, then by name. */
export function getDevices({ clientId }: { clientId?: string } = {}): Promise<
  Device[]
> {
  return devicesFor(clientId);
}

// Reports -------------------------------------------------------------------

const reportSummariesFor = cache(
  (clientId?: string, status?: ReportStatus): Promise<ReportSummary[]> =>
    read(
      async () =>
        (
          await apiGet(
            withQuery('/reports', { clientId, status }),
            listOf(reportSummarySchema),
          )
        ).data,
      [],
    ),
);

/** Newest week first; within a week, by client name. */
export function getReportSummaries({
  clientId,
  status,
}: {
  clientId?: string;
  status?: ReportStatus;
} = {}): Promise<ReportSummary[]> {
  return reportSummariesFor(clientId, status);
}

export const getReport = cache((id: string): Promise<Report | null> =>
  read(() => apiFind(`/reports/${encodeURIComponent(id)}`, reportSchema), null),
);

/** Drafts waiting for review: exceptions first, then clean, each by name. */
export const getReviewQueue = cache((): Promise<ReportSummary[]> =>
  read(
    async () =>
      (await apiGet('/reports/queue', listOf(reportSummarySchema))).data,
    [],
  ),
);

// Sources and connections ---------------------------------------------------

const sourcesByIds = cache((ids: string): Promise<Source[]> =>
  read(
    async () =>
      (await apiGet(withQuery('/sources', { ids }), listOf(sourceSchema))).data,
    [],
  ),
);

/** The sources with these IDs, in the same order. Unknown IDs are skipped. */
export async function getSources(ids: string[]): Promise<Source[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  // The API takes at most 200 IDs per request.
  const chunks: string[] = [];
  for (let i = 0; i < unique.length; i += 200) {
    chunks.push(unique.slice(i, i + 200).join(','));
  }
  const found = (await Promise.all(chunks.map(sourcesByIds))).flat();
  const byId = new Map(found.map((source) => [source.id, source]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Everything Dossier has read about a client, newest first. */
export const getClientSources = cache((clientId: string): Promise<Source[]> =>
  read(
    async () =>
      (
        await apiGet(
          `/clients/${encodeURIComponent(clientId)}/sources`,
          listOf(sourceSchema),
        )
      ).data,
    [],
  ),
);

export const getConnectors = cache((): Promise<Connector[]> =>
  read(
    async () => (await apiGet('/connectors', listOf(connectorSchema))).data,
    [],
  ),
);

const auditFor = cache(
  (tool?: Tool, clientId?: string): Promise<AuditEntry[]> =>
    read(
      async () =>
        (
          await apiGet(
            withQuery('/audit', { tool, clientId }),
            listOf(auditEntrySchema),
          )
        ).data,
      [],
    ),
);

/** Newest first. */
export function getAuditLog({
  tool,
  clientId,
}: { tool?: Tool; clientId?: string } = {}): Promise<AuditEntry[]> {
  return auditFor(tool, clientId);
}

// Changes -------------------------------------------------------------------
// Called from the Server Actions in app/actions.ts.

export function setReportStatus(
  id: string,
  status: ReportStatus,
): Promise<ReportSummary> {
  return apiSend(
    'PATCH',
    `/reports/${encodeURIComponent(id)}`,
    { status },
    reportSummarySchema,
  );
}

export async function setReportsStatus(
  ids: string[],
  status: ReportStatus,
): Promise<ReportSummary[]> {
  const result = await apiSend(
    'POST',
    '/reports/status',
    { ids, status },
    listOf(reportSummarySchema),
  );
  return result.data;
}

export function updateRecommendation(
  id: string,
  update: RecommendationUpdate,
): Promise<Recommendation> {
  return apiSend(
    'PATCH',
    `/recommendations/${encodeURIComponent(id)}`,
    update,
    recommendationSchema,
  );
}

export function recordClientView(clientId: string): Promise<void> {
  return apiSend('POST', `/clients/${encodeURIComponent(clientId)}/views`);
}
