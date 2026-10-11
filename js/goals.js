// Doelen die de speler stap voor stap door het spel leiden.
import { LINES, TIERS } from './config.js';

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
  L(0, 10, 30),
  O(10, 40),
  S(5, 50),
  U(1, 100),
  L(1, 10, 200),
  { type: 'stat', stat: 'boosts', n: 1, min: 150, text: 'Activeer de Turbo' },
  T(1, 400),
  U(2, 600),
  { type: 'research', n: 1, min: 500, text: 'Koop je eerste onderzoek' },
  L(0, 25, 800),
  { type: 'stat', stat: 'golden', n: 1, min: 800, text: 'Tik op een gouden appel' },
  O(25, 1000),
  S(25, 1500),
  T(2, 4e3),
  U(3, 6e3),
  I(1e3, 1e4),
  L(1, 50, 2e4),
  T(3, 1e5),
  U(4, 2e5),
  O(50, 3e5),
  I(3e4, 5e5),
  T(4, 2e6),
  U(5, 3e6),
  S(50, 5e6),
  I(1e6, 1e7),
  T(5, 5e7),
  U(6, 8e7),
  { type: 'prestige', n: 1, min: 0, text: 'Haal investeerders binnen' },
  T(6, 2e9),
  U(7, 4e9),
  L(7, 25, 1e10),
  O(100, 2e10),
  T(7, 1e12),
  I(1e10, 5e12),
  T(8, 5e14),
  { type: 'research', n: 22, min: 1e15, text: 'Koop alle onderzoeken' },
  T(9, 2e17),
  T(10, 2e20),
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
