import {
  hasRole,
  NOTIFICATIONS,
  type DomainEvent,
  type EventType,
  type Member,
  type WorkspaceRole,
} from '@dossierhq/contracts';

/** Who an event is about, for the ones about a person. */
const subjectOf = (event: DomainEvent): string | null =>
  'userId' in event ? event.userId : null;

/**
 * Whether a member hears about an event, before their preferences: they're
 * in its audience, and didn't do it themselves (unless it's about their own
 * account, where whoever did it should know).
 */
export function hearsAbout(
  member: Pick<Member, 'id' | 'role'>,
  event: DomainEvent,
  actorUserId: string | null,
): boolean {
  const kind = NOTIFICATIONS[event.type];
  if (!kind.notifyActor && member.id === actorUserId) return false;
  return kind.audience.some(
    (audience) =>
      audience === 'everyone' ||
      (audience === 'admins' && hasRole(member.role, 'admin')) ||
      (audience === 'subject' && subjectOf(event) === member.id),
  );
}

/** Whether someone with `role` can hear about this type at all, for Settings. */
export function canHearAbout(type: EventType, role: WorkspaceRole): boolean {
  return NOTIFICATIONS[type].audience.some(
    (audience) =>
      audience === 'everyone' ||
      audience === 'subject' ||
      (audience === 'admins' && hasRole(role, 'admin')),
  );
}
