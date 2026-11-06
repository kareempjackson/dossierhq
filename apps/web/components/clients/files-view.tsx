'use client';

import { useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import type { ClientFiles } from '@/lib/client-views';
import { cn } from '@/lib/cn';

/**
 * The client's SharePoint folder: its subfolders on the left, opening on the
 * one that changed last, and the chosen folder's files on the right.
 */
export function FilesView({
  clientName,
  files,
}: {
  clientName: string;
  files: ClientFiles;
}) {
  const { folders } = files;
  const [folderId, setFolderId] = useState(folders[0]?.id);
  const folder =
    folders.find((candidate) => candidate.id === folderId) ?? folders[0];

  if (!folder) {
    return (
      <div className="rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted">
        {files.connected ? (
          <p>
            No SharePoint folder matched {clientName} by name, or it has no
            files yet.
          </p>
        ) : (
          <>
            <p>
              SharePoint isn’t connected. Connect it and each client’s folder is
              joined to their file by name.
            </p>
            <ButtonLink
              href="/connections/sharepoint"
              variant="act"
              size="sm"
              className="mt-4"
            >
              Connect SharePoint
            </ButtonLink>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid flex-1 gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
      <nav
        aria-label="Folders"
        className="rounded-2xl bg-grey-1 p-3 md:min-h-[30rem]"
      >
        <p className="px-2.5 pt-1 pb-2 text-small font-medium">
          {files.folder ?? clientName}
        </p>
        <ul className="flex flex-col gap-0.5">
          {folders.map((each) => (
            <li key={each.id}>
              <button
                type="button"
                aria-current={each.id === folder.id ? 'true' : undefined}
                onClick={() => setFolderId(each.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-small transition-colors',
                  each.id === folder.id
                    ? 'bg-grey-3 text-ink'
                    : 'text-muted hover:text-ink',
                )}
              >
                <span className="min-w-0 truncate">{each.name}</span>
                <span className="font-mono text-label tracking-normal text-muted">
                  {each.files.length}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-h3">{folder.name}</h2>
          <p className="text-[0.75rem] text-muted">
            Names only. Dossier never opens file contents.
          </p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-separate border-spacing-y-1 text-left text-small">
            <thead>
              <tr className="text-[0.6875rem] text-muted">
                {['Name', 'Changed by', 'Changed'].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-3 pb-2 font-normal"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {folder.files.map((file) => (
                <tr key={file.id} className="odd:[&>td]:bg-grey-1">
                  <td className="rounded-l-xl px-3 py-3 font-medium">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-sm hover:underline"
                    >
                      {file.name}
                    </a>
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {file.changedBy ?? '—'}
                  </td>
                  <td className="rounded-r-xl px-3 py-3 text-muted">
                    <time dateTime={file.changedAt}>{file.changed}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-auto pt-8">
          <div className="rounded-2xl bg-linear-to-br from-lilac-soft to-lilac-mist p-4">
            <p className="text-[0.75rem] text-muted">SharePoint folder</p>
            <p className="mt-1 font-medium">
              {files.folder ?? clientName} · joined by name
            </p>
            <p className="mt-1 text-[0.75rem] text-muted">
              {[
                files.read ? `Read ${files.read}` : 'First read running',
                `${files.total} ${files.total === 1 ? 'file' : 'files'}`,
              ].join(' · ')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
