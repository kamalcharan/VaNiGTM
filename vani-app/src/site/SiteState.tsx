'use client';
/**
 * What the visitor's read has produced so far, shared by the page's sections:
 * the try-it box writes it, Request access reads the site and company from it,
 * and the sample graph steps back once the visitor has a graph of their own.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';

export interface ReadSoFar { token: string | null; site: string | null; company: string | null; hasGraph: boolean }
const EMPTY: ReadSoFar = { token: null, site: null, company: null, hasGraph: false };

const Ctx = createContext<{ read: ReadSoFar; setRead: (r: ReadSoFar) => void }>({ read: EMPTY, setRead: () => {} });

export function SiteState({ children }: { children: ReactNode }) {
  const [read, setRead] = useState<ReadSoFar>(EMPTY);
  return <Ctx.Provider value={{ read, setRead }}>{children}</Ctx.Provider>;
}

export const useSiteRead = () => useContext(Ctx);
export const NO_READ = EMPTY;
