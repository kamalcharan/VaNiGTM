// api/_lib/engine.js
// Deterministic scoring engine — ported verbatim from the playground HTML.
// Must stay byte-identical to the copy in public/ai-advisory-playground.html;
// any change to the formulas has to land in both places together.

export function scores(p) {
  return {
    build: 2 * p.diff + 2 * p.hl + p.bench - (p.speed >= 4 ? 2 : 0),
    buy: 2 * (6 - p.diff) + (6 - p.hl) + (p.speed >= 4 ? 3 : 1),
    partner:
      2 * (6 - p.bench) +
      (p.speed >= 4 ? 2 : 0) +
      (p.exit >= 4 ? 4 : p.exit <= 2 ? -3 : 0) +
      (6 - p.hl),
  };
}

export function winner(sc) {
  const m = Math.max(sc.build, sc.buy, sc.partner);
  return sc.build === m ? 'build' : sc.buy === m ? 'buy' : 'partner';
}

export const NAMES = {
  build: 'BUILD',
  buy: 'BUY the engine — BUILD the layer',
  partner: 'PARTNER — with eyes open',
};
