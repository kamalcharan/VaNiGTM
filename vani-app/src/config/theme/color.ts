/**
 * The smallest colour maths a theme needs, and nothing more.
 *
 * A theme declares about a dozen colours. The console uses about forty tokens —
 * three background steps, three text steps, two border steps, glass at three
 * alphas, primary at three alphas. The difference is DERIVED here rather than
 * written out per theme, because a hand-written forty-value palette is where
 * "the light mode's third surface is slightly wrong" comes from, and nobody
 * ever notices until a screen looks flat.
 *
 * Deriving also means a NEW theme is a dozen values. That is the difference
 * between four themes and four themes nobody wants to add a fifth to.
 *
 * Everything here works in sRGB and stays in hex/rgba. No colour-space
 * cleverness: these are small nudges between two known colours, and OKLCH
 * would add a dependency to move a border 4% toward the text colour.
 */

interface Rgb { r: number; g: number; b: number; a: number }

/** #rgb, #rrggbb, #rrggbbaa or rgba(...). Anything else throws — loudly. */
export function parse(input: string): Rgb {
  const s = input.trim();

  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (rgba) {
    return {
      r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }

  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length === 6) h += 'ff';
    if (h.length !== 8) throw new Error(`Unsupported hex colour: ${input}`);
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: parseInt(h.slice(6, 8), 16) / 255,
    };
  }

  // Not silently returning black: a typo in a theme file would then paint the
  // console black and look like a design decision (rule 12).
  throw new Error(`Cannot parse colour: ${input}`);
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

function toCss({ r, g, b, a }: Rgb): string {
  if (a >= 1) {
    return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`;
  }
  return `rgba(${clamp(r)}, ${clamp(g)}, ${clamp(b)}, ${Number(a.toFixed(3))})`;
}

/** `amount` of `a` over `b`. mix(x, y, 0) === y. */
export function mix(a: string, b: string, amount: number): string {
  const A = parse(a);
  const B = parse(b);
  const t = Math.max(0, Math.min(1, amount));
  return toCss({
    r: B.r + (A.r - B.r) * t,
    g: B.g + (A.g - B.g) * t,
    b: B.b + (A.b - B.b) * t,
    a: B.a + (A.a - B.a) * t,
  });
}

/** The same colour at a given opacity. Used for glass and the primary alphas. */
export function alpha(colour: string, a: number): string {
  const c = parse(colour);
  return toCss({ ...c, a: Math.max(0, Math.min(1, a)) });
}

/**
 * Perceived brightness, 0–255 (ITU-R BT.601).
 *
 * A cheap "is this light or dark" for layout decisions — whether a colour in a
 * surface slot is plausibly a surface. NOT for choosing text colour: see
 * `bestTextOn`, which uses the contrast maths that actually governs legibility.
 */
export function luminance(colour: string): number {
  const { r, g, b } = parse(colour);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** WCAG relative luminance — the gamma-corrected one, not the BT.601 shortcut. */
function relativeLuminance(colour: string): number {
  const { r, g, b } = parse(colour);
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Which of two text colours to put ON a background — whichever actually reads
 * better, measured.
 *
 * This was a brightness threshold, and it got the VaNi orange wrong: #ff6b2b
 * sits at 144 on the BT.601 scale, just under the cutoff, so it chose white —
 * which is 3.0:1 against that orange, while the theme's own dark ink is 5.9:1.
 * Every primary button in the default theme would have been the less legible
 * of the two options available. Brightness is not contrast, and guessing the
 * threshold is how one theme in four ends up hard to read.
 */
export function bestTextOn(background: string, dark: string, light: string): string {
  return contrast(background, dark) >= contrast(background, light) ? dark : light;
}

/** Toward white by `amount`. */
export const lighten = (colour: string, amount: number) => mix('#ffffff', colour, amount);
/** Toward black by `amount`. */
export const darken = (colour: string, amount: number) => mix('#000000', colour, amount);
