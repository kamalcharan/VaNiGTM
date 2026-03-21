/**
 * KI-33: ShellConfigProvider
 *
 * React context that makes the product ShellConfig available
 * to all shell components (sidebar, recipe pages, etc.).
 */

'use client';

import { createContext, useContext } from 'react';
import type { ShellConfig } from '../lib/shell-config';

const ShellConfigContext = createContext<ShellConfig | null>(null);

export function ShellConfigProvider({
  config,
  children,
}: {
  config: ShellConfig;
  children: React.ReactNode;
}) {
  return (
    <ShellConfigContext.Provider value={config}>
      {children}
    </ShellConfigContext.Provider>
  );
}

export function useShellConfig(): ShellConfig {
  const ctx = useContext(ShellConfigContext);
  if (!ctx) {
    throw new Error('useShellConfig must be used within a ShellConfigProvider');
  }
  return ctx;
}
