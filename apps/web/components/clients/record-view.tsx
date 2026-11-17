'use client';

import { useEffect } from 'react';
import { recordView } from '@/app/(workspace)/clients/actions';

/**
 * Tells the API the client's file was opened, once each time it opens, for
 * "Your clients" on Today. Moving between the file's tabs doesn't count
 * again. Renders nothing.
 */
export function RecordView({ clientId }: { clientId: string }) {
  useEffect(() => {
    void recordView(clientId);
  }, [clientId]);
  return null;
}
