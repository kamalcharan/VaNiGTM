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

/**
 * Inter is first because it is the default theme's face (Jade Thorn, the Edge
 * palette). It was not fetched before — the stack "Inter, 'Segoe UI', Arial"
 * rendered Inter only where the OS had it, Segoe UI on Windows and Arial
 * elsewhere, so the same screen wore three faces and weight 300 became
 * Segoe UI Light. Charan, 2026-09-29: no fallbacks, uniformity. Fraunces,
 * DM Sans and JetBrains Mono remain for the other three themes and code.
 */
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;0,9..144,800;1,9..144,400&family=DM+Sans:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap';

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
