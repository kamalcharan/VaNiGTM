/**
 * brand-collector — runs INSIDE the rendered page (browserless /function,
 * via page.evaluate) and returns what the browser actually painted.
 *
 * Why in the browser: a site's colours can live in compiled Tailwind
 * (rgb()), CSS-in-JS injected at runtime, CSS variables, inline styles set
 * by JavaScript, or not compile at all (vikuna.io, 2026-10-01). The browser
 * has already resolved every one of those into a computed colour per
 * element, so reading computed styles works the same on every site.
 *
 * Returns raw evidence only — colours with WHERE they appeared and how much
 * screen they covered. Deciding which is "primary" is the backend's job
 * (brand.service.ts rolesFromComputed), where it is tested.
 *
 * Plain function, no imports: it is serialised into the browserless request
 * by the n8n workflow, and run by the backend's test in a real browser.
 */
function collectBrand() {
  const MAX_ELEMENTS = 2500;
  const SCREENS = 3;                                // only what a visitor sees in the first three screens
  const vw = window.innerWidth, vh = window.innerHeight;

  const toHex = (c) => {
    const m = c && c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/i);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    if (a < 0.5) return null;                       // transparent or nearly: not a colour anyone sees
    return '#' + [m[1], m[2], m[3]].map((v) => Math.min(255, +v).toString(16).padStart(2, '0')).join('');
  };

  const tally = {};
  const add = (hex, kind, weight) => {
    if (!hex || !(weight > 0)) return;
    tally[hex] = tally[hex] || {};
    tally[hex][kind] = (tally[hex][kind] || 0) + weight;
  };

  const sel = 'body, header, nav, main, section, footer, aside, div, h1, h2, h3, a, button, [role="button"], input[type="submit"], input[type="button"]';
  const els = document.querySelectorAll(sel);
  let seen = 0;
  for (const el of els) {
    if (++seen > MAX_ELEMENTS) break;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.top > vh * SCREENS || r.bottom < 0) continue;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) continue;
    const area = Math.min(r.width * r.height, vw * vh);
    const tag = el.tagName.toLowerCase();
    const cls = (el.getAttribute('class') || '').toLowerCase();
    const bg = toHex(cs.backgroundColor);
    const fg = toHex(cs.color);
    const border = parseFloat(cs.borderTopWidth) > 0 ? toHex(cs.borderTopColor) : null;
    const isCta = tag === 'button' || tag === 'input' || el.getAttribute('role') === 'button'
      || /\b(btn|button|cta)\b/.test(cls) || (tag === 'a' && !!bg && area < vw * 200);
    if (isCta) {
      add(bg, 'cta_bg', area);
      add(border, 'cta_border', area / 4);
      add(fg, 'cta_text', area / 4);
    } else if (tag === 'a') {
      add(fg, 'link', Math.max(area, 400));
    } else if (/^h[1-3]$/.test(tag)) {
      add(fg, 'heading', area);
    } else {
      // Surfaces: big blocks of background. Divs count, but only when they
      // paint something different from their parent — otherwise every
      // wrapper would re-count the same background.
      const parentBg = el.parentElement ? toHex(window.getComputedStyle(el.parentElement).backgroundColor) : null;
      if (bg && bg !== parentBg) add(bg, 'surface', area);
    }
  }

  const colors = Object.entries(tally)
    .map(([hex, kinds]) => ({ hex, ...kinds }))
    .sort((x, y) => Object.values(y).filter((v) => typeof v === 'number').reduce((s, v) => s + v, 0)
      - Object.values(x).filter((v) => typeof v === 'number').reduce((s, v) => s + v, 0))
    .slice(0, 30)
    .map((c) => { for (const k of Object.keys(c)) if (typeof c[k] === 'number') c[k] = Math.round(c[k]); return c; });

  const firstFont = (el) => (el ? window.getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim() : null);

  // Logo: an image in the header/nav that says it is the logo, else the first
  // image there. An inline <svg> logo has no URL to give, so it is left out.
  let logo = null;
  const zone = document.querySelector('header, nav, [class*="header"], [class*="navbar"]');
  if (zone) {
    const imgs = [...zone.querySelectorAll('img')];
    const named = imgs.find((i) => /logo|brand/i.test(`${i.getAttribute('src') || ''} ${i.alt || ''} ${i.className || ''}`));
    const pick = named || imgs[0];
    if (pick && pick.currentSrc) logo = pick.currentSrc;
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  return {
    version: 1,
    colors,
    heading_font: firstFont(document.querySelector('h1, h2')),
    body_font: firstFont(document.body),
    logo_url: logo,
    theme_color: meta ? meta.getAttribute('content') : null,
    viewport: { width: vw, height: vh },
  };
}
