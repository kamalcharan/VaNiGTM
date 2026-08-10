'use client';

/**
 * G1 step 4 · Enrich — the contact import view, rendered inside the pathway.
 *
 * The brief names this "existing Contacts import view". The closest existing
 * surface is the import flow at /import, which is what lands and enriches
 * contacts, so this step renders that page's component rather than a new one.
 * The page itself is untouched and still reachable at /import from Settings.
 *
 * If the intent was a different surface — an import tab inside Contacts that
 * does not exist yet — this is the line to change, and nothing else moves.
 */
export { default } from '../../../import/page';
