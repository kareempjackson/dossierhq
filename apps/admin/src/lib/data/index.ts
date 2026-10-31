import 'server-only';
import {
  auditPageSchema,
  listOf,
  platformPersonSchema,
  staffAuditPageSchema,
  staffChallengeSchema,
  staffInviteAcceptedSchema,
  staffInvitePreviewSchema,
  staffInviteSchema,
  staffListSchema,
  staffMeSchema,
  staffSchema,
  staffSessionSchema,
  staffTwoFactorSetupSchema,
  supportGrantSchema,
  supportOpenedSchema,
  workspaceDetailSchema,
  workspacePageSchema,
  type AuditKind,
  type AuditPage,
  type PlatformPerson,
  type SignInRequest,
  type StaffAuditPage,
  type StaffInviteAccept,
  type StaffInviteAccepted,
  type StaffInviteCreate,
  type StaffInvitePreview,
  type StaffList,
  type StaffMe,
  type StaffRole,
  type StaffSession,
  type StaffTwoFactorSetup,
  type SupportGrant,
  type SupportOpened,
  type TwoFactorSignIn,
  type WorkspaceDetail,
  type WorkspacePage,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { ApiError, apiFind, apiGet, apiSend, withQuery } from '../api';

/**
 * Everything the admin app reads from and asks of the API's /admin routes.
 * Reads are deduplicated per request with React's cache(). Changes return
 * `{ ok: false, problem }` for what the API refused, in its words, and throw
 * for anything else.
 */

export type Refusal = { ok: false; problem: string };

function refused(error: unknown): Refusal {
  if (error instanceof ApiError && error.problem && error.status < 500) {
    return { ok: false, problem: error.problem };
  }
  // The mail provider said no (502), or something isn't set up (503).
  if (
    error instanceof ApiError &&
    (error.status === 502 || error.status === 503) &&
    error.problem
  ) {
    return { ok: false, problem: error.problem };
  }
  throw error;
}

// Signing in ------------------------------------------------------------------

export type SignInResult =
  | { ok: true; challenge: string }
  | { ok: false; reason: 'invalid' | 'locked' | 'unavailable' };

/** Checks the password; the right one always asks for a code. */
export async function signIn(request: SignInRequest): Promise<SignInResult> {
  try {
    const { challenge } = await apiSend(
      'POST',
      '/admin/auth/sign-in',
      request,
      staffChallengeSchema,
      { session: 'none' },
    );
    return { ok: true, challenge };
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
    return { ok: false, reason: 'unavailable' };
  }
}

export type TwoFactorResult =
  | { ok: true; session: StaffSession }
  | { ok: false; reason: 'wrong' | 'expired' | 'limited' | 'unavailable' };

export async function completeTwoFactor(
  request: TwoFactorSignIn,
): Promise<TwoFactorResult> {
  try {
    const session = await apiSend(
      'POST',
      '/admin/auth/sign-in/two-factor',
      request,
      staffSessionSchema,
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

export function signOut(): Promise<void> {
  // Never redirects: signing out of an already-expired session still has to
  // clear the cookie.
  return apiSend('POST', '/admin/auth/sign-out', undefined, undefined, {
    session: 'best-effort',
  });
}

export const getMe = cache((): Promise<StaffMe> =>
  apiGet('/admin/auth/me', staffMeSchema),
);

// Invites ---------------------------------------------------------------------

/** What an invite is for, or null when it can't be used. */
export async function previewInvite(
  token: string,
): Promise<StaffInvitePreview | null> {
  try {
    return await apiSend(
      'POST',
      '/admin/auth/invites/preview',
      { token },
      staffInvitePreviewSchema,
      { session: 'none' },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) return null;
    throw error;
  }
}

export async function setupInvite(
  token: string,
): Promise<{ ok: true; setup: StaffTwoFactorSetup } | Refusal> {
  try {
    return {
      ok: true,
      setup: await apiSend(
        'POST',
        '/admin/auth/invites/setup',
        { token },
        staffTwoFactorSetupSchema,
        { session: 'none' },
      ),
    };
  } catch (error) {
    return refused(error);
  }
}

export async function acceptInvite(
  request: StaffInviteAccept,
): Promise<{ ok: true; accepted: StaffInviteAccepted } | Refusal> {
  try {
    return {
      ok: true,
      accepted: await apiSend(
        'POST',
        '/admin/auth/invites/accept',
        request,
        staffInviteAcceptedSchema,
        { session: 'none' },
      ),
    };
  } catch (error) {
    return refused(error);
  }
}

// Staff -----------------------------------------------------------------------

export const getStaff = cache((): Promise<StaffList> =>
  apiGet('/admin/staff', staffListSchema),
);

export async function inviteStaff(
  request: StaffInviteCreate,
): Promise<{ ok: true } | Refusal> {
  try {
    await apiSend('POST', '/admin/staff/invites', request, staffInviteSchema);
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function withdrawStaffInvite(
  id: string,
): Promise<{ ok: true } | Refusal> {
  try {
    await apiSend('DELETE', `/admin/staff/invites/${encodeURIComponent(id)}`);
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function setStaffRole(
  id: string,
  role: StaffRole,
): Promise<{ ok: true } | Refusal> {
  try {
    await apiSend(
      'PATCH',
      `/admin/staff/${encodeURIComponent(id)}`,
      { role },
      staffSchema,
    );
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function disableStaff(
  id: string,
): Promise<{ ok: true } | Refusal> {
  try {
    await apiSend('DELETE', `/admin/staff/${encodeURIComponent(id)}`);
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

// What staff did --------------------------------------------------------------

const activityPage = cache(
  (
    workspaceId?: string,
    before?: string,
    after?: string,
  ): Promise<StaffAuditPage> =>
    apiGet(
      withQuery('/admin/activity', { workspaceId, before, after, limit: 50 }),
      staffAuditPageSchema,
    ),
);

/** What staff did, newest first; with `workspaceId`, in that workspace. */
export function getActivity({
  workspaceId,
  before,
  after,
}: {
  workspaceId?: string;
  before?: string;
  after?: string;
} = {}): Promise<StaffAuditPage> {
  return activityPage(workspaceId, before, after);
}

// Workspaces ------------------------------------------------------------------

const workspacesPage = cache(
  (
    q?: string,
    status?: 'active' | 'suspended',
    page?: number,
  ): Promise<WorkspacePage> =>
    apiGet(
      withQuery('/admin/workspaces', { q, status, page }),
      workspacePageSchema,
    ),
);

export function getWorkspaces({
  q,
  status,
  page,
}: {
  q?: string;
  status?: 'active' | 'suspended';
  page?: number;
} = {}): Promise<WorkspacePage> {
  return workspacesPage(q, status, page);
}

/** One workspace in full, or null when there's no such workspace. */
export const getWorkspace = cache(
  (id: string): Promise<WorkspaceDetail | null> =>
    apiFind(
      `/admin/workspaces/${encodeURIComponent(id)}`,
      workspaceDetailSchema,
    ),
);

const workspaceAudit = cache(
  (
    id: string,
    kind?: AuditKind,
    before?: string,
    after?: string,
  ): Promise<AuditPage> =>
    apiGet(
      withQuery(`/admin/workspaces/${encodeURIComponent(id)}/audit`, {
        kind,
        before,
        after,
        limit: 50,
      }),
      auditPageSchema,
    ),
);

export function getWorkspaceAudit(
  id: string,
  {
    kind,
    before,
    after,
  }: { kind?: AuditKind; before?: string; after?: string } = {},
): Promise<AuditPage> {
  return workspaceAudit(id, kind, before, after);
}

const workspacePath = (id: string) =>
  `/admin/workspaces/${encodeURIComponent(id)}`;

export async function suspendWorkspace(
  id: string,
  reason: string,
): Promise<{ ok: true } | Refusal> {
  try {
    await apiSend('POST', `${workspacePath(id)}/suspend`, { reason });
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function restoreWorkspace(
  id: string,
): Promise<{ ok: true } | Refusal> {
  try {
    await apiSend('POST', `${workspacePath(id)}/restore`);
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function deleteWorkspace(
  id: string,
  confirmName: string,
): Promise<{ ok: true } | Refusal> {
  try {
    await apiSend('DELETE', workspacePath(id), { confirmName });
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

// People ----------------------------------------------------------------------

export const searchPeople = cache(
  async (q: string): Promise<PlatformPerson[]> =>
    (
      await apiGet(
        withQuery('/admin/people', { q }),
        listOf(platformPersonSchema),
      )
    ).data,
);

export const getPerson = cache((id: string): Promise<PlatformPerson | null> =>
  apiFind(`/admin/people/${encodeURIComponent(id)}`, platformPersonSchema),
);

/** One of the actions on a person: sign-out, password-reset or two-factor. */
export async function helpPerson(
  id: string,
  action: 'sign-out' | 'password-reset' | 'two-factor-off',
): Promise<{ ok: true } | Refusal> {
  const path = `/admin/people/${encodeURIComponent(id)}`;
  try {
    if (action === 'two-factor-off') {
      await apiSend('DELETE', `${path}/two-factor`);
    } else {
      await apiSend('POST', `${path}/${action}`);
    }
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

// Support views -------------------------------------------------------------------

/** Every view running now, or with `live: false`, the 100 newest. */
export const getSupportViews = cache(
  async (live: boolean = true): Promise<SupportGrant[]> =>
    (
      await apiGet(
        withQuery('/admin/support', { live: live ? undefined : 0 }),
        listOf(supportGrantSchema),
      )
    ).data,
);

/** One workspace's views, newest first. */
export const getWorkspaceSupportViews = cache(
  async (id: string): Promise<SupportGrant[]> =>
    (
      await apiGet(
        `/admin/workspaces/${encodeURIComponent(id)}/support`,
        listOf(supportGrantSchema),
      )
    ).data,
);

export async function openSupportView(
  workspaceId: string,
  reason: string,
  minutes: number,
): Promise<{ ok: true; opened: SupportOpened } | Refusal> {
  try {
    return {
      ok: true,
      opened: await apiSend(
        'POST',
        `/admin/workspaces/${encodeURIComponent(workspaceId)}/support`,
        { reason, minutes },
        supportOpenedSchema,
      ),
    };
  } catch (error) {
    return refused(error);
  }
}

export async function endSupportView(
  id: string,
): Promise<{ ok: true } | Refusal> {
  try {
    await apiSend(
      'DELETE',
      `/admin/support/${encodeURIComponent(id)}`,
      undefined,
      supportGrantSchema,
    );
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}
