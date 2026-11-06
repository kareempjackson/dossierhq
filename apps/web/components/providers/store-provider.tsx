'use client';

import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store';

/**
 * Makes this tab's Redux store once and keeps it across navigations. It
 * reads nothing from the request, so pages around it still prerender.
 *
 * `serverState` is the store as it starts, which is also how the server
 * rendered the page. Parts of a page hydrate at different times, and the
 * session can reach the store between them; reading this snapshot while
 * hydrating keeps every part matching the server's HTML, and React then
 * re-renders with what the store holds now.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);
  const [serverState] = useState(() => store.getState());
  return (
    <Provider store={store} serverState={serverState}>
      {children}
    </Provider>
  );
}
