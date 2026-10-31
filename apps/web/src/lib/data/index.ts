import 'server-only';
import {
  askAnswerSchema,
  askSummarySchema,
  attentionItemSchema,
  auditCountSchema,
  auditPageSchema,
  clientListItemSchema,
  clientSchema,
  clockSchema,
  commitmentSchema,
  connectionTestSchema,
  meetingNoteSchema,
  notesInboxSchema,
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
  notificationCountSchema,
  notificationPageSchema,
  notificationReadResultSchema,
  notificationSettingsSchema,
  sessionsSchema,
  ninjaOneSignInStartSchema,
  patternSchema,
  sharePointPlacesSchema,
  recommendationSchema,
  contractDocumentSchema,
  outboxItemSchema,
  recipientSchema,
  reportDeliverySchema,
  reportDeliveryStatusSchema,
  reportEmailSchema,
  reportQuestionSchema,
  reportSchema,
  reportSettingsSchema,
  reportSummarySchema,
  signInResponseSchema,
  signInStepSchema,
  supportSessionSchema,
  sourceSchema,
  ticketSchema,
  twoFactorEnabledSchema,
  twoFactorSetupSchema,
  twoFactorStatusSchema,
  workspaceSchema,
  type AskAnswer,
  type AskSummary,
  type AttentionItem,
  type AuditCount,
  type AuditEntry,
  type AuditKind,
  type AuditPage,
  type Client,
  type ClientListItem,
  type Commitment,
  type ConnectionTest,
  type MeetingNote,
  type NewMeetingNote,
  type NotesInbox,
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
  type NotificationPage,
  type NotificationPreferencesUpdate,
  type NotificationSetting,
  type Sessions,
  type Meeting,
  type MeetingAttachments,
  type ModelId,
  type NinjaOneSignIn,
  type NinjaOneSignInFinish,
  type NinjaOneSignInStart,
  type Pattern,
  type SharePointBrowse,
  type SharePointPlaces,
  type Recommendation,
  type RecommendationStatus,
  type RecommendationUpdate,
  type ContractDocument,
  type ContractDocumentType,
  type ContractUpdate,
  type LogoType,
  type OutboxItem,
  type Recipient,
  type RecipientsUpdate,
  type Report,
  type ReportDelivery,
  type ReportDeliveryStatus,
  type ReportEdit,
  type ReportEmail,
  type ReportSettings,
  type ReportSettingsUpdate,
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
  type SupportSession,
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
import {
  ApiError,
  isSuspended,
  apiDownload,
  apiFind,
  apiGet,
  apiSend,
  apiUpload,
  withQuery,
} from '../api';

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
      reason:
        'invalid' | 'locked' | 'no-workspace' | 'suspended' | 'unavailable';
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
    if (isSuspended(error)) return { ok: false, reason: 'suspended' };
    if (error instanceof ApiError && error.status === 403) {
      return { ok: false, reason: 'no-workspace' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

export type SupportRedeemResult =
  | { ok: true; session: SupportSession }
  | { ok: false; reason: 'expired' | 'unavailable' };

/** Opens a support link from Dossier Admin. Never throws for a 4xx. */
export async function redeemSupport(
  token: string,
): Promise<SupportRedeemResult> {
  try {
    const session = await apiSend(
      'POST',
      '/auth/support/redeem',
      { token },
      supportSessionSchema,
      { session: 'none' },
    );
    return { ok: true, session };
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      return { ok: false, reason: 'expired' };
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
  | {
      ok: false;
      reason: 'wrong' | 'expired' | 'limited' | 'suspended' | 'unavailable';
    };

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
    if (isSuspended(error)) return { ok: false, reason: 'suspended' };
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
  | { ok: false; reason: 'expired' | 'suspended' | 'unavailable' };

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
    if (isSuspended(error)) return { ok: false, reason: 'suspended' };
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

/** Notes people added for a client's meetings, newest meeting first. */
export const getNotes = cache((clientId: string): Promise<MeetingNote[]> =>
  read(
    async () =>
      (
        await apiGet(
          withQuery('/notes', { clientId }),
          listOf(meetingNoteSchema),
        )
      ).data,
    [],
  ),
);

/** Notes waiting for a client, and the address to forward more to. */
export const getNotesInbox = cache((): Promise<NotesInbox> =>
  read(() => apiGet('/notes/inbox', notesInboxSchema), {
    address: null,
    notes: [],
  }),
);

export async function addNotes(
  note: NewMeetingNote,
): Promise<{ ok: true; note: MeetingNote } | { ok: false; problem: string }> {
  try {
    return {
      ok: true,
      note: await apiSend('POST', '/notes', note, meetingNoteSchema),
    };
  } catch (error) {
    return refused(error);
  }
}

/** Files notes with a client, or with null puts them back in the inbox. */
export function fileNotes(
  id: string,
  clientId: string | null,
): Promise<MeetingNote> {
  return apiSend(
    'PATCH',
    `/notes/${encodeURIComponent(id)}`,
    { clientId },
    meetingNoteSchema,
  );
}

export function deleteNotes(id: string): Promise<void> {
  return apiSend('DELETE', `/notes/${encodeURIComponent(id)}`);
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

/** Who a report goes to, when, and every try so far; null if there's no such report. */
export const getReportDelivery = cache(
  (id: string): Promise<ReportDeliveryStatus | null> =>
    read(
      () =>
        apiFind(
          `/reports/${encodeURIComponent(id)}/delivery`,
          reportDeliveryStatusSchema,
        ),
      null,
    ),
);

/** Approved reports from the last two weeks that haven't gone yet. */
export const getOutbox = cache((): Promise<OutboxItem[]> =>
  read(
    async () =>
      (await apiGet('/reports/outbox', listOf(outboxItemSchema))).data,
    [],
  ),
);

/** The email a report goes out as. */
export function getReportEmail(id: string): Promise<ReportEmail> {
  return apiGet(`/reports/${encodeURIComponent(id)}/email`, reportEmailSchema);
}

/** How reports look when they go out, and when they're drafted and sent. */
export const getReportSettings = cache((): Promise<ReportSettings> =>
  apiGet('/report-settings', reportSettingsSchema),
);

/** Who a client's weekly report goes to. */
export const getRecipients = cache((clientId: string): Promise<Recipient[]> =>
  read(
    async () =>
      (
        await apiGet(
          `/clients/${encodeURIComponent(clientId)}/recipients`,
          listOf(recipientSchema),
        )
      ).data,
    [],
  ),
);

/** The files kept with a client's contract, newest first. */
export const getContractDocuments = cache(
  (clientId: string): Promise<ContractDocument[]> =>
    read(
      async () =>
        (
          await apiGet(
            `/clients/${encodeURIComponent(clientId)}/contract/documents`,
            listOf(contractDocumentSchema),
          )
        ).data,
      [],
    ),
);

/** One contract file as the API sends it, for the download route to pass on. */
export function openContractDocument(
  clientId: string,
  documentId: string,
): Promise<Response> {
  return apiDownload(
    `/clients/${encodeURIComponent(clientId)}/contract/documents/${encodeURIComponent(documentId)}`,
  );
}

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

/** Approves, skips or reopens one report; the API's no comes back in words. */
export async function setReportStatus(
  id: string,
  status: ReportStatus,
): Promise<
  { ok: true; report: ReportSummary } | { ok: false; problem: string }
> {
  try {
    const report = await apiSend(
      'PATCH',
      `/reports/${encodeURIComponent(id)}`,
      { status },
      reportSummarySchema,
    );
    return { ok: true, report };
  } catch (error) {
    return refused(error);
  }
}

/**
 * Approves, skips or reopens several at once. The API's no, such as for a
 * report with exceptions in a bulk approval, comes back in words.
 */
export async function setReportsStatus(
  ids: string[],
  status: ReportStatus,
): Promise<
  { ok: true; reports: ReportSummary[] } | { ok: false; problem: string }
> {
  try {
    const result = await apiSend(
      'POST',
      '/reports/status',
      { ids, status },
      listOf(reportSummarySchema),
    );
    return { ok: true, reports: result.data };
  } catch (error) {
    return refused(error);
  }
}

/** Rewords or removes a draft's lines. */
export async function editReport(
  id: string,
  edit: ReportEdit,
): Promise<{ ok: true; report: Report } | { ok: false; problem: string }> {
  try {
    const report = await apiSend(
      'PATCH',
      `/reports/${encodeURIComponent(id)}`,
      edit,
      reportSchema,
    );
    return { ok: true, report };
  } catch (error) {
    return refused(error);
  }
}

/** Sends an approved report to its client now. */
export async function sendReport(
  id: string,
): Promise<
  { ok: true; delivery: ReportDelivery } | { ok: false; problem: string }
> {
  try {
    const delivery = await apiSend(
      'POST',
      `/reports/${encodeURIComponent(id)}/send`,
      undefined,
      reportDeliverySchema,
    );
    return { ok: true, delivery };
  } catch (error) {
    return refused(error);
  }
}

export async function saveReportSettings(
  update: ReportSettingsUpdate,
): Promise<
  { ok: true; settings: ReportSettings } | { ok: false; problem: string }
> {
  try {
    const settings = await apiSend(
      'PUT',
      '/report-settings',
      update,
      reportSettingsSchema,
    );
    return { ok: true, settings };
  } catch (error) {
    return refused(error);
  }
}

/** Replaces the logo, or with null removes it. */
export async function saveLogo(
  logo: { bytes: Uint8Array<ArrayBuffer>; type: LogoType } | null,
): Promise<
  { ok: true; settings: ReportSettings } | { ok: false; problem: string }
> {
  try {
    const settings = logo
      ? await apiUpload('/report-settings/logo', logo, reportSettingsSchema)
      : await apiSend(
          'DELETE',
          '/report-settings/logo',
          undefined,
          reportSettingsSchema,
        );
    return { ok: true, settings };
  } catch (error) {
    return refused(error);
  }
}

/** Sets a client's contract, or with null clears it. */
export async function saveContract(
  clientId: string,
  contract: ContractUpdate | null,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  const path = `/clients/${encodeURIComponent(clientId)}/contract`;
  try {
    if (contract) {
      await apiSend('PUT', path, contract, clientSchema);
    } else {
      await apiSend('DELETE', path, undefined, clientSchema);
    }
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function addContractDocument(
  clientId: string,
  file: {
    bytes: Uint8Array<ArrayBuffer>;
    type: ContractDocumentType;
    name: string;
  },
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiUpload(
      withQuery(`/clients/${encodeURIComponent(clientId)}/contract/documents`, {
        name: file.name,
      }),
      file,
      contractDocumentSchema,
      'POST',
    );
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function deleteContractDocument(
  clientId: string,
  documentId: string,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend(
      'DELETE',
      `/clients/${encodeURIComponent(clientId)}/contract/documents/${encodeURIComponent(documentId)}`,
    );
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function saveRecipients(
  clientId: string,
  recipients: RecipientsUpdate['recipients'],
): Promise<
  { ok: true; recipients: Recipient[] } | { ok: false; problem: string }
> {
  try {
    const result = await apiSend(
      'PUT',
      `/clients/${encodeURIComponent(clientId)}/recipients`,
      { recipients },
      listOf(recipientSchema),
    );
    return { ok: true, recipients: result.data };
  } catch (error) {
    return refused(error);
  }
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

/** Tries credentials from the connect form with the tool, saving nothing. */
export async function testCredentials(
  credentials: ConnectorCredentials,
): Promise<ConnectionTest> {
  try {
    return await apiSend(
      'POST',
      '/connectors/test',
      credentials,
      connectionTestSchema,
    );
  } catch (error) {
    return refused(error);
  }
}

/** What an Entra app can see in SharePoint, for the connect form's dropdowns. */
export async function browseSharePoint(
  request: SharePointBrowse,
): Promise<SharePointPlaces> {
  try {
    return await apiSend(
      'POST',
      '/connectors/sharepoint/browse',
      request,
      sharePointPlacesSchema,
    );
  } catch (error) {
    return refused(error);
  }
}

/** Tries the saved credentials with the tool, saving nothing. */
export async function testConnection(tool: Tool): Promise<ConnectionTest> {
  try {
    return await apiSend(
      'POST',
      `/connectors/${tool}/test`,
      undefined,
      connectionTestSchema,
    );
  } catch (error) {
    return refused(error);
  }
}

/** The API's no, in its own words; anything else is rethrown. */
function refused(error: unknown): { ok: false; problem: string } {
  if (error instanceof ApiError && error.problem && error.status < 500) {
    return { ok: false, problem: error.problem };
  }
  // A tool or the mail provider said no (502), or isn't set up (503).
  if (
    error instanceof ApiError &&
    (error.status === 502 || error.status === 503) &&
    error.problem
  ) {
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
    // A suspended workspace's invites can't be used until it's restored.
    if (error instanceof ApiError && error.status === 400) return null;
    if (isSuspended(error)) return null;
    throw error;
  }
}

export type AcceptInviteResult =
  | { ok: true; session: SignInResponse }
  | { ok: false; reason: 'expired' | 'taken' | 'suspended' | 'unavailable' };

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
    if (isSuspended(error)) return { ok: false, reason: 'suspended' };
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

/** Admins. Starts looking for patterns across clients now. */
export async function findPatternsNow(): Promise<
  { ok: true } | { ok: false; problem: string }
> {
  try {
    await apiSend('POST', '/intelligence/patterns');
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** What several clients share, most important first; none while it's off. */
export const getPatterns = cache((): Promise<Pattern[]> =>
  read(async () => (await apiGet('/patterns', listOf(patternSchema))).data, []),
);

// Ask Dossier -------------------------------------------------------------------

/**
 * Asks a question. Answers at once with the question while Dossier works
 * on the answer; the API says why when it won't take it.
 */
export async function askDossier(
  question: string,
): Promise<{ ok: true; answer: AskAnswer } | { ok: false; problem: string }> {
  try {
    return {
      ok: true,
      answer: await apiSend('POST', '/ask', { question }, askAnswerSchema),
    };
  } catch (error) {
    return refused(error);
  }
}

/** Null when there's no such answer in this workspace. */
export const getAskAnswer = cache((id: string): Promise<AskAnswer | null> =>
  apiFind(`/ask/${encodeURIComponent(id)}`, askAnswerSchema),
);

const askHistoryFor = cache(
  (mine: boolean, limit: number): Promise<AskSummary[]> =>
    read(
      async () =>
        (
          await apiGet(
            withQuery('/ask', { mine: mine ? 'true' : undefined, limit }),
            listOf(askSummarySchema),
          )
        ).data,
      [],
    ),
);

/** Questions asked here, newest first; `mine` keeps the signed-in person's. */
export function getAskHistory({
  mine = false,
  limit = 20,
}: { mine?: boolean; limit?: number } = {}): Promise<AskSummary[]> {
  return askHistoryFor(mine, limit);
}

/** The person who asked, or an admin. */
export async function deleteAskAnswer(
  id: string,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend('DELETE', `/ask/${encodeURIComponent(id)}`);
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

// Notifications -----------------------------------------------------------------
// Always the signed-in person's own.

const notificationPageFor = cache(
  (unread: boolean, before?: string): Promise<NotificationPage> =>
    read(
      () =>
        apiGet(
          withQuery('/notifications', {
            unread: unread ? 'true' : undefined,
            before,
          }),
          notificationPageSchema,
        ),
      { data: [], older: null },
    ),
);

/** Your notifications, newest first. Pass the page's `older` as `before` to turn it. */
export function getNotifications({
  unread = false,
  before,
}: { unread?: boolean; before?: string } = {}): Promise<NotificationPage> {
  return notificationPageFor(unread, before);
}

/** How many of yours are unread, for the sidebar. */
export const getUnreadNotificationCount = cache(
  async (): Promise<number> =>
    (await apiGet('/notifications/count', notificationCountSchema)).unread,
);

/** What you hear about and how, for each event your role can hear about. */
export const getNotificationSettings = cache(
  async (): Promise<NotificationSetting[]> =>
    (await apiGet('/notifications/preferences', notificationSettingsSchema))
      .data,
);

/** Marks some of yours read, or all of them. */
export async function markNotificationsRead(
  ids: string[] | 'all',
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend(
      'POST',
      '/notifications/read',
      ids === 'all' ? { all: true } : { ids },
      notificationReadResultSchema,
    );
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** Changes some event types' channels; returns them all as they now are. */
export async function saveNotificationPreferences(
  update: NotificationPreferencesUpdate,
): Promise<NotificationSetting[]> {
  return (
    await apiSend(
      'PUT',
      '/notifications/preferences',
      update,
      notificationSettingsSchema,
    )
  ).data;
}
