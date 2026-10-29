'use client';

import {
  CONTRACT_DOCUMENT_TYPES,
  CONTRACT_DOCUMENTS_MAX,
  type ContractDocument,
} from '@dossierhq/contracts';
import { FileText, Paperclip } from 'lucide-react';
import { useId, useRef, useState, useTransition } from 'react';
import {
  addContractDocument,
  deleteContractDocument,
} from '@/app/contract-actions';
import { formatDate } from '@/lib/format';

const ACCEPT = [
  ...Object.keys(CONTRACT_DOCUMENT_TYPES),
  '.pdf',
  '.docx',
  '.doc',
  '.png',
  '.jpg',
  '.jpeg',
].join(',');

const link = 'rounded-row underline-offset-2 hover:text-ink hover:underline';

/** "340 KB", "2.4 MB". */
function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The files kept with a client's contract, such as the signed agreement.
 * Everyone can open them; owners and admins add and remove them.
 */
export function ContractDocuments({
  clientId,
  documents,
  canManage,
  timeZone,
}: {
  clientId: string;
  documents: ContractDocument[];
  canManage: boolean;
  timeZone: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.set('file', file);
    startTransition(async () => {
      const result = await addContractDocument(clientId, form);
      if (!result.ok) setError(result.error);
      if (inputRef.current) inputRef.current.value = '';
    });
  }

  function remove(documentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteContractDocument(clientId, documentId);
      if (!result.ok) setError(result.error);
      setConfirming(null);
    });
  }

  if (documents.length === 0 && !canManage) return null;

  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <p className="text-meta-sm font-medium text-muted">Files</p>
      {documents.length === 0 ? (
        <p className="mt-1 text-meta text-muted">
          Keep the signed contract here, so it’s at hand.
        </p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1.5">
          {documents.map((document) => {
            const opens =
              document.contentType === 'application/pdf' ||
              document.contentType.startsWith('image/');
            return (
              <li
                key={document.id}
                className="flex items-start gap-2 text-meta"
              >
                <FileText
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 text-muted"
                />
                <div className="min-w-0 flex-1">
                  <a
                    href={`/clients/${encodeURIComponent(clientId)}/contract/${encodeURIComponent(document.id)}`}
                    target={opens ? '_blank' : undefined}
                    rel={opens ? 'noreferrer' : undefined}
                    className={`${link} block truncate text-ink`}
                  >
                    {document.name}
                  </a>
                  <p className="text-meta-sm text-muted">
                    {CONTRACT_DOCUMENT_TYPES[document.contentType]} ·{' '}
                    {size(document.size)} · {document.uploadedBy.name},{' '}
                    {formatDate(document.uploadedAt, timeZone)}
                  </p>
                  {confirming === document.id && (
                    <p className="mt-1 flex flex-wrap gap-3 text-meta-sm">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => remove(document.id)}
                        className="font-medium text-alert underline-offset-2 hover:underline"
                      >
                        {pending ? 'Removing…' : 'Remove it'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className={link}
                      >
                        Keep
                      </button>
                    </p>
                  )}
                </div>
                {canManage && confirming !== document.id && (
                  <button
                    type="button"
                    aria-label={`Remove ${document.name}`}
                    onClick={() => setConfirming(document.id)}
                    className={`${link} shrink-0 text-meta-sm text-muted`}
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canManage && documents.length < CONTRACT_DOCUMENTS_MAX && (
        <>
          <label htmlFor={inputId} className="sr-only">
            Contract file
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => upload(event.target.files?.[0])}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            className={`${link} mt-2 inline-flex items-center gap-1.5 text-meta text-text`}
          >
            <Paperclip aria-hidden className="size-3.5" />
            {pending ? 'Adding…' : 'Add a file'}
          </button>
          <p className="text-meta-sm text-muted">
            PDF, Word, PNG or JPEG, up to 10 MB.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-1 text-meta text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
