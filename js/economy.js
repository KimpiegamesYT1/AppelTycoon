// Pure spellogica zonder DOM of 3D, zodat de balans-simulatie dezelfde code gebruikt.
import {
  MILESTONES, RAW_APPLE_PRICE, ORCHARD, SALES, LINES, LINE_GROWTH, TIERS,
  RESEARCH, INVESTOR_BONUS, INVESTOR_BASE, BOOST,
} from './config.js';

export const SAVE_VERSION = 1;

export function newState() {
  return {
    version: SAVE_VERSION,
    money: 0,
    runEarned: 0,        // verdiend sinds laatste investeerdersronde
    totalEarned: 0,      // verdiend over alle rondes
    investors: 0,
    prestiges: 0,
    tier: 0,
    orchard: 1,
    sales: 1,
    lines: LINES.map((_, i) => (i === 0 ? 1 : 0)),   // 0 = op slot
    research: {},
    boostUntil: 0,
    boostReadyAt: 0,
    goal: 0,
    stats: { boosts: 0, golden: 0, upgrades: 0 },
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

export function isBoosted(state, now) {
  return now < state.boostUntil;
}

export function orchardRate(state, level = state.orchard) {
  return ORCHARD.baseRate * level * milestoneMult(level) * tierOrchardMult(state) * researchMult(state, 'orchard');
}

export function lineRate(state, i, level = state.lines[i]) {
  if (level <= 0) return 0;
  return LINES[i].rate * level * milestoneMult(level) * researchMult(state, LINES[i].id);
}

export function salesMult(state, level = state.sales) {
  return 1 + SALES.perLevel * (level - 1);
}

export function priceMult(state, now = 0) {
  return salesMult(state) * researchMult(state, 'all') * tierIncomeMult(state) * investorMult(state)
    * (isBoosted(state, now) ? BOOST.mult : 1);
}

// Verdeelt de appels over de lijnen: duurste producten (per appel) eerst.
const lineOrder = LINES.map((l, i) => i).sort((a, b) => LINES[b].value / LINES[b].apples - LINES[a].value / LINES[a].apples);

export function computeProduction(state, now = 0) {
  const speed = isBoosted(state, now) ? BOOST.mult : 1;
  const supply = orchardRate(state) * speed;
  let left = supply;
  const lines = LINES.map(() => ({ rate: 0, max: 0, efficiency: 0, income: 0 }));
  const pm = priceMult(state, now) / (isBoosted(state, now) ? BOOST.mult : 1);
  for (const i of lineOrder) {
    const max = lineRate(state, i) * speed;
    if (max <= 0) continue;
    const need = max * LINES[i].apples;
    const got = Math.min(need, left);
    left -= got;
    const rate = got / LINES[i].apples;
    lines[i] = { rate, max, efficiency: rate / max, income: rate * LINES[i].value * pm };
  }
  const rawIncome = left * RAW_APPLE_PRICE * investorMult(state);
  const income = lines.reduce((s, l) => s + l.income, 0) + rawIncome;
  return { supply, demand: supply - left, spare: left, lines, rawIncome, income };
}

export function incomePerSecond(state, now = 0) {
  return computeProduction(state, now).income;
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

export function tick(state, dt, now = 0) {
  const inc = incomePerSecond(state, now);
  earn(state, inc * dt);
  state.playTime += dt;
  return inc;
}
