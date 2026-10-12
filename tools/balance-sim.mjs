// Simuleert een slimme speler om de balans te controleren.
// Gebruik: node tools/balance-sim.mjs [minuten] [--prestige] [-v]
import * as E from '../js/economy.js';
import { spend } from './bot.mjs';

const minutes = Number(process.argv[2] || 120);
const doPrestige = process.argv.includes('--prestige');
const verbose = process.argv.includes('-v');
// Een echte speler reageert niet elke seconde; we kopen elke "beat" seconden.
const beat = 2;

const fmt = (n) => {
  if (n < 1000) return n.toFixed(n < 10 ? 1 : 0);
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(2) + u[i];
};
const clock = (s) => `${String(Math.floor(s / 60)).padStart(3)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const s = E.newState();
let t = 0;
let lastReport = 0;
let purchases = 0, lastPurchaseAt = 0, maxGap = 0, upgCount = 0;
let runStart = 0;
const gaps = [];
const paybacks = [];
const chainCost = [];
const spent = { line: 0, orchard: 0, sales: 0, upgrade: 0, event: 0 };
while (t < minutes * 60) {
  E.tick(s, beat);
  t += beat;
  for (const o of spend(s)) {
    if (o.label.startsWith('line') && o.gain > 0) paybacks.push([t, o.cost / o.gain]);
    if (o.upg) upgCount++;
    const kind = o.event ? 'event' : o.upg ? 'upgrade' : o.label.startsWith('line') ? 'line' : o.label;
    spent[kind] += o.cost - (o.extra ? o.extra.orchard + o.extra.sales : 0);
    const inc = Math.max(1e-9, E.incomePerSecond(s));
    if (o.label === 'orchard' || o.label === 'sales') chainCost.push([t, o.cost / inc]);
    else if (o.extra && o.extra.orchard + o.extra.sales > 0) chainCost.push([t, (o.extra.orchard + o.extra.sales) / inc]);
    if (o.extra) { spent.orchard += o.extra.orchard; spent.sales += o.extra.sales; }
    purchases++;
    gaps.push(t - lastPurchaseAt);
    maxGap = Math.max(maxGap, t - lastPurchaseAt);
    lastPurchaseAt = t;
    if (o.event || (o.upg && verbose)) console.log(`${clock(t)}  ${o.label.padEnd(34)} inkomen ${fmt(E.incomePerSecond(s))}/s`);
  }
  if (t - lastReport >= 300) {
    lastReport = t;
    const p = E.computeProduction(s, 0, true);
    console.log(`${clock(t)}  -- inkomen ${fmt(p.income)}/s  appels ${fmt(p.supply)}/s (vrij ${fmt(p.spare)}) kratten ${fmt(p.output)}/${fmt(p.transport)}  boomgaard L${s.orchard} wagens L${s.sales} lijnen [${s.lines.join(',')}]  inv +${E.pendingInvestors(s)} (${s.investors}) upg ${upgCount}`);
  }
  if (doPrestige) {
    const pend = E.pendingInvestors(s);
    const runTime = t - runStart;
    // reset wanneer de investeerders het inkomen minstens verdubbelen en er even niets nieuws te kopen valt
    if (pend > 0 && pend * 0.05 >= Math.max(1, s.investors * 0.05) * 1.0 && t - lastPurchaseAt > 30 && runTime > 600) {
      console.log(`${clock(t)}  ===== INVESTEERDERS: +${pend} (totaal ${s.investors + pend}) na run van ${(runTime / 60).toFixed(1)} min`);
      E.prestige(s);
      runStart = t;
    }
  }
}
gaps.sort((a, b) => a - b);
// terugverdientijd van lijn-upgrades per half uur (mediaan, in minuten)
for (let h = 0; h < minutes; h += 30) {
  const p = paybacks.filter(([tt]) => tt >= h * 60 && tt < (h + 30) * 60).map(([, v]) => v / 60).sort((a, b) => a - b);
  if (p.length) console.log(`terugverdientijd lijn-upgrades ${h}-${h + 30} min: mediaan ${p[Math.floor(p.length / 2)].toFixed(1)} min (${p.length} upgrades)`);
}
for (let h = 0; h < minutes; h += 30) {
  const p = chainCost.filter(([tt]) => tt >= h * 60 && tt < (h + 30) * 60).map(([, v]) => v).sort((a, b) => a - b);
  if (p.length) console.log(`boomgaard/vrachtwagens ${h}-${h + 30} min: mediaan ${p[Math.floor(p.length / 2)].toFixed(0)} s inkomen per aankoop, p90 ${p[Math.floor(p.length * 0.9)].toFixed(0)} s (${p.length}x)`);
}
const tot = Object.values(spent).reduce((a, b) => a + b, 0);
console.log('uitgaven: ' + Object.entries(spent).map(([k, v]) => `${k} ${(v / tot * 100).toFixed(1)}%`).join(', '));
console.log(`aankopen: ${purchases}, mediane wachttijd ${gaps[Math.floor(gaps.length / 2)]}s, p90 ${gaps[Math.floor(gaps.length * 0.9)]}s, langste ${maxGap}s`);
