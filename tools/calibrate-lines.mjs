// Stelt per productielijn de waarde (value) en de levelprijs (cost) af, zodat een nieuwe lijn
// bij het bouwen op level 1-2 begint en daarna geleidelijk meegroeit, lijn voor lijn:
// - cost: level 1 -> 2 kost een vast deel (CFRAC) van de bouwprijs van de lijn, zodat je er na het
//   bouwen een paar levels bij koopt en niet honderden in één keer
// - value: zo gekozen (bisectie) dat de nieuwe lijn 10 minuten na het bouwen ongeveer SHARE[i]
//   van het inkomen levert
// Gebruik: node tools/calibrate-lines.mjs [--write]   (daarna tools/calibrate.mjs voor de bouwprijzen)
import { readFileSync, writeFileSync } from 'node:fs';
import * as E from '../js/economy.js';
import { LINES, GOLDEN } from '../js/config.js';
import { goalAt, goalProgress, goalReward } from '../js/goals.js';
import { spend } from './bot.mjs';

const SHARE = (process.env.SHARE || '0,0.35,0.3,0.25,0.25,0.25,0.25,0.25').split(',').map(Number);
const CFRAC = Number(process.env.CFRAC || 0.03);

// beste terugverdientijd (s) van één level op een bestaande lijn
function linePayback(s) {
  const inc = E.incomePerSecond(s);
  let best = Infinity;
  LINES.forEach((l, i) => {
    if (s.lines[i] <= 0) return;
    const q = E.upgradeQuote(s, 'line', i, 1);
    const c = structuredClone(s); c.lines[i]++;
    const d = E.incomePerSecond(c) - inc;
    if (d > 0) best = Math.min(best, q.cost / d);
  });
  return best;
}

// één stap zoals een speler: tijd, gouden appels, taken, kopen
function step(r, allow) {
  E.tick(r.s, 2); r.t += 2;
  const inc = E.incomePerSecond(r.s);
  if (r.t % 88 < 2) E.earn(r.s, Math.max(GOLDEN.minReward, inc * GOLDEN.incomeSeconds));
  const g = goalAt(r.s.goal);
  if (g.type !== 'prestige') { const p = goalProgress(g, r.s, inc); if (p.cur >= p.max) { E.earn(r.s, goalReward(g, inc)); r.s.goal++; } }
  spend(r.s, allow);
}

const clone = (r) => ({ s: structuredClone(r.s), t: r.t });

// speelt tot lijn i gebouwd kan worden en bouwt hem dan meteen (de bot doet dat ook bijna altijd)
function runToUnlock(base, i, limit = 200 * 60) {
  const r = clone(base);
  const allow = (k) => k !== 'line' + i;
  while (r.t < limit) {
    if (E.lineUnlockable(r.s, i) && r.s.money >= LINES[i].unlock) {
      r.s.money -= LINES[i].unlock;
      r.s.lines[i] = 1;
      return r;
    }
    step(r, allow);
  }
  return null;
}

// aandeel van lijn i na 10 minuten (zonder nieuwe lijnen erbij)
function shareAfter(start, i, minutes = 10) {
  const r = clone(start);
  const allow = (k) => !k.startsWith('line');
  const end = r.t + minutes * 60;
  while (r.t < end) step(r, allow);
  const p = E.computeProduction(r.s, 0, true);
  return { share: p.lines[i].income / p.income, lv: r.s.lines[i], s: r.s };
}

function levelsAfter(start, i, secs) {
  const r = clone(start);
  const allow = (k) => !k.startsWith('line');
  const out = [];
  let k = 0;
  while (k < secs.length) { step(r, allow); if (r.t - start.t >= secs[k]) { out.push(r.s.lines[i]); k++; } }
  return out;
}

let base = { s: Object.assign(E.newState(), { tutorial: 99 }), t: 0 };
base.s.stats.chain = 1;
const result = [];
for (let i = 1; i < LINES.length; i++) {
  const l = LINES[i];
  const at = runToUnlock(base, i);
  if (!at) { console.log(`${l.id}: niet bereikt`); break; }
  l.cost = Number((CFRAC * l.unlock).toPrecision(2));
  // bisectie op de waarde (de prijs ligt vast)
  let lo = Math.log10(l.cost) - 8, hi = Math.log10(l.cost) + 2, best = null;
  for (let it = 0; it < 16; it++) {
    const mid = (lo + hi) / 2;
    l.value = Number((10 ** mid).toPrecision(2));
    const r = shareAfter(at, i);
    if (!best || Math.abs(r.share - SHARE[i]) < Math.abs(best.share - SHARE[i])) best = { value: l.value, cost: l.cost, share: r.share, lv: r.lv };
    if (r.share < SHARE[i]) lo = mid; else hi = mid;
    if (hi - lo < 0.03) break;
  }
  l.value = best.value;
  l.cost = best.cost;
  const lv = levelsAfter(at, i, [10, 60, 300]);
  result.push(l);
  console.log(`${l.id.padEnd(6)} gebouwd ${(at.t / 60).toFixed(1)} min | value ${l.value.toPrecision(2)} cost ${l.cost.toPrecision(2)} | Lv na 10 s ${lv[0]}, 1 min ${lv[1]}, 5 min ${lv[2]}, 10 min ${best.lv} | aandeel ${(best.share * 100).toFixed(0)}%`);
  base = at;
}

if (process.argv.includes('--write')) {
  const file = new URL('../js/config.js', import.meta.url);
  let src = readFileSync(file, 'utf8');
  const num = (v) => { const n = Number(v.toPrecision(2)); return n >= 1e4 ? n.toExponential().replace('e+', 'e') : String(n); };
  for (const l of result) {
    src = src.replace(new RegExp(`(id: '${l.id}'.*?value: )[0-9.e+]+,( *)`), (m, a) => `${a}${num(l.value)},`.padEnd(m.length, ' '));
    src = src.replace(new RegExp(`(id: '${l.id}'.*?cost: )[0-9.e+]+,( *)`), (m, a) => `${a}${num(l.cost)},`.padEnd(m.length, ' '));
  }
  writeFileSync(file, src);
  console.log('config.js bijgewerkt');
}
