'use server';

import {
  connectorCredentialsSchema,
  ninjaOneSignInSchema,
  toolSchema,
  type Tool,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import * as data from '@/lib/data';
import {
  forgetProblem,
  keepPending,
  ninjaOneRedirectUri,
} from '@/lib/ninjaone-sign-in';
import type { ActionResult } from './actions';

/** Fields each tool's form sends; secrets are never echoed back. */
const FIELDS: Record<Tool, { name: string; secret?: boolean }[]> = {
  ninjaone: [
    { name: 'region' },
    { name: 'clientId' },
    { name: 'clientSecret', secret: true },
  ],
  hudu: [{ name: 'url' }, { name: 'apiKey', secret: true }],
  sharepoint: [
    { name: 'tenantId' },
    { name: 'clientId' },
    { name: 'clientSecret', secret: true },
    { name: 'siteUrl' },
    { name: 'library' },
    { name: 'folder' },
  ],
  fathom: [{ name: 'apiKey', secret: true }],
};

export type ConnectState = {
  ok?: boolean;
  error?: string;
  /** The field the error is about. */
  field?: string;
  values?: Record<string, string>;
};

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';

/**
 * Connects a tool, or replaces its credentials. The API tries them with the
 * tool before saving, so a refusal comes back here in the tool's own terms.
 */
export async function connectTool(
  _previous: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const tool = toolSchema.safeParse(formData.get('tool'));
  if (!tool.success) return { error: 'That isn’t a tool Dossier knows.' };

  const fields = FIELDS[tool.data];
  const raw = Object.fromEntries(
    fields.map(({ name }) => [name, String(formData.get(name) ?? '')]),
  );
  const values = Object.fromEntries(
    fields.filter((f) => !f.secret).map(({ name }) => [name, raw[name]!]),
  );
  if (tool.data === 'ninjaone' && formData.get('mode') === 'sign-in') {
    return signInToNinjaOne(raw, values);
  }
  const parsed = connectorCredentialsSchema.safeParse({
    tool: tool.data,
    ...raw,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue?.message,
      field: String(issue?.path[0] ?? ''),
      values,
    };
  }

  try {
    const result = await data.connectTool(parsed.data);
    if (!result.ok) return { error: result.problem, values };
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable, values };
  }
  refresh();
  return { ok: true };
}

/**
 * Sends the person to NinjaOne to sign in, which tickets need. The API seals
 * the app's details; a cookie holds them until NinjaOne sends them back.
 */
async function signInToNinjaOne(
  raw: Record<string, string>,
  values: Record<string, string>,
): Promise<ConnectState> {
  // An app NinjaOne gave no secret signs in with PKCE instead.
  const parsed = ninjaOneSignInSchema.safeParse({
    ...raw,
    clientSecret: raw.clientSecret || undefined,
    redirectUri: await ninjaOneRedirectUri(),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue?.message,
      field: String(issue?.path[0] ?? ''),
      values,
    };
  }

  let authorizeUrl: string;
  try {
    const result = await data.startNinjaOneSignIn(parsed.data);
    if (!result.ok) return { error: result.problem, values };
    await keepPending(result.start.pending);
    authorizeUrl = result.start.authorizeUrl;
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable, values };
  }
  redirect(authorizeUrl);
}

/** Forgets the last sign-in problem once the page has shown it. */
export async function forgetSignInProblem(): Promise<void> {
  await forgetProblem();
}

export async function syncTool(tool: Tool): Promise<ActionResult> {
  const parsed = toolSchema.safeParse(tool);
  if (!parsed.success)
    return { ok: false, error: 'That isn’t a tool Dossier knows.' };
  try {
    await data.syncTool(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: 'Couldn’t start a sync. Try again shortly.' };
  }
  refresh();
  return { ok: true };
}

export async function disconnectTool(tool: Tool): Promise<ActionResult> {
  const parsed = toolSchema.safeParse(tool);
  if (!parsed.success)
    return { ok: false, error: 'That isn’t a tool Dossier knows.' };
  try {
    await data.disconnectTool(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: 'Couldn’t disconnect it. Try again shortly.' };
  }
  refresh();
  return { ok: true };
}

/** Re-reads the page, e.g. while a sync is running. */
export async function refreshPage(): Promise<void> {
  refresh();
}
