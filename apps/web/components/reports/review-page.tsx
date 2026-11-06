import { getWorkspace, type ReportDraft } from '@/lib/workspace';
import { ReportReview } from './report-review';

/** The review for one draft, with everything it needs from the workspace. */
export function ReviewPage({ draft }: { draft: ReportDraft }) {
  const { clients, weekly } = getWorkspace();
  const client = clients.find((candidate) => candidate.id === draft.clientId);
  if (!client) return null;
  return (
    <ReportReview
      key={draft.id}
      draft={draft}
      clientName={client.name}
      // Recipients come from the API once Reports reads it.
      recipients={[]}
      period={weekly.period}
      sends={weekly.sends}
      sender={{
        name: weekly.delivery.senderName,
        replyTo: weekly.delivery.replyTo,
        colour: weekly.delivery.colour,
      }}
    />
  );
}

/** When every report this week has been decided, or none were drafted. */
export function NothingToReview() {
  return (
    <div className="grid flex-1 place-items-center rounded-2xl bg-grey-1 p-10 text-center">
      <div>
        <p className="font-display text-h2">Nothing to review.</p>
        <p className="mt-2 text-small text-muted">
          Each client’s weekly report is drafted here for you to check before it
          goes out. Drafts arrive on the delivery schedule.
        </p>
      </div>
    </div>
  );
}
