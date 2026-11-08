// "How the castle fell": turns the engine's breach tally into a short, factual explanation for the defeat screen. Pure.
// Input: a run summary ({ leakBy: { id: { name, n, dmg, air, boss } }, fatal: { name, wave, air, boss, champion } | null, victory }).
// Output: null when there is nothing to say, else { headline, parts: [{ name, n, pct }], hint }.
const SHOWN = 3;

export function castleFall(run) {
  if (!run || run.victory) return null;
  const rows = Object.values(run.leakBy || {}).filter((r) => r && r.dmg > 0);
  if (!rows.length) return null;
  const total = rows.reduce((a, r) => a + r.dmg, 0);
  const parts = rows.sort((a, b) => b.dmg - a.dmg).slice(0, SHOWN).map((r) => ({ name: r.name, n: r.n, pct: Math.round((100 * r.dmg) / total) }));
  const f = run.fatal;
  let headline = null;
  // No wave number here: the screen's own headline counts waves held, and two different wave numbers would only confuse.
  if (f) headline = f.boss ? `The boss, ${f.name}, landed the final blow.` : `The final blow came from ${/^[aeiou]/i.test(f.name) ? 'an' : 'a'} ${f.name}.`;
  const airPct = Math.round((100 * rows.filter((r) => r.air).reduce((a, r) => a + r.dmg, 0)) / total);
  const hint = airPct >= 40 ? `Flyers did ${airPct}% of the damage. Archer Towers, Mage Towers and Flak Batteries can hit them.` : null;
  return { headline, parts, hint };
}

export function fallLine(parts) {
  return parts.map((p) => `${p.name} ×${p.n} (${p.pct}%)`).join(', ');
}
