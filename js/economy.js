// Pure spellogica zonder DOM of 3D, zodat de balans-simulatie dezelfde code gebruikt.
import {
  MILESTONES, ORCHARD, SALES, LINES, LINE_GROWTH, LINE_PRICE_STEP, TIERS, START_MONEY,
  RESEARCH, INVESTOR_BONUS, INVESTOR_BASE, DOCK_LEVELS, PICKER_LEVELS, TRUCK,
} from './config.js';

export const SAVE_VERSION = 2;

export function newState() {
  return {
    version: SAVE_VERSION,
    money: START_MONEY,
    runEarned: 0,        // verdiend sinds laatste investeerdersronde
    totalEarned: 0,      // verdiend over alle rondes
    investors: 0,
    prestiges: 0,
    tier: 0,
    orchard: 1,
    sales: 1,
    lines: LINES.map(() => 0),   // 0 = nog niet gebouwd
    apples: 0,           // appels in de appelbak
    goods: 0,            // goederen in het magazijn (basiswaarde)
    trucks: [],          // per vrachtwagen: t = seconden in de rit, load = lading, last = vorige lading (deel van vol)
    research: {},
    goal: 0,
    tutorial: 0,
    stats: { golden: 0, upgrades: 0 },
    playTime: 0,
    lastTick: Date.now(),
    settings: { sound: true, music: true, quality: 'auto' },
  };
}

export function milestoneCount(level) {
  let n = 0;
  for (const m of MILESTONES) if (level >= m) n++;
  return n;
}

export function prevMilestone(level) {
  let p = 1;
  for (const m of MILESTONES) if (level >= m) p = m;
  return p;
}

export function nextMilestone(level) {
  for (const m of MILESTONES) if (level < m) return m;
  return null;
}

const milestoneMult = (level) => 2 ** milestoneCount(level);

export function researchMult(state, target) {
  let m = 1;
  for (const r of RESEARCH) if (state.research[r.id] && r.target === target) m *= r.mult;
  return m;
}

export function tierOrchardMult(state) {
  let m = 1;
  for (let t = 0; t <= state.tier; t++) m *= TIERS[t].orchard;
  return m;
}

export function tierIncomeMult(state) {
  let m = 1;
  for (let t = 0; t <= state.tier; t++) m *= TIERS[t].mult;
  return m;
}

export function investorMult(state) {
  return 1 + state.investors * INVESTOR_BONUS;
}


export function orchardRate(state, level = state.orchard) {
  return ORCHARD.baseRate * level * milestoneMult(level) * tierOrchardMult(state) * researchMult(state, 'orchard');
}

// Waarde van één product (zonder prijsbonussen van onderzoek/uitbreidingen/investeerders).
// Stijgt met het level van de lijn: betere kwaliteit, betere verpakking.
export function lineValue(i, level) {
  return LINES[i].value * (1 + LINE_PRICE_STEP * (Math.max(1, level) - 1));
}

export function lineRate(state, i, level = state.lines[i]) {
  if (level <= 0) return 0;
  return LINES[i].rate * level * milestoneMult(level) * researchMult(state, LINES[i].id);
}

// Hoeveel goederen (basiswaarde per seconde) de vrachtwagens wegbrengen.
export function transportRate(state, level = state.sales) {
  return SALES.baseRate * level * SALES.rateGrowth ** (level - 1) * truckCount(level) * researchMult(state, 'transport');
}

export function binCapacity(state, level = state.orchard) {
  return Math.max(ORCHARD.binMin, orchardRate(state, level) * ORCHARD.binSeconds);
}

export function storeCapacity(state, level = state.sales) {
  return Math.max(SALES.storeMin, transportRate(state, level) * SALES.storeSeconds);
}

// Prijsvermenigvuldiger: onderzoek, uitbreidingen en investeerders.
export function priceMult(state) {
  return researchMult(state, 'all') * tierIncomeMult(state) * investorMult(state);
}

// Aantal laadplekken (en vrachtwagens) bij een level.
export function truckCount(level) {
  return 1 + DOCK_LEVELS.filter((l) => level >= l).length;
}

