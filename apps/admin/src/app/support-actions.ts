'use server';

import { supportOpenSchema } from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { attempt, UNAVAILABLE, type ActionResult } from '@/lib/attempt';
import * as data from '@/lib/data';

export type OpenResult =
  { ok: true; url: string; expiresAt: string } | { ok: false; error: string };

/** Opens a support view, and hands back its one-time link to open. */
export async function openSupportView(
  workspaceId: string,
  reason: string,
  minutes: number,
): Promise<OpenResult> {
  const parsed = supportOpenSchema.safeParse({ reason, minutes });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? UNAVAILABLE };
  }
  try {
    const result = await data.openSupportView(
      workspaceId,
      parsed.data.reason,
      parsed.data.minutes,
    );
    if (!result.ok) return { ok: false, error: result.problem };
    refresh();
    return {
      ok: true,
      url: result.opened.url,
      expiresAt: result.opened.grant.expiresAt,
    };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function endSupportView(id: string): Promise<ActionResult> {
  return attempt(() => data.endSupportView(id));
}
