// Pure spellogica zonder DOM of 3D, zodat de balans-simulatie dezelfde code gebruikt.
import {
  STARS, ORCHARD, SALES, LINES, LINE_GROWTH, TIERS, START_MONEY,
  UPGRADES, INVESTOR_BONUS, INVESTOR_BASE, INVESTOR_POWER, DOCK_LEVELS, PICKER_LEVELS, TRUCK, VEHICLES, STAFF,
} from './config.js';

export const SAVE_VERSION = 7;

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
    goods: 0,            // kratten in het magazijn
    goodsValue: 0,       // waarde van die kratten (zonder prijsbonussen)
    trucks: [],          // per vrachtwagen: t = seconden in de rit, load = kratten, value = waarde, last = vorige lading (deel van vol)
    research: {},        // gekochte upgrades (id -> true)
    goal: 0,
    tutorial: 0,
    stats: { golden: 0, upgrades: 0, maxTier: 0 },
    staff: { points: 0, hired: {} },   // kantoor: punten en gehuurde werknemers (blijven bij investeerders)
    playTime: 0,
    lastTick: Date.now(),
    settings: { sound: true, music: true, quality: 'auto' },
  };
}

// sterren liggen op level 10 en daarna elke 25 levels (zie STARS); snel uitgerekend
export function starCount(level) {
  if (level < STARS[0]) return 0;
  return Math.min(STARS.length, 1 + Math.floor(level / 25));
}

export function prevStar(level) {
  let p = 1;
  for (const m of STARS) if (level >= m) p = m;
  return p;
}

export function nextStar(level) {
  for (const m of STARS) if (level < m) return m;
  return null;
}

// Wat een ster oplevert. Lijnen: om en om snelheid x2 (eerste ster) en prijs x2, zodat oude lijnen
// waardevol blijven zonder enorme hoeveelheden appels te vragen.
// Boomgaard: een extra plukker (alleen te zien). Vrachtwagens: een extra laadplek met vrachtwagen.
export function starReward(kind, starLevel = STARS[0]) {
  if (kind === 'orchard') return { type: 'picker', text: 'Extra plukker' };
  if (kind === 'sales') {
    const lv = starLevel || DOCK_LEVELS[0];
    return { type: 'truck', text: `${truckCount(lv)} ${vehicle(lv).plural}` };
  }
  return STARS.indexOf(starLevel) % 2 === 0 ? { type: 'speed', text: 'Snelheid x2' } : { type: 'price', text: 'Prijs x2' };
}

// aantal sterren met snelheid x2 en met prijs x2 voor een lijn
export function lineStars(level) {
  const n = starCount(level);
  return { speed: Math.ceil(n / 2), price: Math.floor(n / 2) };
}

// Vermenigvuldiger uit gekochte upgrades voor een doel ('fresh', 'orchard', 'transport', 'all') en type.
export function upgradeMult(state, target, type = 'price') {
  let m = 1;
  for (const u of UPGRADES) if (state.research[u.id] && u.target === target && u.type === type) m *= u.mult;
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
  return orchardBase(state, level) * staffMult(state, 'orchard', 0, 'speed');
}

function orchardBase(state, level = state.orchard) {
  return ORCHARD.baseRate * ORCHARD.levelGrowth ** (level - 1) * tierOrchardMult(state) * upgradeMult(state, 'orchard', 'speed');
}

// Prijs van één product (zonder de algemene prijsbonussen van uitbreidingen, reclame en investeerders).
// Elk level telt de basisprijs erbij op; prijs-sterren en prijs-upgrades vermenigvuldigen.
export function lineValue(state, i, level = state.lines[i]) {
  const L = Math.max(1, level);
  return LINES[i].value * L * 2 ** lineStars(L).price * upgradeMult(state, LINES[i].id, 'price') * staffMult(state, 'line', i, 'price');
}

