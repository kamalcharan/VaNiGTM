import { DEFAULT_MODE, DEFAULT_THEME_ID, MODE_STORAGE_KEY, THEME_STORAGE_KEY, THEMES } from './registry';
import { resolveTokens, tokensToCss } from './tokens';

/**
 * The paint that happens BEFORE React.
 *
 * Two parts, and both are needed:
 *
 * 1. A `<style>` carrying every theme × mode as a precomputed rule, keyed on
 *    `html[data-theme][data-mode]`. Six small rules, no JavaScript, so the
 *    correct palette is available the instant the document has its attributes.
 *
 * 2. A tiny blocking `<script>` that reads the browser's mirror of the choice
 *    and sets those two attributes on `<html>` before the first paint.
 *
 * Without part 2 the console paints the default theme and then swaps — the
 * flash that makes a themed app feel broken. Without part 1 the script would
 * have to inline forty custom properties itself, which is the same palette
 * written twice and guaranteed to drift.
 *
 * The script is deliberately tiny and wrapped in try/catch: storage throws in
 * a private window, and a theme preference is never worth a blank page.
 */
export function ThemeScript() {
  const rules = THEMES.flatMap((theme) =>
    (['light', 'dark'] as const).map((mode) =>
      `html[data-theme="${theme.id}"][data-mode="${mode}"]{${tokensToCss(resolveTokens(theme, mode))}}`,
    ),
  );

  // The default is also emitted bare on :root, so a document that somehow has
  // no attributes still paints a complete console rather than an unstyled one.
  const fallback = `:root{${tokensToCss(
    resolveTokens(THEMES.find((t) => t.id === DEFAULT_THEME_ID) ?? THEMES[0], DEFAULT_MODE),
  )}}`;

  const boot = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
var m=localStorage.getItem(${JSON.stringify(MODE_STORAGE_KEY)});
var ids=${JSON.stringify(THEMES.map((t2) => t2.id))};
if(ids.indexOf(t)<0)t=${JSON.stringify(DEFAULT_THEME_ID)};
if(m!=='light'&&m!=='dark')m=${JSON.stringify(DEFAULT_MODE)};
var e=document.documentElement;
e.setAttribute('data-theme',t);e.setAttribute('data-mode',m);
e.style.colorScheme=m;
}catch(_){}})();`;

  return (
    <>
      <style id="vani-theme-tokens" dangerouslySetInnerHTML={{ __html: `${fallback}\n${rules.join('\n')}` }} />
      <script id="vani-theme-boot" dangerouslySetInnerHTML={{ __html: boot }} />
    </>
  );
}
