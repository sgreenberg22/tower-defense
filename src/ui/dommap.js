// The Dominion war map, dressed like the Realm's Map of Aldermere: aged parchment, a shallow sea with ripple lines around
// the coast, ink-bordered hexes washed in terrain colours, little hand-drawn glyphs, a compass rose and a framed cartouche.
// The hexes stay SVG so each one is still a button; this module only supplies the painting around and on them.
import { mulberry32, hashStr } from '../core/rng.js';

export const INK = '#4a3420';
export const WASH = { plains: '#cbd193', forest: '#a9c48a', hills: '#cdb98f', marsh: '#b4c6a6', river: '#b7d0d2', snow: '#e5ecef', ash: '#c9a690' };
const SEA = '#9dbbb4', SHALLOW = '#bcd3c8', RIPPLE = '#6f908d';

// Defs: wave lines for the sea and a scribbled haze for land nobody has seen yet.
export const defs = `<defs>
  <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(60,30,10,0.2)" stroke-width="3"/></pattern>
  <pattern id="haze" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><line x1="0" y1="0" x2="0" y2="9" stroke="rgba(74,52,32,0.22)" stroke-width="1.2"/></pattern>
  <pattern id="waves" width="46" height="30" patternUnits="userSpaceOnUse"><path d="M4 10q4-4 8 0t8 0M26 24q4-4 8 0t8 0" fill="none" stroke="rgba(60,90,90,0.42)" stroke-width="1.1" stroke-linecap="round"/></pattern>
  <radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="rgba(92,58,26,0)"/><stop offset="100%" stop-color="rgba(92,58,26,0.38)"/></radialGradient>
</defs>`;

// Sea, shallows and the land's own coastline, under every hex. `polys` is the list of point strings of every hex on the map.
export function sea(polys, w, h) {
  const all = polys.map((p) => `<polygon points="${p}"/>`).join('');
  return `<g class="sea" aria-hidden="true"><rect x="-80" y="-80" width="${w + 160}" height="${h + 160}" fill="${SEA}"/><rect x="-80" y="-80" width="${w + 160}" height="${h + 160}" fill="url(#waves)"/>`
    + `<g fill="${SHALLOW}" stroke="${SHALLOW}" stroke-linejoin="round" stroke-opacity=".5" stroke-width="64">${all}</g>`
    + `<g fill="none" stroke="${RIPPLE}" stroke-linejoin="round" stroke-opacity=".5" stroke-width="2.4" stroke-dasharray="2 5">${polys.map((p) => `<polygon points="${p}" transform="translate(0 0)" style="stroke-width:46px;stroke-opacity:.18"/>`).join('')}</g>`
    + `<g fill="${SHALLOW}" stroke="#e6efe4" stroke-linejoin="round" stroke-opacity=".6" stroke-width="30">${all}</g>`
    + `<g fill="#3b2a1a" stroke="#3b2a1a" stroke-linejoin="round" stroke-width="7">${all}</g></g>`;
}

