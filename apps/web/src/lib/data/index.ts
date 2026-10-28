import 'server-only';
import {
  attentionItemSchema,
  auditCountSchema,
  auditPageSchema,
  clientListItemSchema,
  clientSchema,
  clockSchema,
  commitmentSchema,
  connectorSchema,
  deviceSchema,
  intelligenceSettingsSchema,
  invitePreviewSchema,
  inviteSchema,
  listOf,
  meetingAttachmentsSchema,
  meetingSchema,
  meSchema,
  memberSchema,
  sessionsSchema,
  ninjaOneSignInStartSchema,
  recommendationSchema,
  reportQuestionSchema,
  reportSchema,
  reportSummarySchema,
  signInResponseSchema,
  signInStepSchema,
  sourceSchema,
  ticketSchema,
  twoFactorEnabledSchema,
  twoFactorSetupSchema,
  twoFactorStatusSchema,
  workspaceSchema,
  type AttentionItem,
  type AuditCount,
  type AuditEntry,
  type AuditKind,
  type AuditPage,
  type Client,
  type ClientListItem,
  type Commitment,
  type Connector,
  type Device,
  type IntelligencePreferences,
  type IntelligenceSettings,
  type Invite,
  type InviteAccept,
  type InviteCreate,
  type InvitePreview,
  type Me,
  type Member,
  type Sessions,
  type Meeting,
  type MeetingAttachments,
  type ModelId,
  type NinjaOneSignIn,
  type NinjaOneSignInFinish,
  type NinjaOneSignInStart,
  type Recommendation,
  type RecommendationStatus,
  type RecommendationUpdate,
  type Report,
  type ReportQuestion,
  type ReportQuestionCreate,
  type ReportQuestionUpdate,
  type ReportStatus,
  type WorkspaceRole,
  type ReportSummary,
  type ConnectorCredentials,
  type PasswordResetConfirm,
  type PasswordResetRequest,
  type SignInRequest,
  type SignInResponse,
  type TwoFactorSetup,
  type TwoFactorSignIn,
  type TwoFactorStatus,
  type SignUpRequest,
  type Source,
  type Ticket,
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
  /** The password was right; now a two-factor code, with this challenge. */
  | { ok: true; challenge: string }
  | {
      ok: false;
      reason: 'invalid' | 'locked' | 'no-workspace' | 'unavailable';
    };

export type SignUpResult =
  | { ok: true; session: SignInResponse }
  | { ok: false; reason: 'taken' | 'invalid' | 'unavailable' };

/** Creates a workspace and its owner. Never throws for a 4xx. */
export async function signUp(request: SignUpRequest): Promise<SignUpResult> {
  try {
    const session = await apiSend(
      'POST',
      '/auth/sign-up',
      request,
      signInResponseSchema,
      { session: 'none' },
    );
    return { ok: true, session };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return { ok: false, reason: 'taken' };
    }
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

/** Checks credentials with the API. Never throws for a wrong password. */
export async function signIn(request: SignInRequest): Promise<SignInResult> {
  try {
    const step = await apiSend(
      'POST',
      '/auth/sign-in',
      request,
      signInStepSchema,
      { session: 'none' },
    );
    return 'challenge' in step
      ? { ok: true, challenge: step.challenge }
      : { ok: true, session: step };
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

export type TwoFactorResult =
  | { ok: true; session: SignInResponse }
  | { ok: false; reason: 'wrong' | 'expired' | 'limited' | 'unavailable' };

/** Finishes a two-factor sign-in. Never throws for a 4xx. */
export async function completeTwoFactor(
  request: TwoFactorSignIn,
): Promise<TwoFactorResult> {
  try {
    const session = await apiSend(
      'POST',
      '/auth/sign-in/two-factor',
      request,
      signInResponseSchema,
      { session: 'none' },
    );
    return { ok: true, session };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { ok: false, reason: 'wrong' };
    }
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, reason: 'expired' };
    }
    if (error instanceof ApiError && error.status === 429) {
      return { ok: false, reason: 'limited' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

export type ResetRequestResult =
  { ok: true } | { ok: false; reason: 'invalid' | 'limited' | 'unavailable' };

/** Asks for a reset link by email. Never throws for a 4xx. */
export async function requestPasswordReset(
  request: PasswordResetRequest,
): Promise<ResetRequestResult> {
  try {
    await apiSend('POST', '/auth/password-reset', request, undefined, {
      session: 'none',
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return { ok: false, reason: 'limited' };
    }
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

export type ResetResult =
  | { ok: true; session: SignInResponse }
  /** Set, but two-factor is on: the code comes next, with this challenge. */
  | { ok: true; challenge: string }
  | { ok: false; reason: 'expired' | 'unavailable' };

/** Sets a new password with a reset link's token. Never throws for a 4xx. */
export async function resetPassword(
  request: PasswordResetConfirm,
): Promise<ResetResult> {
  try {
    const step = await apiSend(
      'POST',
      '/auth/password-reset/confirm',
      request,
      signInStepSchema,
      { session: 'none' },
    );
    return 'challenge' in step
      ? { ok: true, challenge: step.challenge }
      : { ok: true, session: step };
  } catch (error) {
    // The password was checked before sending, so a 400 is the link itself.
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'unavailable' };
  }
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

/** Recorded meetings no client matched, and the ones attached by hand. */
export const getMeetingAttachments = cache((): Promise<MeetingAttachments> =>
  read(() => apiGet('/meetings/attachments', meetingAttachmentsSchema), {
    unattached: [],
    attached: {},
  }),
);

const devicesFor = cache((clientId?: string): Promise<Device[]> =>
  read(
    async () =>
      (await apiGet(withQuery('/devices', { clientId }), listOf(deviceSchema)))
        .data,
    [],
  ),
);

const ticketsFor = cache((clientId?: string): Promise<Ticket[]> =>
  read(
    async () =>
      (await apiGet(withQuery('/tickets', { clientId }), listOf(ticketSchema)))
        .data,
    [],
  ),
);

/** Open first (most urgent, then most recently updated), then closed. */
export function getTickets({ clientId }: { clientId?: string } = {}): Promise<
  Ticket[]
> {
  return ticketsFor(clientId);
}

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

const reportQuestionsFor = cache(
  (clientId?: string): Promise<ReportQuestion[]> =>
    read(
      async () =>
        (
          await apiGet(
            withQuery('/report-questions', { clientId }),
            listOf(reportQuestionSchema),
          )
        ).data,
      [],
    ),
);

/**
 * Questions the weekly reports answer, oldest first. With `clientId`, that
 * client's and the ones for every client.
 */
export function getReportQuestions({
  clientId,
}: { clientId?: string } = {}): Promise<ReportQuestion[]> {
  return reportQuestionsFor(clientId);
}

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

const auditPageFor = cache(
  (
    kind?: AuditKind,
    tool?: Tool,
    clientId?: string,
    before?: string,
    after?: string,
    limit?: number,
  ): Promise<AuditPage> =>
    read(
      () =>
        apiGet(
          withQuery('/audit', { kind, tool, clientId, before, after, limit }),
          auditPageSchema,
        ),
      { data: [], newer: null, older: null },
    ),
);

/**
 * One page of the audit log, newest first. Pass the page's `older` as
 * `before`, or its `newer` as `after`, to turn it. Technicians get reads
 * only; asking them for sign-ins or changes fails.
 */
export function getAuditPage({
  kind,
  tool,
  clientId,
  before,
  after,
}: {
  kind?: AuditKind;
  tool?: Tool;
  clientId?: string;
  before?: string;
  after?: string;
} = {}): Promise<AuditPage> {
  return auditPageFor(kind, tool, clientId, before, after);
}

/** The newest 200 reads from tools, for summaries such as a tool's recent reads. */
export async function getAuditLog({
  tool,
  clientId,
}: { tool?: Tool; clientId?: string } = {}): Promise<AuditEntry[]> {
  return (await auditPageFor('read', tool, clientId, undefined, undefined, 200))
    .data;
}

const auditCountsFor = cache((clientId?: string): Promise<AuditCount[]> =>
  read(
    async () =>
      (
        await apiGet(
          withQuery('/audit/counts', { clientId }),
          listOf(auditCountSchema),
        )
      ).data,
    [],
  ),
);

/** Reads per tool, then sign-ins and changes; technicians get reads only. */
export function getAuditCounts({
  clientId,
}: { clientId?: string } = {}): Promise<AuditCount[]> {
  return auditCountsFor(clientId);
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

export type DraftReportsResult =
  { ok: true; reports: ReportSummary[] } | { ok: false; problem: string };

/**
 * Drafts this week's report now from the latest sync, for one client or for
 * every client. When the API says no, such as for a report already approved,
 * `problem` says why.
 */
export async function draftReports(
  clientId?: string,
): Promise<DraftReportsResult> {
  try {
    const result = await apiSend(
      'POST',
      '/reports',
      { clientId },
      listOf(reportSummarySchema),
    );
    return { ok: true, reports: result.data };
  } catch (error) {
    return refused(error);
  }
}

export type QuestionResult =
  { ok: true; question: ReportQuestion } | { ok: false; problem: string };

/** Saves a new question, or changes one. The API's no comes back in words. */
export async function saveReportQuestion(
  id: string | null,
  question: ReportQuestionCreate | ReportQuestionUpdate,
): Promise<QuestionResult> {
  try {
    const saved = id
      ? await apiSend(
          'PATCH',
          `/report-questions/${encodeURIComponent(id)}`,
          question,
          reportQuestionSchema,
        )
      : await apiSend(
          'POST',
          '/report-questions',
          question,
          reportQuestionSchema,
        );
    return { ok: true, question: saved };
  } catch (error) {
    return refused(error);
  }
}

export function deleteReportQuestion(id: string): Promise<void> {
  return apiSend('DELETE', `/report-questions/${encodeURIComponent(id)}`);
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

/**
 * Attaches a recorded meeting to a client by hand, or with null undoes that.
 * Resolves once Fathom has synced, or after a few seconds while it carries on.
 */
export function attachMeeting(
  meetingId: string,
  clientId: string | null,
): Promise<void> {
  const path = `/meetings/${encodeURIComponent(meetingId)}/client`;
  return clientId
    ? apiSend('PUT', path, { clientId })
    : apiSend('DELETE', path);
}

export type ConnectResult =
  { ok: true; connector: Connector } | { ok: false; problem: string };

/**
 * Connects a tool, or replaces its credentials. The API tries them with the
 * tool first; when the tool says no, `problem` says why in plain words.
 */
export async function connectTool(
  credentials: ConnectorCredentials,
): Promise<ConnectResult> {
  try {
    const connector = await apiSend(
      'PUT',
      `/connectors/${credentials.tool}`,
      credentials,
      connectorSchema,
    );
    return { ok: true, connector };
  } catch (error) {
    return refused(error);
  }
}

/** The API's no, in its own words; anything else is rethrown. */
function refused(error: unknown): { ok: false; problem: string } {
  if (error instanceof ApiError && error.problem && error.status < 500) {
    return { ok: false, problem: error.problem };
  }
  if (error instanceof ApiError && error.status === 503 && error.problem) {
    return { ok: false, problem: error.problem };
  }
  throw error;
}

/** Where to send someone to sign in to NinjaOne, and what to hand back after. */
export async function startNinjaOneSignIn(
  app: NinjaOneSignIn,
): Promise<
  { ok: true; start: NinjaOneSignInStart } | { ok: false; problem: string }
> {
  try {
    const start = await apiSend(
      'POST',
      '/connectors/ninjaone/sign-in',
      app,
      ninjaOneSignInStartSchema,
    );
    return { ok: true, start };
  } catch (error) {
    return refused(error);
  }
}

/** Connects NinjaOne with what its sign-in sent back. */
export async function finishNinjaOneSignIn(
  finish: NinjaOneSignInFinish,
): Promise<ConnectResult> {
  try {
    const connector = await apiSend(
      'POST',
      '/connectors/ninjaone/sign-in/finish',
      finish,
      connectorSchema,
    );
    return { ok: true, connector };
  } catch (error) {
    return refused(error);
  }
}

export function syncTool(tool: Tool): Promise<Connector> {
  return apiSend(
    'POST',
    `/connectors/${tool}/sync`,
    undefined,
    connectorSchema,
  );
}

export function disconnectTool(tool: Tool): Promise<void> {
  return apiSend('DELETE', `/connectors/${tool}`);
}

export function recordClientView(clientId: string): Promise<void> {
  return apiSend('POST', `/clients/${encodeURIComponent(clientId)}/views`);
}

/** This browser's session, and how many others the user has live. */
export const getSessions = cache((): Promise<Sessions> =>
  apiGet('/auth/sessions', sessionsSchema),
);

/** The signed-in person's two-factor sign-in. */
export const getTwoFactor = cache((): Promise<TwoFactorStatus> =>
  apiGet('/auth/two-factor', twoFactorStatusSchema),
);

export async function setupTwoFactor(): Promise<
  { ok: true; setup: TwoFactorSetup } | { ok: false; problem: string }
> {
  try {
    return {
      ok: true,
      setup: await apiSend(
        'POST',
        '/auth/two-factor/setup',
        undefined,
        twoFactorSetupSchema,
      ),
    };
  } catch (error) {
    return refused(error);
  }
}

export async function enableTwoFactor(
  code: string,
): Promise<
  { ok: true; recoveryCodes: string[] } | { ok: false; problem: string }
> {
  try {
    const { recoveryCodes } = await apiSend(
      'POST',
      '/auth/two-factor/enable',
      { code },
      twoFactorEnabledSchema,
    );
    return { ok: true, recoveryCodes };
  } catch (error) {
    return refused(error);
  }
}

export async function disableTwoFactor(
  code: string,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend('POST', '/auth/two-factor/disable', { code });
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** Signs the user out everywhere but this browser. */
export function signOutOthers(): Promise<void> {
  return apiSend('POST', '/auth/sessions/sign-out-others');
}

// People ----------------------------------------------------------------------

/** Everyone in the workspace, by name. */
export const getMembers = cache(
  async (): Promise<Member[]> =>
    (await apiGet('/members', listOf(memberSchema))).data,
);

/** Admins. Invites not yet accepted, newest first. */
export const getInvites = cache(
  async (): Promise<Invite[]> =>
    (await apiGet('/members/invites', listOf(inviteSchema))).data,
);

/** Emails an invite. The API's no (already has an account, too many) comes back in words. */
export async function inviteMember(
  invite: InviteCreate,
): Promise<{ ok: true; invite: Invite } | { ok: false; problem: string }> {
  try {
    const sent = await apiSend(
      'POST',
      '/members/invites',
      invite,
      inviteSchema,
    );
    return { ok: true, invite: sent };
  } catch (error) {
    return refused(error);
  }
}

export async function withdrawInvite(
  id: string,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend('DELETE', `/members/invites/${encodeURIComponent(id)}`);
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function setMemberRole(
  userId: string,
  role: WorkspaceRole,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend(
      'PATCH',
      `/members/${encodeURIComponent(userId)}`,
      { role },
      memberSchema,
    );
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function removeMember(
  userId: string,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend('DELETE', `/members/${encodeURIComponent(userId)}`);
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** What an invite link is for; null when it can't be used. Needs no session. */
export async function previewInvite(
  token: string,
): Promise<InvitePreview | null> {
  try {
    return await apiSend(
      'POST',
      '/auth/invites/preview',
      { token },
      invitePreviewSchema,
      { session: 'none' },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) return null;
    throw error;
  }
}

export type AcceptInviteResult =
  | { ok: true; session: SignInResponse }
  | { ok: false; reason: 'expired' | 'taken' | 'unavailable' };

/** Accepts an invite. Never throws for a 4xx. */
export async function acceptInvite(
  request: InviteAccept,
): Promise<AcceptInviteResult> {
  try {
    const session = await apiSend(
      'POST',
      '/auth/invites/accept',
      request,
      signInResponseSchema,
      { session: 'none' },
    );
    return { ok: true, session };
  } catch (error) {
    // The fields were checked before sending, so a 400 is the invite itself.
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, reason: 'expired' };
    }
    if (error instanceof ApiError && error.status === 409) {
      return { ok: false, reason: 'taken' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

// Intelligence ----------------------------------------------------------------

/** Which model drafts for this workspace, and what drafting has cost. */
export const getIntelligence = cache((): Promise<IntelligenceSettings> =>
  apiGet('/intelligence', intelligenceSettingsSchema),
);

/** Admins. Null goes back to the default model. */
export function setIntelligenceModel(
  model: ModelId | null,
): Promise<IntelligenceSettings> {
  return apiSend('PUT', '/intelligence', { model }, intelligenceSettingsSchema);
}

/** Admins. All three groups of switches; anything left out is on. */
export function setIntelligencePreferences(
  preferences: IntelligencePreferences,
): Promise<IntelligenceSettings> {
  return apiSend(
    'PUT',
    '/intelligence/preferences',
    preferences,
    intelligenceSettingsSchema,
  );
}

/** Admins. Starts drafting every client's recommendations now. */
export async function draftRecommendationsNow(): Promise<
  { ok: true } | { ok: false; problem: string }
> {
  try {
    await apiSend('POST', '/intelligence/draft');
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}
