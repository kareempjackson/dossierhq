import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { IllustratedPanel } from '@/components/auth/statement-panel';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { TextLink } from '@/components/ui/text-link';
import { previewInvite, type InvitePreview } from '@/lib/invites';
import people from '@/public/illustrations/19-people-folders 1.png';
import { AcceptInviteForm } from './accept-invite-form';

export const metadata: Metadata = {
  title: 'Join your team',
  // The token is in this page's URL; never pass it on to anyone else.
  referrer: 'no-referrer',
};

const ROLES: Record<InvitePreview['role'], string> = {
  admin: 'an Admin',
  technician: 'a Technician',
};

const CANT_BE_USED =
  'It has expired, was withdrawn, or was already used. Ask whoever invited you to send a new one; each invite works for 7 days.';

export default function InvitePage({ searchParams }: PageProps<'/invite'>) {
  return (
    <AuthShell
      panel={
        <IllustratedPanel
          tone="lilac"
          title={
            <>
              A shared file
              <br />
              for the whole team.
            </>
          }
          body="Owners and admins manage connections. Technicians review what Dossier drafts."
          illustration={people}
          illustrationClassName="top-[64%] left-1/2 w-[min(100%,90vh)] -translate-x-1/2 -translate-y-1/2"
        />
      }
    >
      <Reveal
        fallback={
          <IndexLoader className="h-80" label="Loading your invitation" />
        }
      >
        <Invite searchParams={searchParams} />
      </Reveal>
    </AuthShell>
  );
}

async function Invite({
  searchParams,
}: Pick<PageProps<'/invite'>, 'searchParams'>) {
  const { token: raw } = await searchParams;
  const token = typeof raw === 'string' ? raw : '';
  const invite = token ? await previewInvite(token) : null;

  if (!invite) {
    return (
      <>
        <h1 className="text-h1">This invite can’t be used.</h1>
        <p className="mt-2 text-muted">
          {token
            ? CANT_BE_USED
            : 'This invite link is incomplete. Open it from the email again.'}
        </p>
        <p className="mt-6 text-small text-muted">
          Already have an account? <TextLink href="/sign-in">Sign in</TextLink>
        </p>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-small font-medium text-paper"
        >
          {initials(invite.invitedBy)}
        </span>
        <p className="text-small">
          <strong className="font-semibold">{invite.invitedBy}</strong> invited
          you to{' '}
          <strong className="font-semibold text-ink">
            {invite.workspaceName}
          </strong>{' '}
          as {ROLES[invite.role]}
        </p>
      </div>
      <h1 className="mt-6 text-h1">Join your team.</h1>
      <p className="mt-2 text-muted">
        Choose a password to start reviewing reports and recommendations.
      </p>
      <AcceptInviteForm
        token={token}
        email={invite.email}
        workspaceName={invite.workspaceName}
      />
      <div className="mt-6 rounded-2xl bg-grey-1 p-5">
        <p className="text-small font-medium">If this invite can’t be used</p>
        <p className="mt-1 text-small text-muted">{CANT_BE_USED}</p>
      </div>
    </>
  );
}

/** "Ama Mensah" → "AM". */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}