export function pickerCount(level) {
  return 1 + PICKER_LEVELS.filter((l) => level >= l).length;
}

export function pickerLevel(level) {
  return PICKER_LEVELS.find((l) => level < l) || null;
}

// Hoeveel goederen (basiswaarde) één vrachtwagen per rit meeneemt.
export function truckCapacity(state, level = state.sales) {
  return (transportRate(state, level) / truckCount(level)) * TRUCK.cycle;
}

export function ensureTrucks(state) {
  if (!Array.isArray(state.trucks)) state.trucks = [];
  const n = truckCount(state.sales);
  // nieuwe vrachtwagens komen verspreid over de rit aanrijden, zodat ze niet tegelijk laden
  while (state.trucks.length < n) {
    const k = state.trucks.length;
    state.trucks.push({ t: k === 0 ? 0 : (TRUCK.cycle * (1 - k / n) + TRUCK.loadTime) % TRUCK.cycle, load: 0, last: 0 });
  }
  if (state.trucks.length > n) state.trucks.length = n;
}

export function nextDockLevel(level) {
  return DOCK_LEVELS.find((l) => level < l) || null;
}

// Verdeelt de appels over de lijnen: duurste producten (per appel) eerst.
const lineOrder = LINES.map((l, i) => i).sort((a, b) => LINES[b].value / LINES[b].apples - LINES[a].value / LINES[a].apples);

// Huidige stroom door de keten, rekening houdend met wat er in de appelbak en het magazijn ligt.
// Per lijn: status 'ok' | 'apples' (te weinig appels) | 'full' (magazijn vol).
export function computeProduction(state, now = 0, steady = false) {
  const sp = 1;
  const supply = orchardRate(state) * sp;
  const transport = transportRate(state) * sp;
  const binCap = binCapacity(state);
  const storeCap = storeCapacity(state);
  const binFull = !steady && state.apples >= binCap * 0.995;
  const storeFull = !steady && state.goods >= storeCap * 0.995;
  // ligt er een voorraad appels, dan kunnen de lijnen op volle snelheid draaien
  let applesLeft = !steady && state.apples > 1 ? Infinity : supply;
  // is het magazijn vol, dan kan er alleen zoveel bij als de vrachtwagens weghalen
  // in de evenwichtsberekening begrenzen de vrachtwagens altijd wat er verkocht kan worden
  let outLeft = storeFull || steady ? transport : Infinity;
  const pm = priceMult(state);
  const lines = LINES.map(() => ({ rate: 0, max: 0, efficiency: 0, income: 0, status: 'off' }));
  let output = 0;
  let used = 0;
  let potential = 0;
  // 1) appels verdelen: duurste producten (per appel) eerst
  const want = [];
  for (const i of lineOrder) {
    const max = lineRate(state, i) * sp;
    if (max <= 0) continue;
    const l = LINES[i];
    const rate = Math.min(max, applesLeft / l.apples);
    applesLeft -= rate * l.apples;
    const v = lineValue(i, state.lines[i]);
    potential += rate * v;
    want.push({ i, max, rate, v, status: rate < max * 0.98 ? 'apples' : 'ok' });
  }
  // 2) kan het magazijn/vervoer het niet aan, dan krijgen alle lijnen naar verhouding minder ruimte
  const f = potential > outLeft ? outLeft / potential : 1;
  for (const w of want) {
    const l = LINES[w.i];
    const rate = w.rate * f;
    used += rate * l.apples;
    output += rate * w.v;
    lines[w.i] = { rate, max: w.max, potential: w.rate, efficiency: rate / w.max, income: rate * w.v * pm, status: f < 0.999 ? 'full' : w.status };
  }
  const sold = steady ? Math.min(output, transport) : (state.goods > 1 ? transport : Math.min(output, transport));
  const picking = binFull ? Math.min(supply, used) : supply;
  return {
    supply, picking, used, output, potential, transport, sold, binCap, storeCap, binFull, storeFull, lines,
    spare: Math.max(0, supply - used),
    income: sold * pm,
  };
}

