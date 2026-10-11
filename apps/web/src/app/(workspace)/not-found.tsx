import { ButtonLink } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';

export default function WorkspaceNotFound() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-220">
        <h1 className="text-title-compact sm:text-title">
          There’s nothing at this address.
        </h1>
        <p className="mt-3 max-w-xl text-text">
          The client or report may have been removed, or the link is wrong.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <ButtonLink href="/" variant="primary">
            Go to Home
          </ButtonLink>
          <ButtonLink href="/clients">All clients</ButtonLink>
        </div>
      </div>
    </Sheet>
  );
}
