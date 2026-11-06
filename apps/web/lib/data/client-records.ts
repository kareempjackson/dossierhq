import 'server-only';
import {
  attentionItemSchema,
  clientThemeSchema,
  commitmentSchema,
  deviceSchema,
  endUserDetailSchema,
  endUserSchema,
  listOf,
  meetingSchema,
  recipientSchema,
  recommendationSchema,
  reportSettingsSchema,
  reportSummarySchema,
  sourceSchema,
  ticketSchema,
  type AttentionItem,
  type ClientTheme,
  type Commitment,
  type Device,
  type EndUser,
  type EndUserDetail,
  type Meeting,
  type Recipient,
  type Recommendation,
  type RecommendationStatus,
  type RecommendationUpdate,
  type ReportSettings,
  type ReportSummary,
  type Source,
  type Ticket,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { ApiError, apiGet, apiSend, withQuery } from '../api';
import { refused } from './refused';

/**
 * What Dossier holds about one client, through the API: the records the
 * tools gave it and what it worked out from them. Every read takes plain
 * arguments, so React's cache() shares one request between the client
 * file's layout and its tab.
 */

const forClient = (clientId: string) =>
  `/clients/${encodeURIComponent(clientId)}`;

/** Every device in the workspace, for counting them by client. */
export const getAllDevices = cache(
  async (): Promise<Device[]> =>
    (await apiGet('/devices', listOf(deviceSchema))).data,
);

/** Needing work first. */
export const getDevices = cache(
  async (clientId: string): Promise<Device[]> =>
    (await apiGet(withQuery('/devices', { clientId }), listOf(deviceSchema)))
      .data,
);

/**
 * The people who work at the client, by name. No tool lists them, so the
 * API finds them in device sign-ins, ticket requesters, meeting attendees
 * and the primary contact, leaving the MSP's own people out.
 */
export const getEndUsers = cache(
  async (clientId: string): Promise<EndUser[]> =>
    (await apiGet(`${forClient(clientId)}/users`, listOf(endUserSchema))).data,
);

/**
 * One of them, with their devices, tickets, meetings, what needs attention
 * and what Dossier read about them; null when nobody there has that id.
 */
export const getEndUser = cache(
  async (clientId: string, userId: string): Promise<EndUserDetail | null> => {
    try {
      return await apiGet(
        `${forClient(clientId)}/users/${encodeURIComponent(userId)}`,
        endUserDetailSchema,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
);

/**
 * Open first (most urgent, then most recently updated), then closed. Who's
 * on each and where it stands, without what's written on them.
 */
export const getTickets = cache(
  async (clientId: string): Promise<Ticket[]> =>
    (await apiGet(withQuery('/tickets', { clientId }), listOf(ticketSchema)))
      .data,
);

/**
 * One of the client's tickets by its number, with everything written on it,
 * oldest first; null when the client has no ticket by that number.
 */
export const getTicket = cache(
  async (clientId: string, number: string): Promise<Ticket | null> => {
    try {
      return await apiGet(
        `${forClient(clientId)}/tickets/${encodeURIComponent(number)}`,
        ticketSchema,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
);

/** Newest first. */
export const getMeetings = cache(
  async (clientId: string): Promise<Meeting[]> =>
    (await apiGet(withQuery('/meetings', { clientId }), listOf(meetingSchema)))
      .data,
);

/** Most urgent first, then newest. */
export const getAttention = cache(
  async (clientId: string): Promise<AttentionItem[]> =>
    (
      await apiGet(
        withQuery('/attention', { clientId }),
        listOf(attentionItemSchema),
      )
    ).data,
);

/** Newest first. */
export const getRecommendations = cache(
  async (
    clientId: string,
    status?: RecommendationStatus,
  ): Promise<Recommendation[]> =>
    (
      await apiGet(
        withQuery('/recommendations', { clientId, status }),
        listOf(recommendationSchema),
      )
    ).data,
);

/** Open first (soonest due), then done (most recent). */
export const getCommitments = cache(
  async (clientId: string): Promise<Commitment[]> =>
    (
      await apiGet(
        withQuery('/commitments', { clientId }),
        listOf(commitmentSchema),
      )
    ).data,
);

/**
 * What keeps coming back in the client's tickets. Empty while that's
 * turned off in Intelligence, or tickets aren't read.
 */
export const getThemes = cache(
  async (clientId: string): Promise<ClientTheme[]> =>
    (await apiGet(`${forClient(clientId)}/themes`, listOf(clientThemeSchema)))
      .data,
);

/** Everything Dossier has read about the client, newest first. */
export const getClientSources = cache(
  async (clientId: string): Promise<Source[]> =>
    (await apiGet(`${forClient(clientId)}/sources`, listOf(sourceSchema))).data,
);

const sourcesByIds = cache(
  async (ids: string): Promise<Source[]> =>
    (await apiGet(withQuery('/sources', { ids }), listOf(sourceSchema))).data,
);

/** The API takes at most 200 ids a request; fewer keeps the URL short. */
const IDS_PER_REQUEST = 100;

/** The sources with these ids, by id. Ids Dossier no longer holds are left out. */
export async function getSources(ids: string[]): Promise<Map<string, Source>> {
  const unique = [...new Set(ids)].sort();
  const groups: string[] = [];
  for (let i = 0; i < unique.length; i += IDS_PER_REQUEST) {
    groups.push(unique.slice(i, i + IDS_PER_REQUEST).join(','));
  }
  const found = (await Promise.all(groups.map(sourcesByIds))).flat();
  return new Map(found.map((source) => [source.id, source]));
}

/** Newest week first. */
export const getReportSummaries = cache(
  async (clientId: string): Promise<ReportSummary[]> =>
    (
      await apiGet(
        withQuery('/reports', { clientId }),
        listOf(reportSummarySchema),
      )
    ).data,
);

/** Who the client's weekly report goes to, in order. */
export const getRecipients = cache(
  async (clientId: string): Promise<Recipient[]> =>
    (await apiGet(`${forClient(clientId)}/recipients`, listOf(recipientSchema)))
      .data,
);

/** How reports look when they go out, and when they're drafted and sent. */
export const getReportSettings = cache((): Promise<ReportSettings> =>
  apiGet('/report-settings', reportSettingsSchema),
);

type Refused = { ok: false; problem: string };

/** Replaces who the report goes to. Owners and admins only. */
export async function saveRecipients(
  clientId: string,
  recipients: Recipient[],
): Promise<{ ok: true; recipients: Recipient[] } | Refused> {
  try {
    const saved = await apiSend(
      'PUT',
      `${forClient(clientId)}/recipients`,
      { recipients },
      listOf(recipientSchema),
    );
    return { ok: true, recipients: saved.data };
  } catch (error) {
    return refused(error);
  }
}

/** Accepts, dismisses, undoes or rewords a recommendation. */
export async function updateRecommendation(
  id: string,
  update: RecommendationUpdate,
): Promise<{ ok: true; recommendation: Recommendation } | Refused> {
  try {
    const recommendation = await apiSend(
      'PATCH',
      `/recommendations/${encodeURIComponent(id)}`,
      update,
      recommendationSchema,
    );
    return { ok: true, recommendation };
  } catch (error) {
    return refused(error);
  }
}
