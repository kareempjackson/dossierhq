import 'server-only';
import {
  clientSchema,
  contractDocumentSchema,
  listOf,
  type Client,
  type ContractDocument,
  type ContractDocumentType,
  type ContractUpdate,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { apiFile, apiGet, apiSend, apiUpload } from '../api';
import { refused } from './refused';

/**
 * A client's contract through the API: its terms, typed in because no tool
 * records them, and the files kept with it. Everyone reads them; owners and
 * admins change them.
 */

type Refused = { ok: false; problem: string };

const contractPath = (clientId: string) =>
  `/clients/${encodeURIComponent(clientId)}/contract`;
const documentPath = (clientId: string, documentId: string) =>
  `${contractPath(clientId)}/documents/${encodeURIComponent(documentId)}`;

/** The files kept with the contract, newest first, without their content. */
export const getContractDocuments = cache(
  async (clientId: string): Promise<ContractDocument[]> =>
    (
      await apiGet(
        `${contractPath(clientId)}/documents`,
        listOf(contractDocumentSchema),
      )
    ).data,
);

/** Sets the whole contract; syncs leave it alone. */
export async function saveContract(
  clientId: string,
  contract: ContractUpdate,
): Promise<{ ok: true; client: Client } | Refused> {
  try {
    return {
      ok: true,
      client: await apiSend(
        'PUT',
        contractPath(clientId),
        contract,
        clientSchema,
      ),
    };
  } catch (error) {
    return refused(error);
  }
}

/** Takes the terms away; the files stay. */
export async function removeContract(
  clientId: string,
): Promise<{ ok: true } | Refused> {
  try {
    await apiSend('DELETE', contractPath(clientId), undefined, clientSchema);
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** Keeps a file with the contract: a PDF, Word document, PNG or JPEG. */
export async function addContractDocument(
  clientId: string,
  file: { name: string; type: ContractDocumentType; bytes: Uint8Array<ArrayBuffer> },
): Promise<{ ok: true; document: ContractDocument } | Refused> {
  try {
    return {
      ok: true,
      document: await apiUpload(
        'POST',
        `${contractPath(clientId)}/documents?${new URLSearchParams({ name: file.name })}`,
        { bytes: file.bytes, type: file.type },
        contractDocumentSchema,
        // Up to 10 MB goes over the wire, and is checked on the way in.
        { timeoutMs: 60_000 },
      ),
    };
  } catch (error) {
    return refused(error);
  }
}

/** Removes a file from the contract. */
export async function removeContractDocument(
  clientId: string,
  documentId: string,
): Promise<{ ok: true } | Refused> {
  try {
    await apiSend('DELETE', documentPath(clientId, documentId));
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** The file itself, as the API sends it, for the browser to open or save. */
export const openContractDocument = (clientId: string, documentId: string) =>
  apiFile(documentPath(clientId, documentId));
