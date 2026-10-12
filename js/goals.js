// Doelen die de speler stap voor stap door het spel leiden.
import { LINES, TIERS, UPGRADES } from './config.js';

const L = (i, level, min = 0) => ({ type: 'level', kind: 'line', i, level, min, text: `Upgrade ${LINES[i].name} naar level ${level}` });
const O = (level, min = 0) => ({ type: 'level', kind: 'orchard', level, min, text: `Upgrade de Boomgaard naar level ${level}` });
const S = (level, min = 0) => ({ type: 'level', kind: 'sales', level, min, text: `Upgrade het Vervoer naar level ${level}` });
const U = (i, min = 0) => ({ type: 'unlock', i, min, text: `Open de lijn ${LINES[i].name}` });
const T = (t, min = 0) => ({ type: 'tier', t, min, text: `Breid uit naar ${TIERS[t].name}` });
const I = (amount, min = 0) => ({ type: 'income', amount, min, text: `Verdien €${short(amount)} per seconde` });

function short(n) {
  const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return String(Math.round(n * 10) / 10).replace('.', ',') + u[i];
}

// Afgestemd op hoe ver je in een ronde komt (zie tools/balance-check.mjs).
export const GOALS = [
  { type: 'research', n: 1, min: 40, text: 'Koop je eerste upgrade' },
  L(0, 25, 50),
  U(1, 100),
  S(5, 200),
  L(1, 10, 300),
  { type: 'stat', stat: 'chain', n: 1, min: 300, text: 'Bekijk de ketenbalans' },
  O(10, 500),
  T(1, 1e3),
  U(2, 2e3),
  { type: 'stat', stat: 'golden', n: 1, min: 2e3, text: 'Tik op een gouden appel' },
  L(1, 50, 5e3),
  { type: 'research', n: 5, min: 1e4, text: 'Koop 5 upgrades' },
  { type: 'level', kind: 'sales', level: 10, min: 2e4, text: 'Vervoer naar level 10: twee pickups' },
  L(2, 50, 5e4),
  T(2, 1e5),
  U(3, 2e5),
  L(0, 100, 5e5),
  O(15, 1e6),
  L(3, 50, 1e6),
  T(3, 2e6),
  U(4, 3e6),
  { type: 'research', n: 12, min: 5e6, text: 'Koop 12 upgrades' },
  L(4, 100, 1e7),
  T(4, 2e7),
  U(5, 3e7),
  L(2, 150, 5e7),
  T(5, 1e8),
  U(6, 2e8),
  { type: 'prestige', n: 1, min: 0, text: 'Haal investeerders binnen' },
  O(20, 5e8),
  T(6, 1e9),
  U(7, 2e9),
  L(7, 100, 5e9),
  { type: 'research', n: 25, min: 1e10, text: 'Koop 25 upgrades' },
  T(7, 1e11),
  L(0, 250, 1e12),
  { type: 'research', n: UPGRADES.length, min: 1e13, text: 'Koop alle upgrades' },
  T(8, 1e14),
  T(9, 1e15),
  T(10, 1e16),
];

export function goalAt(index) {
  if (index < GOALS.length) return GOALS[index];
  // eindeloze doelen na de lijst
  const k = index - GOALS.length;
  return I(1e14 * 10 ** (k * 2), 0);
}

// Geeft { cur, max } voor de voortgangsbalk.
export function goalProgress(g, state, income) {
  switch (g.type) {
    case 'level': {
      const lv = g.kind === 'orchard' ? state.orchard : g.kind === 'sales' ? state.sales : state.lines[g.i];
      return { cur: Math.min(lv, g.level), max: g.level };
    }
    case 'unlock': return { cur: state.lines[g.i] > 0 ? 1 : 0, max: 1 };
    case 'tier': return { cur: Math.min(state.tier, g.t), max: g.t };
    case 'income': return { cur: Math.min(income, g.amount), max: g.amount };
    case 'research': return { cur: Math.min(Object.keys(state.research).length, g.n), max: g.n };
    case 'stat': return { cur: Math.min(state.stats[g.stat] || 0, g.n), max: g.n };
    case 'prestige': return { cur: Math.min(state.prestiges, g.n), max: g.n };
    default: return { cur: 0, max: 1 };
  }
}

// Beloning in seconden inkomen, naar hoe zwaar de taak is: een klein extraatje, geen jackpot.
const REWARD_SECONDS = { stat: 4, research: 6, level: 8, unlock: 10, income: 10, tier: 12, prestige: 0 };

export function goalReward(g, income) {
  return Math.max(g.min, income * (REWARD_SECONDS[g.type] ?? 8));
}
