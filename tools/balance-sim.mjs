// Simuleert een slimme speler om de balans te controleren.
// Gebruik: node tools/balance-sim.mjs [minuten] [--prestige]
import * as E from '../js/economy.js';
import { LINES, TIERS, RESEARCH } from '../js/config.js';

const minutes = Number(process.argv[2] || 120);
const doPrestige = process.argv.includes('--prestige');
// Een echte speler reageert niet elke seconde; we kopen elke "beat" seconden.
const beat = 2;

const fmt = (n) => {
  if (n < 1000) return n.toFixed(n < 10 ? 1 : 0);
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(2) + u[i];
};
const clock = (s) => `${String(Math.floor(s / 60)).padStart(3)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function options(s) {
  const o = [];
  o.push({ label: 'orchard', cost: E.upgradeQuote(s, 'orchard', 0, 1).cost, apply: (c) => { c.orchard++; } });
  o.push({ label: 'sales', cost: E.upgradeQuote(s, 'sales', 0, 1).cost, apply: (c) => { c.sales++; } });
  LINES.forEach((l, i) => {
    if (s.lines[i] > 0) o.push({ label: 'line' + i, cost: E.upgradeQuote(s, 'line', i, 1).cost, apply: (c) => { c.lines[i]++; } });
    else if (E.lineUnlockable(s, i)) o.push({ label: 'UNLOCK ' + l.name, cost: l.unlock, event: true, bias: 0.5, apply: (c) => { c.lines[i] = 1; } });
  });
  const t = E.nextTier(s);
  if (t) o.push({ label: 'TIER ' + t.name, cost: t.cost, event: true, bias: 0.5, apply: (c) => { c.tier++; } });
  for (const r of RESEARCH) if (E.researchAvailable(s, r)) o.push({ label: 'research ' + r.name, cost: r.cost, event: true, apply: (c) => { c.research[r.id] = true; } });
  return o;
}

function best(s) {
  const inc = E.incomePerSecond(s);
  let bestO = null, bestScore = Infinity;
  for (const o of options(s)) {
    const c = structuredClone(s);
    o.apply(c);
    let d = E.incomePerSecond(c) - inc;
    // een nieuwe lijn of hal opent de weg naar meer; waardeer dat iets hoger
    if (o.label.startsWith('UNLOCK') || o.label.startsWith('TIER')) d = Math.max(d, inc * 0.25);
    if (d <= 0) continue;
    const score = Math.max(0, o.cost - s.money) / inc + (o.cost / d) * (o.bias ?? 1);
    if (score < bestScore) { bestScore = score; bestO = o; }
  }
  return bestO;
}

const s = E.newState();
let t = 0;
let lastReport = 0;
let purchases = 0, lastPurchaseAt = 0, maxGap = 0;
let runStart = 0;
const gaps = [];
while (t < minutes * 60) {
  E.tick(s, beat);
  t += beat;
  for (;;) {
    const o = best(s);
    if (!o || o.cost > s.money) break;
    s.money -= o.cost;
    o.apply(s);
    purchases++;
    gaps.push(t - lastPurchaseAt);
    maxGap = Math.max(maxGap, t - lastPurchaseAt);
    lastPurchaseAt = t;
    if (o.event) console.log(`${clock(t)}  ${o.label.padEnd(34)} inkomen ${fmt(E.incomePerSecond(s))}/s`);
  }
  if (t - lastReport >= 300) {
    lastReport = t;
    const p = E.computeProduction(s);
    console.log(`${clock(t)}  -- inkomen ${fmt(p.income)}/s  appels ${fmt(p.supply)}/s (vrij ${fmt(p.spare)})  boomgaard L${s.orchard} verkoop L${s.sales} lijnen [${s.lines.join(',')}]  investeerders +${E.pendingInvestors(s)} (heeft ${s.investors})`);
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
console.log(`aankopen: ${purchases}, mediane wachttijd ${gaps[Math.floor(gaps.length / 2)]}s, p90 ${gaps[Math.floor(gaps.length * 0.9)]}s, langste ${maxGap}s`);
