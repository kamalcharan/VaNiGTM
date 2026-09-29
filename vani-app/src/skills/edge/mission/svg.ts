/**
 * The mined-process graph as an SVG string — reference `processSVG()`,
 * verbatim. A string rather than JSX because the Automation Strategy report
 * (a self-contained HTML download) embeds the same drawing; one builder,
 * two consumers, no drift.
 */
import { escapeHTML as e } from './model';
import type { ReferenceData } from './reference';
import type { Mission } from './types';

export function processSVG(d: ReferenceData, m: Pick<Mission, 'process' | 'variant' | 'lens' | 'selectedNode'>): string {
  const active = d.variants.find((v) => v.id === m.variant)?.seq;
  const pairs = active?.slice(1).map((n, i) => active[i] + '-' + n);
  return `<svg class="mined-map" viewBox="-45 0 530 630" role="img" aria-label="${m.process === 'p2p' ? 'P2P sample' : 'Illustrative O2C'} process graph"><defs><marker id="end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L10 5 L0 10" fill="#90a481"/></marker></defs>${d.edges.map((edge, i) => {
    const [from, to, count, wait, normal, kind] = edge, a = d.nodes[from], b = d.nodes[to], dim = pairs && !pairs.includes(from + '-' + to);
    const side = a.x !== b.x, back = b.y <= a.y, offset = 45 + (i % 4) * 16;
    const x1 = a.x + (side ? (b.x > a.x ? 59 : -59) : back ? -59 : 0), y1 = a.y + (side || back ? 0 : 16), x2 = b.x + (side ? (a.x > b.x ? 59 : -59) : back ? -59 : 0), y2 = b.y + (side || back ? 0 : -16);
    const path = side ? `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}` : Math.abs(b.y - a.y) > 100 || back ? `M${x1} ${y1} C${x1 - offset} ${y1} ${x2 - offset} ${y2} ${x2} ${y2}` : `M${x1} ${y1} L${x2} ${y2}`;
    const color = m.lens === 'waiting' ? (kind ? '#a5aaa0' : wait >= 7 ? '#b9674c' : wait >= 3 ? '#b39547' : '#6f9b7f') : (normal ? '#65947a' : '#bc9a47');
    return `<g opacity="${dim ? .13 : 1}"><path d="${path}" fill="none" stroke="${color}" stroke-width="${Math.max(1.5, 7 * count / 13357)}" marker-end="url(#end)" ${kind ? 'stroke-dasharray="5 4"' : ''}/>${!dim && count >= 1000 ? `<text x="${side ? (x1 + x2) / 2 : a.x + 10}" y="${(y1 + y2) / 2}" class="edge-label">${m.lens === 'waiting' ? wait + 'd' : count.toLocaleString('en-IN')}</text>` : ''}</g>`;
  }).join('')}${Object.entries(d.nodes).map(([id, n]) => `<g class="graph-node" role="button" tabindex="0" aria-label="Inspect ${e(n.label)}" data-action="inspect-node" data-id="${id}" opacity="${active && !active.includes(id) ? .35 : 1}"><rect x="${n.x - 62}" y="${n.y - 17}" width="124" height="36" rx="8" fill="${m.selectedNode === id ? '#e4edcf' : '#fbfcf7'}" stroke="${n.side ? '#c5ab6d' : '#9eb49b'}"/><text x="${n.x}" y="${n.y - 1}" text-anchor="middle">${e(n.label)}</text><text class="count" x="${n.x}" y="${n.y + 12}" text-anchor="middle">${n.n.toLocaleString('en-IN')}</text></g>`).join('')}</svg>`;
}
