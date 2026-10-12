// Een slimme speler voor de balans-simulaties: koopt steeds wat zich het snelst terugverdient.
import * as E from '../js/economy.js';
import { LINES, UPGRADES } from '../js/config.js';

export function options(s, allow = () => true) {
  const o = [];
  o.push({ label: 'orchard', cost: E.upgradeQuote(s, 'orchard', 0, 1).cost, apply: (c) => { c.orchard++; } });
  o.push({ label: 'sales', cost: E.upgradeQuote(s, 'sales', 0, 1).cost, apply: (c) => { c.sales++; } });
  LINES.forEach((l, i) => {
    if (s.lines[i] > 0) o.push({ label: 'line' + i, cost: E.upgradeQuote(s, 'line', i, 1).cost, apply: (c) => { c.lines[i]++; } });
    else if (E.lineUnlockable(s, i) && allow('line' + i)) o.push({ label: 'UNLOCK ' + l.name, key: 'line' + i, cost: l.unlock, event: true, bias: 0.5, apply: (c) => { c.lines[i] = 1; } });
  });
  const t = E.nextTier(s);
  if (t && allow('tier' + (s.tier + 1))) o.push({ label: 'TIER ' + t.name, key: 'tier' + (s.tier + 1), cost: t.cost, event: true, bias: 0.5, apply: (c) => { c.tier++; } });
  for (const r of UPGRADES) if (E.upgradeAvailable(s, r)) o.push({ label: 'upgrade ' + r.name, key: r.id, cost: r.cost, upg: true, apply: (c) => { c.research[r.id] = true; } });
  return o;
}

// Voert een upgrade uit en koopt daarna wat nodig is om de keten weer in balans te krijgen
// (vrachtwagens of boomgaard), zoals een echte speler zou doen. Geeft de totale kosten en wat er bij kwam terug.
export function bundle(c, o) {
  let cost = o.cost;
  const extra = { orchard: 0, sales: 0 };
  o.apply(c);
  for (let k = 0; k < 80; k++) {
    const p = E.computeProduction(c, 0, true);
    if (o.label !== 'sales' && p.potential > p.transport * 1.001) { const q = E.upgradeQuote(c, 'sales', 0, 1).cost; cost += q; extra.sales += q; c.sales++; }
    else if (o.label !== 'orchard' && p.lines.some((l) => l.status === 'apples')) { const q = E.upgradeQuote(c, 'orchard', 0, 1).cost; cost += q; extra.orchard += q; c.orchard++; }
    else break;
  }
  return { cost, extra };
}

export function best(s, allow) {
  const inc = E.incomePerSecond(s);
  let bestO = null, bestScore = Infinity;
  for (const o of options(s, allow)) {
    const c = structuredClone(s);
    const b = o.event ? (o.apply(c), { cost: o.cost, extra: { orchard: 0, sales: 0 } }) : bundle(c, o);
    let d = E.incomePerSecond(c) - inc;
    // een nieuwe lijn of hal opent de weg naar meer; waardeer dat iets hoger
    if (o.event) d = Math.max(d, inc * 0.25);
    // een goedkope boomgaard- of vrachtwagenupgrade koopt een speler ook als hij pas later helpt
    if (o.upg && /^(orch|truck)_/.test(o.key || '') && o.cost < inc * 120) d = Math.max(d, inc * 0.02);
    if (d <= 0) continue;
    const wait = b.cost > s.money ? (b.cost - s.money) / Math.max(inc, 1e-9) : 0;
    const score = wait + (b.cost / d) * (o.bias ?? 1);
    if (score < bestScore) { bestScore = score; bestO = { ...o, base: o.cost, cost: b.cost, extra: b.extra }; }
  }
  return bestO;
}

// Koopt met het geld wat de bot wil. Geeft de gekochte opties terug.
export function spend(s, allow) {
  const bought = [];
  for (;;) {
    const o = best(s, allow);
    if (!o || o.cost > s.money) break;
    const incBefore = E.incomePerSecond(s);
    // bundle rekent zelf de boomgaard/vrachtwagens erbij: begin bij de kale prijs
    if (o.event) { o.apply(s); s.money -= o.cost; } else { s.money -= bundle(s, { ...o, cost: o.base }).cost; }
    o.gain = E.incomePerSecond(s) - incBefore;
    bought.push(o);
  }
  return bought;
}
