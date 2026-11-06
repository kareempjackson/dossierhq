import type { Metadata } from 'next';
import { ClientTab, ReadFailed } from '@/components/clients/client-tab';
import { DraftCard } from '@/components/clients/draft-card';
import { ButtonLink } from '@/components/ui/button';
import { CitedStack } from '@/components/ui/cited-stack';
import { Tag } from '@/components/ui/tag';
import { TextLink } from '@/components/ui/text-link';
import { initials, userHref } from '@/lib/client-paths';
import { clientOverview, overviewSourceIds } from '@/lib/client-views';
import {
  getAttention,
  getEndUsers,
  getMeetings,
  getRecommendations,
  getSources,
} from '@/lib/data/client-records';
import { getClient } from '@/lib/data/clients';
import { orNull } from '@/lib/data/safe';

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]'>): Promise<Metadata> {
  const client = await getClient((await params).id).catch(orNull);
  return { title: client?.name ?? 'Client file' };
}

/**
 * A client's file, on its Overview tab: what needs attention, what Dossier
 * drafted, who to talk to, and the records it all rests on. The layout has
 * the name, tabs and sheet.
 */
export default function ClientPage({ params }: PageProps<'/clients/[id]'>) {
  return (
    <ClientTab
      params={params}
      render={async (client, context) => {
        const [attention, drafts, meetings, users] = await Promise.all([
          getAttention(client.id).catch(orNull),
          getRecommendations(client.id, 'draft').catch(orNull),
          getMeetings(client.id).catch(orNull),
          getEndUsers(client.id).catch(orNull),
        ]);
        const sources =
          (await getSources(
            overviewSourceIds(attention ?? [], drafts ?? []),
          ).catch(orNull)) ?? new Map();
        const file = clientOverview(
          {
            client,
            attention: attention ?? [],
            drafts: drafts ?? [],
            meetings: meetings ?? [],
            users: users ?? [],
            sources,
          },
          context,
        );
        const base = `/clients/${encodeURIComponent(client.id)}`;

        return (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="flex flex-col gap-5">
              <section aria-labelledby="needs-attention">
                <h2
                  id="needs-attention"
                  className="font-sans text-small font-normal tracking-normal text-muted"
                >
                  {attention === null
                    ? 'What needs attention'
                    : file.items.length === 0
                      ? 'Nothing needs attention'
                      : 'What needs attention'}
                </h2>
                {attention === null ? (
                  <div className="mt-3">
                    <ReadFailed what="what needs attention here" />
                  </div>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {file.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-grey-1 px-4 py-3"
                      >
                        <div className="min-w-[14rem] flex-1">
                          <p className="font-medium">
                            {item.title}
                            {item.cite !== null && (
                              <sup className="ml-1 font-mono text-[0.625rem] text-lilac-ink">
                                {item.cite}
                              </sup>
                            )}
                          </p>
                          <p className="text-small text-muted">{item.detail}</p>
                        </div>
                        <Tag tone={item.status.tone}>{item.status.label}</Tag>
                        <p className="text-small text-muted sm:w-20 sm:text-right">
                          {item.source ? (
                            <a
                              href={item.source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-sm underline decoration-ink/20 underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink"
                            >
                              {item.source.name}
                            </a>
                          ) : (
                            'Dossier'
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {drafts !== null && (
                <DraftCard draft={file.draft} moreDrafts={file.moreDrafts} />
              )}

              {file.contact && (
                <section
                  aria-label="Key contact"
                  className="flex flex-wrap items-center gap-4 rounded-2xl bg-grey-1 p-4"
                >
                  <span
                    aria-hidden
                    className="grid size-12 shrink-0 place-items-center rounded-full bg-lilac-soft font-display text-base text-lilac-ink"
                  >
                    {initials(file.contact.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.75rem] text-muted">Key contact</p>
                    {file.contact.userId ? (
                      <TextLink
                        href={userHref(client.id, file.contact.userId)}
                        className="font-semibold"
                      >
                        {file.contact.name}
                      </TextLink>
                    ) : (
                      <p className="font-semibold">{file.contact.name}</p>
                    )}
                    <p className="text-small text-muted">
                      {[
                        file.contact.role,
                        file.contact.lastSpoke
                          ? `last spoke ${file.contact.lastSpoke}`
                          : 'no recorded meeting yet',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {file.contact.meetingId && (
                    <ButtonLink
                      href={`${base}/meetings?meeting=${encodeURIComponent(file.contact.meetingId)}`}
                      variant="outline"
                      size="sm"
                    >
                      Open meeting
                    </ButtonLink>
                  )}
                </section>
              )}
            </div>

            <aside aria-labelledby="cited-files">
              <p id="cited-files" className="text-small text-muted">
                Cited files
              </p>
              {file.cited.length > 0 ? (
                // The stack puts its last file in front: here, the first cited.
                <CitedStack
                  files={[...file.cited].reverse()}
                  className="mt-1"
                />
              ) : (
                <p className="mt-2 rounded-xl bg-grey-1 px-4 py-6 text-small text-muted">
                  Nothing cited yet.
                </p>
              )}
              <p className="mt-4 text-small text-muted">
                Every line in this file points to one of these records. Nothing
                is written back to your tools.
              </p>
              <ButtonLink
                href={`/audit-log?client=${encodeURIComponent(client.id)}`}
                variant="outline"
                size="sm"
                className="mt-4"
              >
                Open audit log
              </ButtonLink>
            </aside>
          </div>
        );
      }}
    />
  );
}
