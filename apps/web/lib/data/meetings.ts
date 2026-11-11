import 'server-only';
import {
  commitmentSchema,
  listOf,
  meetingAttachmentsSchema,
  meetingSchema,
  type Commitment,
  type Meeting,
  type MeetingAttachments,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { apiGet, apiSend } from '../api';
import { refused } from './refused';

/**
 * Every client's meetings, through the API. Fathom's recordings become a
 * client's meetings when an outside invitee's email domain matches the
 * client; the rest wait to be attached to one by hand.
 */

type Refused = { ok: false; problem: string };

/** Every client's meetings, newest first. */
export const getAllMeetings = cache(
  async (): Promise<Meeting[]> =>
    (await apiGet('/meetings', listOf(meetingSchema))).data,
);

/** Every client's promises, for matching them to the meetings they came from. */
export const getAllCommitments = cache(
  async (): Promise<Commitment[]> =>
    (await apiGet('/commitments', listOf(commitmentSchema))).data,
);

/**
 * The recordings Fathom's last sync couldn't match to a client (newest
 * first, from the last 90 days), and the ones attached by hand.
 */
export const getMeetingAttachments = cache((): Promise<MeetingAttachments> =>
  apiGet('/meetings/attachments', meetingAttachmentsSchema),
);

/**
 * Attaches a recording to a client, for good. The API syncs Fathom so it
 * moves there, and answers once it has or after a few seconds.
 */
export async function attachMeeting(
  meetingId: string,
  clientId: string,
): Promise<{ ok: true } | Refused> {
  try {
    await apiSend(
      'PUT',
      `/meetings/${encodeURIComponent(meetingId)}/client`,
      { clientId },
      undefined,
      { timeoutMs: 30_000 },
    );
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}
