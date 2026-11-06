'use server';

import {
  connectorCredentialsSchema,
  ninjaOneSignInSchema,
  sharePointBrowseSchema,
  toolSchema,
  type SharePointPlaces,
  type Tool,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import type { z } from 'zod';
import * as data from '@/lib/data/connectors';
import {
  forgetProblem,
  keepPending,
  ninjaOneRedirectUri,
} from '@/lib/ninjaone-sign-in';

/**
 * Connecting, testing, syncing and disconnecting tools. Each checks what
 * it's given with the API's own schemas, asks the API, and words its no.
 * Typed secrets are never sent back to the form.
 */

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';
const notATool = 'That isn’t a tool Dossier knows.';

/** The fields each tool's form sends; `true` marks a secret. */
const FIELDS: Record<Tool, Record<string, boolean>> = {
  ninjaone: { region: false, clientId: false, clientSecret: true },
  hudu: { url: false, apiKey: true },
  sharepoint: {
    tenantId: false,
    clientId: false,
    clientSecret: true,
    siteUrl: false,
    library: false,
    folder: false,
  },
  fathom: { apiKey: true },
};

export type ConnectState = {
  ok?: boolean;
  error?: string;
  /** The field the error is about, to mark it. */
  field?: string;
  /** What was typed, secrets left out, to fill the form again. */
  values?: Record<string, string>;
};

export type TestState =
  { ok: true; account: string } | { ok: false; error: string; field?: string };

export type BrowseState =
  Extract<SharePointPlaces, { ok: true }> | { ok: false; error: string };

export type ActionResult = { ok: true } | { ok: false; error: string };

function readForm(tool: Tool, formData: FormData) {
  const raw: Record<string, string> = {};
  const values: Record<string, string> = {};
  for (const [name, secret] of Object.entries(FIELDS[tool])) {
    raw[name] = String(formData.get(name) ?? '').trim();
    if (!secret) values[name] = raw[name];
  }
  return { raw, values };
}

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  return {
    error: issue?.message ?? 'Check the details and try again.',
    field: issue?.path[0] === undefined ? undefined : String(issue.path[0]),
  };
}

/** Credentials as the API takes them; a blank NinjaOne secret is none. */
function credentialsFrom(tool: Tool, raw: Record<string, string>) {
  return connectorCredentialsSchema.safeParse({
    tool,
    ...raw,
    ...(tool === 'ninjaone'
      ? { clientSecret: raw.clientSecret || undefined }
      : {}),
  });
}

/**
 * Connects a tool, or saves new credentials, and starts a sync. NinjaOne's
 * "Sign in" leaves for NinjaOne instead; "Connect without tickets" connects
 * with the client secret.
 */
export async function connectTool(
  _previous: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const tool = toolSchema.safeParse(formData.get('tool'));
  if (!tool.success) return { error: notATool };
  const { raw, values } = readForm(tool.data, formData);
  if (tool.data === 'ninjaone' && formData.get('mode') === 'sign-in') {
    return signInToNinjaOne(raw, values);
  }

  const parsed = credentialsFrom(tool.data, raw);
  if (!parsed.success) return { ...firstIssue(parsed.error), values };
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
 * Leaves for NinjaOne to sign in. The API's sealed sign-in waits in a
 * cookie for the callback. No client secret means the app is public, and
 * the API adds PKCE.
 */
async function signInToNinjaOne(
  raw: Record<string, string>,
  values: Record<string, string>,
): Promise<ConnectState> {
  const parsed = ninjaOneSignInSchema.safeParse({
    region: raw.region,
    clientId: raw.clientId,
    clientSecret: raw.clientSecret || undefined,
    redirectUri: await ninjaOneRedirectUri(),
  });
  if (!parsed.success) return { ...firstIssue(parsed.error), values };
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

/**
 * Checks typed credentials with the tool without keeping them. Called
 * directly rather than as the form's action, so the typed secrets stay.
 */
export async function testCredentials(formData: FormData): Promise<TestState> {
  const tool = toolSchema.safeParse(formData.get('tool'));
  if (!tool.success) return { ok: false, error: notATool };
  const parsed = credentialsFrom(tool.data, readForm(tool.data, formData).raw);
  if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };
  return tested(() => data.testCredentials(parsed.data));
}

/** Checks a saved connection still works. */
export async function testConnection(tool: Tool): Promise<TestState> {
  const parsed = toolSchema.safeParse(tool);
  if (!parsed.success) return { ok: false, error: notATool };
  return tested(() => data.testConnection(parsed.data));
}

async function tested(
  run: () => ReturnType<typeof data.testConnection>,
): Promise<TestState> {
  try {
    const result = await run();
    return result.ok
      ? { ok: true, account: result.account }
      : { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false,
      error:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'That took too long, maybe behind a sync that’s running. Try again in a minute.'
          : unavailable,
    };
  }
}

/**
 * SharePoint's sites; or, for a site, its libraries and the folders at
 * one level, for choosing where the client folders are.
 */
export async function browseSharePoint(
  formData: FormData,
): Promise<BrowseState> {
  const text = (name: string) => String(formData.get(name) ?? '').trim();
  const parsed = sharePointBrowseSchema.safeParse({
    tenantId: text('tenantId'),
    clientId: text('clientId'),
    clientSecret: text('clientSecret'),
    siteUrl: text('siteUrl') || undefined,
    library: text('library'),
    folder: text('folder'),
  });
  if (!parsed.success)
    return { ok: false, error: firstIssue(parsed.error).error };
  try {
    const result = await data.browseSharePoint(parsed.data);
    return result.ok ? result : { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
}

/** Starts a sync now; the page refreshes while it runs. */
export async function syncTool(tool: Tool): Promise<ActionResult> {
  const parsed = toolSchema.safeParse(tool);
  if (!parsed.success) return { ok: false, error: notATool };
  try {
    await data.syncTool(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: 'Couldn’t start a sync. Try again shortly.' };
  }
  refresh();
  return { ok: true };
}

/** Disconnects a tool, forgetting what it read. */
export async function disconnectTool(tool: Tool): Promise<ActionResult> {
  const parsed = toolSchema.safeParse(tool);
  if (!parsed.success) return { ok: false, error: notATool };
  try {
    await data.disconnectTool(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: 'Couldn’t disconnect it. Try again shortly.' };
  }
  refresh();
  return { ok: true };
}

/** The sign-in problem has been shown; don't show it again. */
export async function forgetSignInProblem(): Promise<void> {
  await forgetProblem();
}