// Capaciteit van de drie schakels, alles in appels per seconde:
// plukken, verwerken door de machines, en vervoeren door de vrachtwagens.
export function chainBalance(state) {
  const p = computeProduction(state, 0, true);
  let machines = 0;
  LINES.forEach((l, i) => { machines += lineRate(state, i) * l.apples; });
  let vpa = p.used > 0 ? p.output / p.used : 0;
  if (!vpa) {
    const i = state.lines.findIndex((x) => x > 0);
    vpa = i >= 0 ? LINES[i].value / LINES[i].apples : 1;
  }
  const out = { pick: p.supply, machines, transport: p.transport / vpa };
  out.weakest = machines <= 0 ? 'machines'
    : Object.entries({ pick: out.pick, machines: out.machines, transport: out.transport }).sort((a, b) => a[1] - b[1])[0][0];
  return out;
}

// Inkomen als alles in evenwicht is (voor offline-inkomen, beloningen en de balans-simulatie).
export function incomePerSecond(state, now = 0) {
  return computeProduction(state, now, true).income;
}

// ---- Kosten ----

function geomCost(base, growth, level, count) {
  // som van base * growth^(level-1) ... voor count levels vanaf huidig level
  const first = base * growth ** (level - 1);
  if (count === 1) return first;
  return first * (growth ** count - 1) / (growth - 1);
}

function maxAffordable(base, growth, level, money) {
  const first = base * growth ** (level - 1);
  if (money < first) return 0;
  return Math.floor(Math.log(money * (growth - 1) / first + 1) / Math.log(growth));
}

export function stationInfo(kind, i) {
  if (kind === 'orchard') return { base: ORCHARD.baseCost, growth: ORCHARD.growth };
  if (kind === 'sales') return { base: SALES.baseCost, growth: SALES.growth };
  return { base: LINES[i].cost, growth: LINE_GROWTH };
}

export function stationLevel(state, kind, i) {
  if (kind === 'orchard') return state.orchard;
  if (kind === 'sales') return state.sales;
  return state.lines[i];
}

// amount: 1, 10, of 'max'. Geeft { count, cost } terug.
export function upgradeQuote(state, kind, i, amount) {
  const { base, growth } = stationInfo(kind, i);
  const level = stationLevel(state, kind, i);
  if (amount === 'max') {
    const count = Math.max(1, maxAffordable(base, growth, level, state.money));
    return { count, cost: geomCost(base, growth, level, count) };
  }
  return { count: amount, cost: geomCost(base, growth, level, amount) };
}

export function buyUpgrade(state, kind, i, amount) {
  const q = upgradeQuote(state, kind, i, amount);
  if (q.cost > state.money) return false;
  state.money -= q.cost;
  if (kind === 'orchard') state.orchard += q.count;
  else if (kind === 'sales') state.sales += q.count;
  else state.lines[i] += q.count;
  return q;
}

export function lineUnlockable(state, i) {
  if (state.lines[i] > 0) return false;
  if (i > 0 && state.lines[i - 1] <= 0) return false;
  return i < TIERS[state.tier].slots;
}

export function buyLine(state, i) {
  if (!lineUnlockable(state, i) || state.money < LINES[i].unlock) return false;
  state.money -= LINES[i].unlock;
  state.lines[i] = 1;
  return true;
}

export function nextTier(state) {
  return state.tier + 1 < TIERS.length ? TIERS[state.tier + 1] : null;
}

export function buyTier(state) {
  const t = nextTier(state);
  if (!t || state.money < t.cost) return false;
  state.money -= t.cost;
  state.tier++;
  return true;
}

export function researchAvailable(state, r) {
  if (state.research[r.id]) return false;
  const li = LINES.findIndex((l) => l.id === r.req);
  return li < 0 || state.lines[li] > 0;
}

export function buyResearch(state, id) {
  const r = RESEARCH.find((x) => x.id === id);
  if (!r || !researchAvailable(state, r) || state.money < r.cost) return false;
  state.money -= r.cost;
  state.research[id] = true;
  return true;
}

