import {
  SUMMARY_FIELD,
  type AttentionItem,
  type Commitment,
  type Meeting,
  type RecordSource,
  type UnattachedMeeting,
} from '@dossierhq/contracts';
import { z } from 'zod';
import type {
  ClientLookup,
  ToolConnector,
  ToolRead,
  ToolSession,
} from '../connector.js';
import { ToolError } from '../http.js';
import { DAY_MS, domainOf, oneLine } from '../ids.js';

/** How far back meetings are read. Fathom pages are fixed at 10 meetings. */
const WINDOW_DAYS = 90;
const MAX_PAGES = 100;

const person = z.object({
  name: z.string().nullish(),
  email: z.string().nullish(),
  email_domain: z.string().nullish(),
  is_external: z.boolean().nullish(),
});
const meeting = z.object({
  title: z.string().nullish(),
  meeting_title: z.string().nullish(),
  recording_id: z.number(),
  url: z.string(),
  share_url: z.string().nullish(),
  created_at: z.string(),
  scheduled_start_time: z.string().nullish(),
  recording_start_time: z.string().nullish(),
  recording_end_time: z.string().nullish(),
  calendar_invitees: z.array(person).nullish(),
  recorded_by: z.object({ name: z.string().nullish() }).nullish(),
  default_summary: z
    .object({
      template_name: z.string().nullish(),
      markdown_formatted: z.string().nullish(),
    })
    .nullish(),
  action_items: z
    .array(
      z.object({
        description: z.string(),
        completed: z.boolean().nullish(),
        recording_timestamp: z.string().nullish(),
        recording_playback_url: z.string().nullish(),
        assignee: z
          .object({
            name: z.string().nullish(),
            email: z.string().nullish(),
          })
          .nullish(),
      }),
    )
    .nullish(),
});
const meetingsPage = z.object({
  items: z.array(meeting),
  next_cursor: z.string().nullish(),
});

/** `00:10:45` → 645 seconds. */
const seconds = (timestamp: string | null | undefined) => {
  const parts = (timestamp ?? '').split(':').map(Number);
  return parts.length === 3 && parts.every(Number.isFinite)
    ? parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
    : 0;
};

/**
 * Fathom recordings: client meetings (those with someone from outside) attach
 * to the client someone attached them to by hand, or else the client whose
 * domain the outside invitees use; the rest wait to be attached by hand.
 * Fathom's summary goes on the recording. Action items assigned to the MSP
 * become commitments, cited to that moment in the recording, and ones still
 * open after two weeks need attention.
 */
