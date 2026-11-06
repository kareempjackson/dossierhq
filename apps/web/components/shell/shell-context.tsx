'use client';

import { createContext, useContext, type ReactNode } from 'react';

type Shell = { unreadNotifications: number };

const Context = createContext<Shell>({ unreadNotifications: 0 });

/** What every workspace page's chrome needs to know, from the layout. */
export function ShellProvider({
  value,
  children,
}: {
  value: Shell;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useShell = () => useContext(Context);