// Stuks per seconde van een lijn: alleen sterren en upgrades maken een machine sneller.
export function lineRate(state, i, level = state.lines[i]) {
  if (level <= 0) return 0;
  return LINES[i].rate * 2 ** lineStars(level).speed * upgradeMult(state, LINES[i].id, 'speed') * staffMult(state, 'line', i, 'speed');
}

// Hoeveel kratten per seconde de vrachtwagens wegbrengen.
export function transportRate(state, level = state.sales) {
  return transportBase(state, level) * staffMult(state, 'sales', 0, 'speed');
}

function transportBase(state, level = state.sales) {
  return SALES.baseRate * SALES.levelGrowth ** (level - 1) * truckCount(level) * (SALES.tierBoost ? tierOrchardMult(state) : 1) * upgradeMult(state, 'transport', 'speed');
}

export function binCapacity(state, level = state.orchard) {
  return Math.max(ORCHARD.binMin, orchardBase(state, level) * ORCHARD.binSeconds);
}

export function storeCapacity(state, level = state.sales) {
  return Math.max(SALES.storeMin, transportBase(state, level) * SALES.storeSeconds);
}

// Prijsvermenigvuldiger: onderzoek, uitbreidingen en investeerders.
export function priceMult(state) {
  return upgradeMult(state, 'all', 'price') * tierIncomeMult(state) * investorMult(state);
}

// Aantal laadplekken (en vrachtwagens) bij een level.
export function truckCount(level) {
  return 1 + DOCK_LEVELS.filter((l) => level >= l).length;
}

// Welk voertuig er rijdt: scooter, pickup, bestelbus, vrachtwagen of grote truck.
export function vehicleStage(level) {
  return Math.min(VEHICLES.length - 1, truckCount(level) - 1);
}

export function vehicle(level) {
  return VEHICLES[vehicleStage(level)];
}

export function pickerCount(level) {
  return 1 + PICKER_LEVELS.filter((l) => level >= l).length;
}

export function pickerLevel(level) {
  return PICKER_LEVELS.find((l) => level < l) || null;
}

// Hoeveel kratten één vrachtwagen per rit meeneemt.
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

