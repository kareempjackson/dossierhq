'use client';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';

export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-220">
        <h1 className="text-title-compact sm:text-title">
          This page didn’t load.
        </h1>
        <p className="mt-3 max-w-xl text-text">
          Dossier Admin couldn’t read what it needed. Nothing has changed. Try
          again, and if it keeps happening, check the API is running.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-mono text-muted">
            Reference {error.digest}
          </p>
        )}
        <Button variant="primary" className="mt-6" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </Sheet>
  );
}
