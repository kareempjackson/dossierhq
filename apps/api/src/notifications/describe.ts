import {
  TOOL_NAMES,
  type DomainEvent,
  type WorkspaceRole,
} from '@dossierhq/contracts';
import { weekOf } from '../reports/week-label.js';

/** A notification's words, and the page it opens. */
export type Described = { title: string; body: string; link: string | null };

/** What describing an event needs to know beyond the event. */
export type DescribeContext = {
  /** The client's name, for events about one. */
  clientName: string | null;
  /** Who did it, by name; null when Dossier did, or they've gone. */
  actorName: string | null;
  /** Who it's for: some events read differently to the person they're about. */
  recipientId: string;
  timeZone: string;
};

const A_ROLE: Record<WorkspaceRole, string> = {
  owner: 'an owner',
  admin: 'an admin',
  technician: 'a technician',
};

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

const IF_NOT_YOU =
  'If this wasn’t you, reset your password and tell an owner of the workspace.';

/** "28 Oct, 09:15", in the workspace's time zone. */
function when(iso: string, timeZone: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
}

/** What to tell someone about an event, in Dossier's words. */
export function describe(
  event: DomainEvent,
  context: DescribeContext,
): Described {
  const client = context.clientName ?? 'A client';
  const by = context.actorName ? ` by ${context.actorName}` : '';
  switch (event.type) {
    case 'connection.failing':
      return {
        title: `${TOOL_NAMES[event.tool]} has stopped syncing`,
        body: event.needsSettings
          ? `${event.problem} Update its settings on Connections to start it again.`
          : `${event.problem} Dossier keeps trying on schedule, and you can sync it by hand.`,
        link: '/connections',
      };
    case 'connection.recovered':
      return {
        title: `${TOOL_NAMES[event.tool]} is syncing again`,
        body: `It had stopped since ${when(event.failingSince, context.timeZone)}.`,
        link: '/connections',
      };
    case 'reports.drafted':
      return {
        title: `${plural(event.count, 'weekly report')} drafted for ${weekOf(event.weekStart)}`,
        body:
          event.flagged === 0
            ? 'Ready to review and approve.'
            : event.flagged === 1
              ? '1 needs a closer look before it can be approved.'
              : `${event.flagged} need a closer look before they can be approved.`,
        link: '/reports',
      };
    case 'report.sent':
      return {
        title: `${client}’s weekly report was sent`,
        body: `To ${event.to.join(', ')}${event.scheduled ? ', on schedule' : by}.`,
        link: `/reports/${event.reportId}`,
      };
    case 'report.delivery-failed':
      return {
        title: `${client}’s weekly report couldn’t be sent`,
        body: `${event.problem} It isn’t tried again by itself: send it from the report once that’s fixed.`,
        link: `/reports/${event.reportId}`,
      };
    case 'report.no-recipients':
      return {
        title: `${client}’s weekly report has no one to go to`,
        body: 'It’s approved and its time to send has come. Add who it goes to, and it goes at the next look.',
        link: `/clients/${event.clientId}/reports`,
      };
    case 'member.joined':
      return {
        title: `${event.name} joined the workspace`,
        body: `As ${A_ROLE[event.role]}.`,
        link: '/settings#people',
      };
    case 'member.role-changed':
      return event.userId === context.recipientId
        ? {
            title: `You’re now ${A_ROLE[event.to]}`,
            body: `You were ${A_ROLE[event.from]}. Changed${by}.`,
            link: '/settings#people',
          }
        : {
            title: `${event.name} is now ${A_ROLE[event.to]}`,
            body: `They were ${A_ROLE[event.from]}. Changed${by}.`,
            link: '/settings#people',
          };
    case 'member.removed':
      return {
        title: `${event.name} was removed from the workspace`,
        body: context.actorName ? `By ${context.actorName}.` : '',
        link: '/settings#people',
      };
    case 'security.two-factor-off':
      return {
        title: 'Two-factor sign-in was turned off',
        body: `For your account. Signing in now needs only your password. ${IF_NOT_YOU}`,
        link: '/settings#account',
      };
    case 'security.password-reset':
      return {
        title: 'Your password was reset',
        body: `Every other session was signed out. ${IF_NOT_YOU}`,
        link: '/settings#account',
      };
    case 'security.recovery-code-used':
      return {
        title: 'A recovery code was used to sign in',
        body: `${plural(event.remaining, 'code')} left. ${IF_NOT_YOU}`,
        link: '/settings#account',
      };
    case 'security.locked-out':
      return {
        title: 'Signing in to your account is paused',
        body: 'Someone entered the wrong password too many times. It works again in a few minutes. If this wasn’t you, consider resetting your password.',
        link: null,
      };
    case 'intelligence.drafted':
      return {
        title: `${plural(event.recommendations, 'new recommendation')} drafted`,
        body: `For ${plural(event.clients, 'client')}. Review them before acting on them.`,
        link: '/',
      };
    case 'intelligence.failed':
      return {
        title: `Drafting failed for ${plural(event.failed, 'client')}`,
        body: event.problem,
        link: '/intelligence',
      };
  }
}
