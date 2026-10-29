'use server';

import {
  CONTRACT_DOCUMENT_MAX_BYTES,
  CONTRACT_DOCUMENT_TYPES,
  contractUpdateSchema,
  type ContractDocumentType,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import * as data from '@/lib/data';
import type { ActionResult } from './actions';

/** A client's contract terms and the files kept with them. */

const unavailable =
  'Couldn’t save that. Check the API is running and try again.';
const id = z.string().min(1).max(200);

async function attempt(
  change: () => Promise<{ ok: true } | { ok: false; problem: string }>,
): Promise<ActionResult> {
  try {
    const result = await change();
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}

const FIELDS = [
  'plan',
  'monthlyFee',
  'currency',
  'startedOn',
  'renewsOn',
  'includes',
];

export type ContractState = {
  ok?: boolean;
  error?: string;
  /** The field the error is about. */
  field?: string;
  /** What was entered, to show again after a problem. */
  values?: Record<string, string>;
};

/** Saves the contract form for `clientId`. */
export async function saveContract(
  clientId: string,
  _previous: ContractState,
  formData: FormData,
): Promise<ContractState> {
  const values = Object.fromEntries(
    FIELDS.map((name) => [name, String(formData.get(name) ?? '')]),
  );
  const fee = values.monthlyFee!.replace(/[,\s]/g, '');
  const parsed = contractUpdateSchema.safeParse({
    plan: values.plan,
    monthlyFee: fee === '' ? undefined : Number(fee),
    currency: values.currency,
    startedOn: values.startedOn,
    renewsOn: values.renewsOn,
    // One per line, as people write them.
    includes: values
      .includes!.split('\n')
      .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
      .filter(Boolean),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue?.message ?? 'Check what you entered.',
      field: String(issue?.path[0] ?? ''),
      values,
    };
  }
  if (!id.safeParse(clientId).success) {
    return { error: 'That isn’t a client.', values };
  }
  const result = await attempt(() => data.saveContract(clientId, parsed.data));
  return result.ok ? { ok: true } : { error: result.error, values };
}

export async function removeContract(clientId: string): Promise<ActionResult> {
  if (!id.safeParse(clientId).success) {
    return { ok: false, error: 'That isn’t a client.' };
  }
  return attempt(() => data.saveContract(clientId, null));
}

/** What a browser that doesn't say a file's type most likely means. */
const BY_EXTENSION: Record<string, ContractDocumentType> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/** Adds the file chosen in the form to the client's contract. */
export async function addContractDocument(
  clientId: string,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose a file to add.' };
  }
  const type = Object.hasOwn(CONTRACT_DOCUMENT_TYPES, file.type)
    ? (file.type as ContractDocumentType)
    : BY_EXTENSION[file.name.split('.').at(-1)?.toLowerCase() ?? ''];
  if (!type) {
    return { ok: false, error: 'Add a PDF, Word document, PNG or JPEG.' };
  }
  if (file.size > CONTRACT_DOCUMENT_MAX_BYTES) {
    return { ok: false, error: 'Keep each file under 10 MB.' };
  }
  if (!id.safeParse(clientId).success) {
    return { ok: false, error: 'That isn’t a client.' };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return attempt(() =>
    data.addContractDocument(clientId, { bytes, type, name: file.name }),
  );
}

export async function deleteContractDocument(
  clientId: string,
  documentId: string,
): Promise<ActionResult> {
  if (!id.safeParse(clientId).success || !id.safeParse(documentId).success) {
    return { ok: false, error: 'That file is already gone.' };
  }
  return attempt(() => data.deleteContractDocument(clientId, documentId));
}