// ---- Investeerders ----

export function investorsFor(earned) {
  return Math.floor(Math.sqrt(Math.max(0, earned) / INVESTOR_BASE));
}

// Investeerders die je erbij krijgt als je nu verkoopt.
export function pendingInvestors(state) {
  return Math.max(0, investorsFor(state.totalEarned) - investorsFor(state.totalEarned - state.runEarned) );
}

export function prestige(state) {
  const gain = pendingInvestors(state);
  if (gain <= 0) return 0;
  const fresh = newState();
  fresh.investors = state.investors + gain;
  fresh.prestiges = state.prestiges + 1;
  fresh.totalEarned = state.totalEarned;
  fresh.goal = state.goal;
  fresh.tutorial = state.tutorial;
  fresh.stats = state.stats;
  fresh.playTime = state.playTime;
  fresh.settings = state.settings;
  Object.keys(state).forEach((k) => { delete state[k]; });
  Object.assign(state, fresh);
  return gain;
}

// ---- Tijd ----

export function earn(state, amount) {
  state.money += amount;
  state.runEarned += amount;
  state.totalEarned += amount;
}

// Laat de keten dt seconden lopen, in kleine stapjes zodat appelbak en magazijn kloppen.
// Geld komt alleen binnen als een vrachtwagen met zijn lading vertrekt (verkocht).
// events (optioneel) krijgt per vertrek { truck, amount }.
export function tick(state, dt, now = 0, events = null) {
  ensureTrucks(state);
  const supply = orchardRate(state);
  const binCap = binCapacity(state);
  const storeCap = storeCapacity(state);
  const pm = priceMult(state);
  const cap = truckCapacity(state);
  const rates = LINES.map((_, i) => lineRate(state, i));
  const vals = LINES.map((_, i) => lineValue(i, state.lines[i]));
  const L = TRUCK.loadTime;
  let left = dt;
  let earned = 0;
  while (left > 1e-9) {
    const h = Math.min(left, 0.2);
    left -= h;
    state.apples = Math.min(binCap, state.apples + supply * h);
    // eerst appels verdelen, daarna de ruimte in het magazijn naar verhouding
    const space = storeCap - state.goods;
    let applesLeft = state.apples;
    let value = 0;
    const take = [];
    for (const i of lineOrder) {
      if (rates[i] <= 0) continue;
      const l = LINES[i];
      const n = Math.max(0, Math.min(rates[i] * h, applesLeft / l.apples));
      applesLeft -= n * l.apples;
      value += n * vals[i];
      take.push([i, n]);
    }
    const f = value > space ? Math.max(0, space) / value : 1;
    for (const [i, n] of take) {
      state.apples -= n * f * LINES[i].apples;
      state.goods += n * f * vals[i];
    }
    state.apples = Math.max(0, state.apples);
    state.trucks.forEach((tr, k) => {
      const t0 = tr.t;
      tr.t += h;
      if (t0 < L) {
        // laden aan de deur
        const take = Math.max(0, Math.min((cap * h) / L, state.goods, cap - tr.load));
        tr.load += take;
        state.goods -= take;
        if (tr.t >= L) {
          // nooit leeg vertrekken: wacht tot hij half vol is (of al 8 s met lading staat te wachten)
          tr.wait = (tr.wait || 0) + (tr.load > 0 ? tr.t - L : 0);
          if (tr.load <= 0 || (tr.load < cap * 0.5 && tr.wait < 8)) {
            tr.t = L - 1e-6;
          } else {
            // vertrek: de lading is verkocht
            const amount = tr.load * pm;
            earned += amount;
            tr.last = cap > 0 ? tr.load / cap : 0;
            if (events && amount > 0) events.push({ truck: k, amount });
            tr.load = 0;
            tr.wait = 0;
          }
        }
      }
      if (tr.t >= TRUCK.cycle) tr.t -= TRUCK.cycle;
    });
  }
  earn(state, earned);
  state.playTime += dt;
  return earned;
}
