'use client';

import { useEffect } from 'react';
import { recordClientView } from '@/app/actions';

/** Tells the API the user opened this client, for "Recent clients". */
export function RecordClientView({ clientId }: { clientId: string }) {
  useEffect(() => {
    void recordClientView(clientId);
  }, [clientId]);
  return null;
}
