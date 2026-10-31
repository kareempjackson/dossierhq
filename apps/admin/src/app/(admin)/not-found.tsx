import { ButtonLink } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';

export default function AdminNotFound() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-220">
        <h1 className="text-title-compact sm:text-title">
          There’s nothing at this address.
        </h1>
        <p className="mt-3 max-w-xl text-text">
          The workspace or person may have been deleted, or the link is wrong.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <ButtonLink href="/" variant="primary">
            All workspaces
          </ButtonLink>
          <ButtonLink href="/people">Find a person</ButtonLink>
        </div>
      </div>
    </Sheet>
  );
}