export function fathomConnector(
  overrides: { apiUrl?: string } = {},
): ToolConnector<'fathom'> {
  const base = (
    overrides.apiUrl ?? 'https://api.fathom.ai/external/v1'
  ).replace(/\/+$/, '');

  return {
    tool: 'fathom',
    access: 'read: client meetings, their summaries and action items',
    createsClients: false,
    home: () => 'https://fathom.video',

    async open(credentials, ctx): Promise<ToolSession> {
      const refused = new ToolError(
        'credentials',
        'Fathom turned down the API key. Check it, and that the person it belongs to still has an active Fathom account.',
      );
      const get = (query: URLSearchParams) =>
        ctx.http.json(`${base}/meetings?${query}`, meetingsPage, {
          headers: { 'x-api-key': credentials.apiKey },
          what: 'meetings',
          errors: { 401: refused },
        });

      // One small read, so a bad key fails while connecting.
      await get(
        new URLSearchParams({
          created_after: new Date(ctx.now.getTime() - DAY_MS).toISOString(),
        }),
      );

      return {
        account: `API key ending ${credentials.apiKey.slice(-4)}`,

        async organizations() {
          return [];
        },

        async read(clients: ClientLookup): Promise<ToolRead> {
          const meetings: z.infer<typeof meeting>[] = [];
          let cursor: string | undefined;
          for (let page = 0; page < MAX_PAGES; page++) {
            const query = new URLSearchParams({
              created_after: new Date(
                ctx.now.getTime() - WINDOW_DAYS * DAY_MS,
              ).toISOString(),
              include_action_items: 'true',
              include_summary: 'true',
              calendar_invitees_domains_type: 'one_or_more_external',
            });
            if (cursor) query.set('cursor', cursor);
            const batch = await get(query);
            meetings.push(...batch.items);
            if (!batch.next_cursor || batch.next_cursor === cursor) break;
            cursor = batch.next_cursor;
          }
          ctx.audit('Meetings', meetings.length);

          const sources: RecordSource[] = [];
          const mapped: Meeting[] = [];
          const commitments: Commitment[] = [];
          const attention: AttentionItem[] = [];
          const now = ctx.now.getTime();
          // Meetings no client matched, and how many came from each outside
          // domain, so the scope can say which domains a client is missing.
          const unattached: UnattachedMeeting[] = [];
          const unmatchedDomains = new Map<string, number>();

          for (const m of meetings) {
            const invitees = m.calendar_invitees ?? [];
            const outside = invitees.filter((p) => p.is_external);
            const meetingId = ctx.id('meeting', m.recording_id);
            const title = (m.meeting_title || m.title || 'Meeting').trim();
            const start =
              m.recording_start_time ?? m.scheduled_start_time ?? m.created_at;
            const occurredAt = new Date(start).toISOString();
            const end = m.recording_end_time
              ? Date.parse(m.recording_end_time)
              : Number.NaN;
            const durationMinutes = Number.isNaN(end)
              ? 1
              : Math.max(1, Math.round((end - Date.parse(start)) / 60_000));
            const names = invitees.map((p) => p.name || p.email || 'Guest');

            // Attached by hand first, then by the outside invitees' domains.
            const clientId =
              clients.attached(meetingId) ??
              clients.forDomains(
                outside.map((p) => p.email_domain ?? p.email ?? ''),
              );
            if (!clientId) {
              const domains = [
                ...new Set(
                  outside
                    .map((p) => domainOf(p.email_domain ?? p.email))
                    .filter((d) => d !== null),
                ),
              ];
              for (const domain of domains) {
                unmatchedDomains.set(
                  domain,
                  (unmatchedDomains.get(domain) ?? 0) + 1,
                );
              }
              unattached.push({
                id: meetingId,
                title,
                occurredAt,
                durationMinutes,
                attendees: names,
                domains,
                url: m.url,
              });
              continue;
            }

            const summary = m.default_summary?.markdown_formatted?.trim();
            const recording: RecordSource = {
              id: ctx.id('recording', m.recording_id),
              kind: 'record',
              clientId,
              tool: 'fathom',
              recordId: `REC-${m.recording_id}`,
              recordType: 'Recording',
              title,
              recordedAt: occurredAt,
              url: m.url,
              fields: [
                ...(m.recorded_by?.name
                  ? [{ label: 'Recorded by', value: m.recorded_by.name }]
                  : []),
                { label: 'Duration', value: `${durationMinutes} min` },
                {
                  label: 'Invitees',
                  value: oneLine(names.join(', '), 300),
                },
                ...(summary ? [{ label: SUMMARY_FIELD, value: summary }] : []),
              ],
            };
            sources.push(recording);
            mapped.push({
              id: meetingId,
              clientId,
              title,
              occurredAt,
              durationMinutes,
              attendees: invitees.map((p) => ({
                name: p.name || p.email || 'Guest',
                role: p.is_external ? 'client' : 'msp',
              })),
              // Fathom doesn't say what the client planned, worried about
              // or asked for; Claude reads that from the summary, and keeps
              // it apart from these rows (MeetingPointsExtractor).
              planning: [],
              concerns: [],
              askedFor: [],
              readAt: null,
              recordingSourceId: recording.id,
            });

            // Action items for the MSP: anyone who isn't an outside invitee.
            const outsideEmails = new Set(
              outside.map((p) => p.email?.toLowerCase()).filter(Boolean),
            );
            const outsideDomains = new Set(
              outside
                .map((p) => domainOf(p.email_domain ?? p.email))
                .filter(Boolean),
            );
            (m.action_items ?? []).forEach((action, index) => {
              const email = action.assignee?.email?.toLowerCase();
              if (
                email &&
                (outsideEmails.has(email) ||
                  outsideDomains.has(domainOf(email)))
              ) {
                return;
              }
              const madeAt = new Date(
                Date.parse(occurredAt) +
                  seconds(action.recording_timestamp) * 1000,
              ).toISOString();
              const assignee = action.assignee?.name || action.assignee?.email;
              const source: RecordSource = {
                id: ctx.id('action', m.recording_id, index),
                kind: 'record',
                clientId,
                tool: 'fathom',
                recordId:
                  `REC-${m.recording_id} ${action.recording_timestamp ?? ''}`.trim(),
                recordType: 'Action item',
                title: oneLine(action.description, 200),
                recordedAt: madeAt,
                url: action.recording_playback_url ?? m.url,
                fields: [
                  { label: 'Meeting', value: title },
                  ...(assignee
                    ? [{ label: 'Assigned to', value: assignee }]
                    : []),
                  ...(action.recording_timestamp
                    ? [{ label: 'At', value: action.recording_timestamp }]
                    : []),
                  {
                    label: 'Status',
                    value: action.completed ? 'Done' : 'Open',
                  },
                ],
              };
              sources.push(source);
              const commitment: Commitment = {
                id: ctx.id('commitment', m.recording_id, index),
                clientId,
                statement: oneLine(action.description, 300),
                madeAt,
                dueOn: null,
                status: action.completed ? 'done' : 'open',
                completedAt: null,
                sourceIds: [source.id],
              };
              commitments.push(commitment);

              const ageDays = (now - Date.parse(madeAt)) / DAY_MS;
              if (commitment.status === 'open' && ageDays >= 14) {
                attention.push({
                  id: ctx.id('attention-commitment', m.recording_id, index),
                  clientId,
                  kind: 'commitment',
                  urgency: ageDays >= 30 ? 'high' : 'normal',
                  title: oneLine(
                    `Still open ${Math.floor(ageDays / 7)} weeks on: ${action.description}`,
                    140,
                  ),
                  raisedAt: new Date(
                    Date.parse(madeAt) + 14 * DAY_MS,
                  ).toISOString(),
                  sourceIds: [source.id],
                });
              }
            });
          }

          const matched = new Set(mapped.map((m) => m.clientId)).size;
          const missing = [...unmatchedDomains]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([domain]) => domain);
          const unmatched = unattached.length;
          const unmatchedNote = unmatched
            ? ` · ${unmatched} ${unmatched === 1 ? 'meeting' : 'meetings'} matched no client${missing.length ? `: ${missing.join(', ')}` : ''}`
            : '';
          return {
            sources,
            meetings: mapped,
            commitments,
            attention,
            devices: [],
            tickets: [],
            unattached: unattached.sort((a, b) =>
              b.occurredAt.localeCompare(a.occurredAt),
            ),
            scope: `Meeting recordings · ${mapped.length} client ${mapped.length === 1 ? 'meeting' : 'meetings'} in ${WINDOW_DAYS} days · ${matched} ${matched === 1 ? 'client' : 'clients'}${unmatchedNote}`,
          };
        },
      };
    },
  };
}
