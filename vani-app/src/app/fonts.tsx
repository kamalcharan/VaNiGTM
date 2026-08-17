'use client';

/**
 * Loads the brand fonts WITHOUT parser-blocking the document.
 *
 * These were a plain <link rel="stylesheet"> to fonts.googleapis.com in the
 * root layout — which makes a third-party CDN a hard dependency of first
 * paint. Anywhere that CDN is slow or unreachable (corporate networks,
 * filtered regions, flaky mobile), the parser stalls on the stylesheet and
 * every script after it — Next's own bootstrap included — waits. Found the
 * hard way: the Vara embed widget sat at "Connecting…" forever inside a
 * tenant's page because the document never finished loading, so the app
 * never hydrated and the boot call never fired.
 *
 * Injecting the stylesheet after mount inverts the dependency: the page
 * renders and hydrates on system fonts immediately, and the brand faces swap
 * in when (and if) the CDN answers. display=swap in the URL already promised
 * exactly that behaviour — this makes the loading path match the promise.
 */

import { useEffect } from 'react';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;0,9..144,800;1,9..144,400&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&family=JetBrains+Mono:wght@400;500&display=swap';

export function BrandFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONTS_HREF}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONTS_HREF;
    document.head.appendChild(link);
  }, []);
  return null;
}