// A few hand-inked glyphs in the corners of a hex, never over the middle where the icon and name sit.
export function glyphs(terrain, cx, cy, q, r) {
  const rnd = mulberry32(hashStr(`g${q},${r}`));
  const spots = [[cx - 21, cy - 5], [cx + 21, cy - 5], [cx - 19, cy + 12], [cx + 19, cy + 12]];
  const pick = spots.filter(() => rnd() < 0.55).slice(0, 2);
  if (!pick.length) pick.push(spots[Math.floor(rnd() * 4)]);
  let out = '';
  for (const [x, y] of pick) out += glyph(terrain, x, y, rnd);
  return `<g class="gl" aria-hidden="true" fill="none" stroke="${INK}" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round">${out}</g>`;
}
function glyph(t, x, y, rnd) {
  const f = (n) => n.toFixed(1);
  switch (t) {
    case 'forest': return [[-3, 1], [3, -1]].map(([dx, dy]) => `<path d="M${f(x + dx)} ${f(y + dy + 2)}v4"/><circle cx="${f(x + dx)}" cy="${f(y + dy - 1)}" r="3.6" fill="#6f8f4e"/>`).join('');
    case 'hills': return `<path d="M${f(x - 8)} ${f(y + 4)}q8-14 16 0z" fill="rgba(160,130,90,.6)"/><path d="M${f(x + 1)} ${f(y - 1)}l-1 4M${f(x + 4)} ${f(y)}l-1 3"/>`;
    case 'marsh': return `<path d="M${f(x - 4)} ${f(y + 4)}l1-8M${f(x)} ${f(y + 4)}l0-10M${f(x + 4)} ${f(y + 4)}l-1-7"/><ellipse cx="${f(x)}" cy="${f(y - 6)}" rx="1.4" ry="2.2" fill="#7a5a3a"/>`;
    case 'river': return `<path d="M${f(x - 8)} ${f(y)}q4-4 8 0t8 0M${f(x - 6)} ${f(y + 5)}q4-4 8 0t6 0" stroke="#4f7f9d"/>`;
    case 'snow': return `<path d="M${f(x - 8)} ${f(y + 5)}l8-13 8 13z" fill="#f2f6f8"/><path d="M${f(x - 3)} ${f(y - 2)}l3 2 3-2"/>`;
    case 'ash': return rnd() < 0.5 ? `<path d="M${f(x - 8)} ${f(y + 5)}l6-11h4l6 11z" fill="#6b5148"/><circle cx="${f(x)}" cy="${f(y - 7)}" r="1.4" fill="#d9532c" stroke="none"/>` : `<path d="M${f(x - 7)} ${f(y + 4)}l4-8 3 5 3-6 4 9z" fill="#7a5f55"/>`;
    default: return rnd() < 0.5 ? `<path d="M${f(x - 5)} ${f(y + 3)}l1-6M${f(x - 1)} ${f(y + 3)}l0-8M${f(x + 3)} ${f(y + 3)}l-1-6"/><circle cx="${f(x - 1)}" cy="${f(y - 6)}" r="1" fill="#c9a73b" stroke="none"/>` : `<path d="M${f(x - 6)} ${f(y + 3)}h12M${f(x - 5)} ${f(y)}h10M${f(x - 4)} ${f(y - 3)}h8" stroke-dasharray="3 1.5"/>`;
  }
}

// Compass rose, frame and a cartouche with the war's name, drawn over everything but under the hexes' events.
export function decor(w, h, title, sub) {
  const cx = 62, cy = h - 50;
  let rose = `<circle r="30" fill="rgba(239,225,191,.7)"/><circle r="30"/><circle r="25"/>`;
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r0 = i % 2 ? 25 : 22; rose += `<path d="M${(Math.cos(a) * r0).toFixed(1)} ${(Math.sin(a) * r0).toFixed(1)}L${(Math.cos(a) * 30).toFixed(1)} ${(Math.sin(a) * 30).toFixed(1)}"/>`; }
  rose += `<path d="M0-27L4 0 0 27-4 0z" fill="#3b2a1a"/><path d="M-27 0L0-4 27 0 0 4z" fill="#efe1bf"/><circle r="2.6" fill="#b3262e"/><text y="-35" text-anchor="middle" class="rose-n">N</text>`;
  const tw = Math.min(w - 40, 270);
  return `<g class="decor" aria-hidden="true">`
    + `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#vig)" pointer-events="none"/>`
    + `<g transform="translate(${cx} ${cy})" fill="none" stroke="${INK}" stroke-width="1">${rose}</g>`
    + `<g transform="translate(${(w - tw) / 2} 9)"><path d="M14 0H${tw - 14}q14 17 0 34H14Q0 17 14 0z" fill="#efe0b9" stroke="${INK}" stroke-width="1.3"/><text x="${tw / 2}" y="16" text-anchor="middle" class="cart-t">${title}</text><text x="${tw / 2}" y="28" text-anchor="middle" class="cart-s">${sub}</text></g>`
    + `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" fill="none" stroke="${INK}" stroke-width="3"/><rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="${INK}" stroke-width="1"/>`
    + `</g>`;
}
