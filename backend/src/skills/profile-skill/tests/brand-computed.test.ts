/**
 * Brand colours from what the browser painted. `fixtures/brand-pages/` holds
 * one page per way a site can set its colours; `collected.json` is what
 * documents/n8n/brand-collector.js returned when each page was loaded in
 * Chromium (regenerate after changing the collector). Every brand page uses
 * orange #e8420a for its buttons and blue #1d4ed8 for headings/links — so
 * the answer must be the same whatever the CSS is made of.
 */
import collected from './fixtures/brand-pages/collected.json';
import { asComputedBrand, rolesFromComputed, type ComputedBrand } from '../brand.service';

const roles = (page: string) => rolesFromComputed(collected[page as keyof typeof collected] as unknown as ComputedBrand);

describe('rolesFromComputed — one answer whatever the CSS is made of', () => {
  it.each(['plain-css.html', 'tailwind-compiled.html', 'css-in-js.html', 'css-variables.html'])('%s: buttons are primary, the blue is secondary', (page) => {
    expect(roles(page)).toMatchObject({ primary: '#e8420a', secondary: '#1d4ed8' });
  });

  it('a theme set by JavaScript on a site whose Tailwind never compiled (the vikuna.io case)', () => {
    const r = roles('inline-js-theme.html');
    expect(r.primary).toBe('#e8420a');
    expect([r.secondary, r.accent]).toEqual(expect.arrayContaining(['#1d4ed8', '#0a0f1e']));
  });

  it('a page of greys has no brand colour — never a guess', () => {
    expect(roles('neutral-only.html')).toEqual({ primary: undefined, secondary: undefined, accent: undefined });
  });

  it('the header logo and the painted font come through', () => {
    const c = collected['plain-css.html'] as unknown as ComputedBrand;
    expect(c.logo_url).toMatch(/logo\.png$/);
    expect(c.heading_font).toBe('Georgia');
  });
});

describe('asComputedBrand — the renderer is not trusted blindly', () => {
  it('ignores what is not the expected shape, and drops colours that are not hex', () => {
    expect(asComputedBrand(null)).toBeNull();
    expect(asComputedBrand({ colors: 'red' })).toBeNull();
    expect(asComputedBrand({ version: 1, colors: [{ hex: '#e8420a', cta_bg: 5 }, { hex: 'javascript:x' }] })?.colors).toEqual([{ hex: '#e8420a', cta_bg: 5 }]);
  });
});
