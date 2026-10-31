import { SetMetadata } from '@nestjs/common';

export const DURING_ONBOARDING = Symbol('duringOnboarding');

/**
 * Lets a route through before someone has finished setting up their account:
 * what onboarding itself uses. Every other route answers 403 until then.
 * AuthGuard checks it.
 */
export const DuringOnboarding = () => SetMetadata(DURING_ONBOARDING, true);
