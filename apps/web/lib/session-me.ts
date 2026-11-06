import type { Me } from '@dossierhq/contracts';

/**
 * What the browser knows about who's signed in: the parts of the API's Me
 * that screens show. Never the token, which stays in an httpOnly cookie.
 */
export type SessionMe = {
  user: { id: string; name: string; email: string; title: string };
  workspace: { id: string; name: string; timeZone: string };
  role: Me['role'];
  setup: Me['setup'];
};

/** Narrows the API's Me to what's handed to the browser. */
export function toSessionMe(me: Me): SessionMe {
  return {
    user: {
      id: me.user.id,
      name: me.user.name,
      email: me.user.email,
      title: me.user.title,
    },
    workspace: {
      id: me.workspace.id,
      name: me.workspace.name,
      timeZone: me.workspace.timeZone,
    },
    role: me.role,
    setup: me.setup,
  };
}