// Vaste volgorde van de lijnen (duurste per appel eerst); de appels zelf worden naar verhouding verdeeld.
function lineOrder(state) {
  const idx = LINES.map((l, i) => i).filter((i) => state.lines[i] > 0);
  const v = idx.map((i) => lineValue(state, i) / LINES[i].apples);
  return idx.map((i, k) => [i, v[k]]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}

// Huidige stroom door de keten, rekening houdend met wat er in de appelbak en het magazijn ligt.
// Per lijn: status 'ok' | 'apples' (te weinig appels) | 'full' (magazijn vol).
// Alles in stuks (kratten); income in euro per seconde.
export function computeProduction(state, now = 0, steady = false) {
  const supply = orchardRate(state);
  const transport = transportRate(state);
  const binCap = binCapacity(state);
  const storeCap = storeCapacity(state);
  const binFull = !steady && state.apples >= binCap * 0.995;
  const storeFull = !steady && state.goods >= storeCap * 0.95;
  // ligt er een voorraad appels, dan kunnen de lijnen op volle snelheid draaien
  let applesLeft = !steady && state.apples > 1 ? Infinity : supply;
  // is het magazijn vol, dan kan er alleen zoveel bij als de vrachtwagens weghalen
  // in de evenwichtsberekening begrenzen de vrachtwagens altijd wat er verkocht kan worden
  const outLeft = storeFull || steady ? transport : Infinity;
  const pm = priceMult(state);
  const lines = LINES.map(() => ({ rate: 0, max: 0, potential: 0, efficiency: 0, income: 0, price: 0, status: 'off' }));
  let output = 0;
  let value = 0;
  let used = 0;
  let potential = 0;
  let potentialValue = 0;
  // 1) appels verdelen: is er te weinig, dan krijgt elke machine naar verhouding minder
  //    (zo valt er nooit één machine helemaal stil en verdienen ze allemaal mee)
  let demand = 0;
  for (const i of lineOrder(state)) demand += lineRate(state, i) * LINES[i].apples;
  const share = demand > 0 ? Math.min(1, applesLeft / demand) : 1;
  const want = [];
  for (const i of lineOrder(state)) {
    const max = lineRate(state, i);
    if (max <= 0) continue;
    const rate = max * share;
    const v = lineValue(state, i);
    potential += rate;
    potentialValue += rate * v;
    want.push({ i, max, rate, v, status: share < 0.98 ? 'apples' : 'ok' });
  }
  // 2) kan het magazijn/vervoer het niet aan, dan krijgen alle lijnen naar verhouding minder ruimte
  const f = potential > outLeft ? outLeft / potential : 1;
  for (const w of want) {
    const l = LINES[w.i];
    const rate = w.rate * f;
    used += rate * l.apples;
    output += rate;
    value += rate * w.v;
    lines[w.i] = { rate, max: w.max, potential: w.rate, efficiency: rate / w.max, income: rate * w.v * pm, price: w.v * pm, status: f < 0.999 ? 'full' : w.status };
  }
  const sold = steady ? Math.min(output, transport) : (state.goods > 1 ? transport : Math.min(output, transport));
  const picking = binFull ? Math.min(supply, used) : supply;
  return {
    supply, picking, used, output, potential, transport, sold, binCap, storeCap, binFull, storeFull, lines,
    spare: Math.max(0, supply - used),
    potentialIncome: potentialValue * pm,
    income: value * pm,
  };
}

// Is een boomgaard- of vervoerupgrade nu (of bijna) nodig? Alleen dan krijgt hij een pijltje,
// zodat je geen geld steekt in capaciteit die toch niet gebruikt wordt.
export function chainNeed(state, kind) {
  let pieces = 0, apples = 0;
  LINES.forEach((l, i) => { const r = lineRate(state, i); pieces += r; apples += r * l.apples; });
  if (kind === 'sales') return transportRate(state) < pieces * 1.15;
  if (kind === 'orchard') return orchardRate(state) < apples * 1.15;
  return true;
}

// Capaciteit van de drie schakels, alles in appels per seconde:
// plukken, verwerken door de machines, en vervoeren door de vrachtwagens.
export function chainBalance(state) {
  const p = computeProduction(state, 0, true);
  let machines = 0;
  let pieces = 0;
  LINES.forEach((l, i) => { const r = lineRate(state, i); machines += r * l.apples; pieces += r; });
  // appels per krat: gemiddelde van wat er nu gemaakt wordt
  const apk = p.output > 0 ? p.used / p.output : pieces > 0 ? machines / pieces : 1;
  const out = { pick: p.supply, machines, transport: p.transport * apk };
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

// Boomgaard en vrachtwagens worden per uitbreiding duurder (maar ook productiever), zodat ze
// met je fabriek meegroeien zonder dat één level onbetaalbaar duur wordt.
export function chainCostMult(state) {
  let m = 1;
  for (let t = 0; t <= state.tier; t++) m *= TIERS[t].chain || 1;
  return m;
}

export function stationInfo(kind, i, state = null) {
  const cm = state ? chainCostMult(state) : 1;
  if (kind === 'orchard') return { base: ORCHARD.baseCost * cm, growth: ORCHARD.growth };
  if (kind === 'sales') return { base: SALES.baseCost * cm, growth: SALES.growth };
  return { base: LINES[i].cost, growth: LINES[i].growth || LINE_GROWTH };
}

export function stationLevel(state, kind, i) {
  if (kind === 'orchard') return state.orchard;
  if (kind === 'sales') return state.sales;
  return state.lines[i];
}

// amount: 1, 10, of 'max'. Geeft { count, cost } terug.
export function upgradeQuote(state, kind, i, amount) {
  const { base, growth } = stationInfo(kind, i, state);
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
  ensureStaff(state);
  state.staff.points++;
  state.stats.linesOpened = (state.stats.linesOpened || 0) + 1;
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
  state.stats.maxTier = Math.max(state.stats.maxTier || 0, state.tier);
  return true;
}

export function upgradeAvailable(state, u) {
  if (state.research[u.id]) return false;
  const li = LINES.findIndex((l) => l.id === u.req);
  return li < 0 || state.lines[li] > 0;
}

export function buyUpgradeItem(state, id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || !upgradeAvailable(state, u) || state.money < u.cost) return false;
  state.money -= u.cost;
  state.research[id] = true;
  return true;
}

// ---- Investeerders ----

// Investeerders groeien met (verdiend)^INVESTOR_POWER: steeds meer verdienen levert steeds minder
// extra investeerders op, zodat rondes niet uit de hand lopen.
export function investorsFor(earned) {
  return Math.floor((Math.max(0, earned) / INVESTOR_BASE) ** INVESTOR_POWER);
}

// Hoeveel je in totaal verdiend moet hebben voor n investeerders.
export function earningsForInvestors(n) {
  return n ** (1 / INVESTOR_POWER) * INVESTOR_BASE;
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
  // werknemers en punten blijven; ze gaan terug naar het kantoor (de machines zijn weg)
  fresh.staff = ensureStaff(state);
  for (const r of Object.values(fresh.staff.hired)) r.at = null;
  Object.keys(state).forEach((k) => { delete state[k]; });
  Object.assign(state, fresh);
  return gain;
}

// ---- Kantoor: superwerknemers ----

export function ensureStaff(state) {
  if (!state.staff || typeof state.staff !== 'object') state.staff = { points: 0, hired: {} };
  if (!Number.isFinite(state.staff.points)) state.staff.points = 0;
  if (!state.staff.hired || typeof state.staff.hired !== 'object') state.staff.hired = {};
  return state.staff;
}

export const staffDef = (id) => STAFF.list.find((e) => e.id === id);
const sameStation = (a, kind, i) => a && a.kind === kind && (kind !== 'line' || a.i === i);

// 'active' (aan het werk), 'rest' (pauze) of 'ready' (wacht tot je hem aantikt)
export function staffStatus(rec, now = Date.now()) {
  if (now < rec.until) return 'active';
  if (now < rec.rest) return 'rest';
  return 'ready';
}

// Werknemer (id) die bij dit station staat, of null.
export function staffAt(state, kind, i = 0) {
  const h = state.staff && state.staff.hired;
  if (!h) return null;
  for (const id in h) if (sameStation(h[id].at, kind, i)) return id;
  return null;
}

// Vermenigvuldiger van een werknemer die nu aan het werk is bij dit station.
export function staffMult(state, kind, i, type) {
  const h = state.staff && state.staff.hired;
  if (!h) return 1;
  for (const id in h) {
    const r = h[id];
    if (!sameStation(r.at, kind, i) || !(Date.now() < r.until)) continue;
    const e = staffDef(id);
    return (e && e[type]) || 1;
  }
  return 1;
}

// Is de werknemer zichtbaar in het kantoor (ooit die uitbreiding bereikt)?
export function staffUnlocked(state, e) {
  return Math.max(state.tier, (state.stats && state.stats.maxTier) || 0) >= e.tier;
}

// Prijs-werknemers werken alleen bij machines; snelheid kan ook bij de boomgaard en het vervoer.
export function staffCanWork(e, st) {
  if (st.kind === 'line') return true;
  return !!e.speed && !e.price && (st.kind === 'orchard' || st.kind === 'sales');
}

export function hireStaff(state, id) {
  const st = ensureStaff(state);
  const e = staffDef(id);
  if (!e || st.hired[id] || !staffUnlocked(state, e) || st.points < e.cost) return false;
  st.points -= e.cost;
  st.hired[id] = { at: null, until: 0, rest: 0 };
  return true;
}

// Zet een werknemer bij een station. Staat daar al iemand, dan gaat die terug naar het kantoor.
// Is hij uitgerust, dan begint hij meteen.
export function placeStaff(state, id, at, now = Date.now()) {
  const st = ensureStaff(state);
  const r = st.hired[id];
  const e = staffDef(id);
  if (!r || !e || !at || !staffCanWork(e, at)) return false;
  if (at.kind === 'line' && !(state.lines[at.i] > 0)) return false;
  const other = staffAt(state, at.kind, at.i || 0);
  if (other && other !== id) st.hired[other].at = null;
  r.at = at.kind === 'line' ? { kind: 'line', i: at.i } : { kind: at.kind };
  if (staffStatus(r, now) === 'ready') activateStaff(state, id, now);
  return true;
}

export function unplaceStaff(state, id) {
  const r = ensureStaff(state).hired[id];
  if (r) r.at = null;
}

export function activateStaff(state, id, now = Date.now()) {
  const r = ensureStaff(state).hired[id];
  if (!r || !r.at || staffStatus(r, now) !== 'ready') return false;
  r.until = now + STAFF.active * 1000;
  r.rest = r.until + STAFF.rest * 1000;
  return true;
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
  if (!Number.isFinite(state.goodsValue)) state.goodsValue = 0;
  const supply = orchardRate(state);
  const binCap = binCapacity(state);
  const storeCap = storeCapacity(state);
  const pm = priceMult(state);
  const cap = truckCapacity(state);
  const order = lineOrder(state);
  const rates = LINES.map((_, i) => lineRate(state, i));
  const vals = LINES.map((_, i) => (state.lines[i] > 0 ? lineValue(state, i) : 0));
  const L = TRUCK.loadTime;
  let left = dt;
  let earned = 0;
  while (left > 1e-9) {
    const h = Math.min(left, 0.2);
    left -= h;
    state.apples = Math.min(binCap, state.apples + supply * h);
    // eerst appels verdelen, daarna de ruimte in het magazijn naar verhouding
    const space = storeCap - state.goods;
    let need = 0;
    for (const i of order) need += rates[i] * h * LINES[i].apples;
    const share = need > 0 ? Math.min(1, state.apples / need) : 1;
    let pieces = 0;
    const take = [];
    for (const i of order) {
      const n = rates[i] * h * share;
      pieces += n;
      take.push([i, n]);
    }
    const f = pieces > space ? Math.max(0, space) / pieces : 1;
    for (const [i, n] of take) {
      state.apples -= n * f * LINES[i].apples;
      state.goods += n * f;
      state.goodsValue += n * f * vals[i];
    }
    state.apples = Math.max(0, state.apples);
    state.trucks.forEach((tr, k) => {
      const t0 = tr.t;
      tr.t += h;
      if (t0 < L) {
        // laden aan de deur; elke krat neemt zijn deel van de waarde mee
        const take = Math.max(0, Math.min((cap * h) / L, state.goods, cap - tr.load));
        if (take > 0) {
          const v = state.goods > 0 ? state.goodsValue * (take / state.goods) : 0;
          tr.value = (tr.value || 0) + v;
          state.goodsValue = Math.max(0, state.goodsValue - v);
        }
        tr.load += take;
        state.goods -= take;
        if (state.goods <= 1e-9) { state.goods = 0; state.goodsValue = 0; }
        if (tr.t >= L) {
          // nooit leeg vertrekken: wacht tot hij half vol is (of al 4 s met lading staat te wachten)
          tr.wait = (tr.wait || 0) + (tr.load > 0 ? tr.t - L : 0);
          if (tr.load <= 0 || (tr.load < cap * 0.5 && tr.wait < 4)) {
            tr.t = L - 1e-6;
          } else {
            // vertrek: de lading is verkocht
            const amount = (tr.value || 0) * pm;
            earned += amount;
            tr.last = cap > 0 ? tr.load / cap : 0;
            if (events && amount > 0) events.push({ truck: k, amount });
            tr.load = 0;
            tr.value = 0;
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
