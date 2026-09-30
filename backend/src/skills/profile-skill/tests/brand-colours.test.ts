/**
 * Colour extraction for the brand step. vikuna.io (2026-09-30) came back with
 * no colours at all: Tailwind writes every colour as rgb(), and a React
 * theme lives in inline style attributes — the hex-only scan saw neither.
 * No stylesheet <link>s in these pages, so nothing is fetched.
 */
import { extractVisualHints, rgbToHexInText } from '../brand.service';

const page = (head: string, body = '') => `<html><head>${head}</head><body>${body}</body></html>`;

describe('rgbToHexInText', () => {
  it('reads every rgb() spelling and drops alpha', () => {
    expect(rgbToHexInText('color:rgb(232 66 10/var(--tw-text-opacity))')).toBe('color:#e8420a');
    expect(rgbToHexInText('color: rgb(232, 66, 10);')).toBe('color: #e8420a;');
    expect(rgbToHexInText('background:rgba(201,151,58,0.4)')).toBe('background:#c9973a');
    expect(rgbToHexInText('rgb(18 160 144 / 0.5)')).toBe('#12a090');
  });
  it('leaves what is not a colour alone', () => {
    expect(rgbToHexInText('rgb(300, 1, 1)')).toBe('rgb(300, 1, 1)');
    expect(rgbToHexInText('rgb(var(--c))')).toBe('rgb(var(--c))');
  });
});

describe('extractVisualHints — colours', () => {
  it('a hex-only site reads exactly as before (named custom properties win)', async () => {
    const v = await extractVisualHints(page('<style>:root{--brand-primary:#E8420A;--accent-gold:#C9973A}</style>'), 'https://acme.test/');
    expect(v).toMatchObject({ primary_color: '#e8420a', accent_color: '#c9973a' });
  });

  it('Tailwind-compiled CSS (rgb with an opacity variable) now yields colours, most-used first', async () => {
    const css = [
      '.bg-a{background-color:rgb(232 66 10/var(--tw-bg-opacity))}',
      '.text-a{color:rgb(232 66 10/var(--tw-text-opacity))}',
      '.border-a{border-color:rgb(232 66 10/var(--tw-border-opacity))}',
      '.text-b{color:rgb(201 151 58/var(--tw-text-opacity))}',
      '.bg-w{background-color:rgb(255 255 255/var(--tw-bg-opacity))}',   // neutral: never a brand colour
    ].join('');
    const v = await extractVisualHints(page(`<style>${css}</style>`), 'https://acme.test/');
    expect(v.primary_color).toBe('#e8420a');
    expect(v.secondary_color).toBe('#c9973a');
  });

  it('a rendered page whose theme is inline style attributes yields its colours', async () => {
    const body = '<a style="color: rgb(232, 66, 10);">x</a><button style="background-color: rgb(232, 66, 10); color: rgb(255, 255, 255)">y</button>'
      + `<span style='color:rgb(18, 160, 144)'>z</span>`;
    const v = await extractVisualHints(page('', body), 'https://acme.test/');
    expect(v).toMatchObject({ primary_color: '#e8420a', secondary_color: '#12a090' });
  });

  it('a colourless page still finds nothing — never a guess', async () => {
    const v = await extractVisualHints(page('<style>body{color:rgb(20 20 20);background:#fff}</style>', '<p style="margin:0">hi</p>'), 'https://acme.test/');
    expect(v.primary_color).toBeUndefined();
  });
});
