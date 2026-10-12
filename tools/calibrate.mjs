// Stelt de bouwprijzen van lijnen en uitbreidingen af op doeltijden in de eerste ronde.
// Werkt gebeurtenis voor gebeurtenis: vanaf de stand net na de vorige gebeurtenis zoekt hij (bisectie)
// de prijs waarbij de bot de volgende precies op tijd koopt.
// Gebruik: node tools/calibrate.mjs [--write]
import * as E from '../js/economy.js';
import { LINES, TIERS, GOLDEN } from '../js/config.js';
import { goalAt, goalProgress, goalReward } from '../js/goals.js';
import { spend } from './bot.mjs';

const TARGETS = [['line1', 2], ['tier1', 6], ['line2', 8], ['tier2', 12], ['line3', 14], ['tier3', 20], ['line4', 23], ['tier4', 34], ['line5', 38], ['tier5', 54], ['line6', 58]];
const setCost = (k, v) => { if (k.startsWith('line')) LINES[+k.slice(4)].unlock = v; else TIERS[+k.slice(4)].cost = v; };
const getCost = (k) => (k.startsWith('line') ? LINES[+k.slice(4)].unlock : TIERS[+k.slice(4)].cost);
const BLOCK = 1e300;
// de late prijzen (na de eerste investeerders) stel je met de hand af; die blijven staan
const keep = { candy: LINES[7].unlock, tiers: TIERS.map((t) => t.cost) };
// alles na het doel dat we afstellen is onbereikbaar
for (const [k] of TARGETS.slice(1)) setCost(k, BLOCK);
LINES[7].unlock = BLOCK;
for (let t = 6; t < TIERS.length; t++) TIERS[t].cost = BLOCK;

let base = { s: Object.assign(E.newState(), { tutorial: 99, stats: { golden: 1, upgrades: 0, chain: 1 } }), t: 0 };
const clone = (b) => ({ s: structuredClone(b.s), t: b.t });

// draait vanaf b tot gebeurtenis k gekocht is (of tot de limiet); geeft tijd en stand terug
function runTo(b, k, limit) {
  const r = clone(b);
  while (r.t < limit) {
    E.tick(r.s, 2);
    r.t += 2;
    // net als een echte speler: gouden appels en taakbeloningen
    const inc = E.incomePerSecond(r.s);
    if (r.t % 88 < 2) E.earn(r.s, Math.max(GOLDEN.minReward, inc * GOLDEN.incomeSeconds));
    const g = goalAt(r.s.goal);
    if (g.type !== 'prestige') { const p = goalProgress(g, r.s, inc); if (p.cur >= p.max) { E.earn(r.s, goalReward(g, inc)); r.s.goal++; } }
    for (const o of spend(r.s)) if (o.key === k) return { at: r.t, state: r };
  }
  return { at: Infinity, state: r };
}

let prev = 10;
for (const [k, target] of TARGETS) {
  const goal = target * 60;
  let lo = Math.log10(prev);
  let hi = lo + 12;
  let best = null;
  for (let it = 0; it < 18; it++) {
    const mid = (lo + hi) / 2;
    setCost(k, Number((10 ** mid).toPrecision(2)));
    const r = runTo(base, k, goal + 15 * 60);
    if (!best || Math.abs(r.at - goal) < Math.abs(best.r.at - goal)) best = { cost: getCost(k), r };
    if (r.at < goal) lo = mid; else hi = mid;
    if (hi - lo < 0.02) break;
  }
  setCost(k, best.cost);
  prev = best.cost;
  base = best.r.state;
  console.log(`${k.padEnd(6)} prijs ${best.cost.toExponential(1)}  gekocht op ${(best.r.at / 60).toFixed(1)} min (doel ${target})`);
}
LINES[7].unlock = keep.candy;
for (let t = 6; t < TIERS.length; t++) TIERS[t].cost = keep.tiers[t];
console.log(LINES.map((l) => `${l.id}: ${l.unlock.toExponential(1)}`).join('  '));
console.log(TIERS.map((t) => `${t.name}: ${t.cost.toExponential(1)}`).join('  '));
if (process.argv.includes('--write')) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const f = new URL('../js/config.js', import.meta.url);
  let src = readFileSync(f, 'utf8');
  const num = (v) => v.toExponential().replace('e+', 'e');
  for (const l of LINES) src = src.replace(new RegExp(`(id: '${l.id}'.*?unlock: )[0-9.e+]+, *`), (m, a) => `${a}${num(l.unlock)}, `.padEnd(m.length, ' '));
  for (const t of TIERS) if (t.cost) src = src.replace(new RegExp(`(name: '${t.name}',\\s+cost: )[0-9.e+]+, *`), (m, a) => `${a}${num(t.cost)}, `.padEnd(m.length, ' '));
  writeFileSync(f, src);
  console.log('config.js bijgewerkt');
}
