import { SetMetadata } from '@nestjs/common';

export const SUPPORT_ALLOWED = Symbol('supportAllowed');
export const NO_SUPPORT = Symbol('noSupport');

/**
 * Lets a support view make this request though it isn't a read, e.g.
 * signing out. Support views are read-only: AuthGuard refuses every other
 * request that isn't GET or HEAD.
 */
export const SupportAllowed = () => SetMetadata(SUPPORT_ALLOWED, true);

/**
 * Refuses support views even a read, for what is the owner's own rather
 * than the workspace's: their sessions, two-factor and notifications.
 */
export const NoSupport = () => SetMetadata(NO_SUPPORT, true);
