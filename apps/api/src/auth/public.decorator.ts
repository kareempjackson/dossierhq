import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = Symbol('isPublic');

/** Lets a route through without a session, e.g. sign-in and health. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
