// Doelen die de speler stap voor stap door het spel leiden.
import { LINES, TIERS, UPGRADES } from './config.js';

const L = (i, level, min = 0) => ({ type: 'level', kind: 'line', i, level, min, text: `Upgrade ${LINES[i].name} naar level ${level}` });
const O = (level, min = 0) => ({ type: 'level', kind: 'orchard', level, min, text: `Upgrade de Boomgaard naar level ${level}` });
const S = (level, min = 0) => ({ type: 'level', kind: 'sales', level, min, text: `Upgrade de Vrachtwagens naar level ${level}` });
const U = (i, min = 0) => ({ type: 'unlock', i, min, text: `Open de lijn ${LINES[i].name}` });
const T = (t, min = 0) => ({ type: 'tier', t, min, text: `Breid uit naar ${TIERS[t].name}` });
const I = (amount, min = 0) => ({ type: 'income', amount, min, text: `Verdien €${short(amount)} per seconde` });

function short(n) {
  const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return String(Math.round(n * 10) / 10).replace('.', ',') + u[i];
}

export const GOALS = [
  { type: 'research', n: 1, min: 40, text: 'Koop je eerste upgrade' },
  L(0, 25, 50),
  U(1, 100),
  S(10, 300),
  L(1, 10, 500),
  { type: 'stat', stat: 'chain', n: 1, min: 500, text: 'Bekijk de ketenbalans' },
  T(1, 1e3),
  U(2, 2e3),
  { type: 'stat', stat: 'golden', n: 1, min: 2e3, text: 'Tik op een gouden appel' },
  L(1, 25, 5e3),
  { type: 'research', n: 5, min: 1e4, text: 'Koop 5 upgrades' },
  O(15, 2e4),
  L(2, 25, 5e4),
  T(2, 1e5),
  U(3, 2e5),
  L(0, 50, 5e5),
  S(20, 1e6),
  L(3, 50, 2e6),
  T(3, 5e6),
  U(4, 1e7),
  { type: 'research', n: 12, min: 2e7, text: 'Koop 12 upgrades' },
  L(4, 50, 5e7),
  T(4, 1e8),
  U(5, 2e8),
  L(2, 100, 5e8),
  O(25, 1e9),
  T(5, 2e9),
  U(6, 5e9),
  { type: 'prestige', n: 1, min: 0, text: 'Haal investeerders binnen' },
  T(6, 1e10),
  U(7, 2e10),
  L(7, 50, 5e10),
  S(30, 1e11),
  T(7, 1e12),
  { type: 'research', n: UPGRADES.length, min: 1e13, text: 'Koop alle upgrades' },
  T(8, 1e14),
  T(9, 1e16),
  T(10, 1e18),
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

export function goalReward(g, income) {
  return Math.max(g.min, income * 30);
}
