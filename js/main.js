import * as E from './economy.js';
import { World } from './world.js';
import { UI } from './ui.js';
import { sfx, setSound } from './audio.js';
import { LINES, TIERS, BOOST, GOLDEN, OFFLINE, INVESTOR_BONUS } from './config.js';
import { goalAt, goalProgress, goalReward } from './goals.js';
import { money, fmt } from './format.js';

const SAVE_KEY = 'appeltycoon.save.v1';

function migrate(d) {
  const base = E.newState();
  const s = { ...base, ...d };
  s.settings = { ...base.settings, ...(d.settings || {}) };
  s.stats = { ...base.stats, ...(d.stats || {}) };
  s.research = d.research || {};
  s.lines = LINES.map((_, i) => (Array.isArray(d.lines) && Number.isFinite(d.lines[i]) ? d.lines[i] : base.lines[i]));
  for (const k of ['money', 'runEarned', 'totalEarned', 'investors', 'orchard', 'sales', 'tier']) {
    if (!Number.isFinite(s[k])) s[k] = base[k];
  }
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('Opslag kon niet geladen worden', e);
  }
  return null;
}

const loaded = load();
const state = loaded || E.newState();
const firstVisit = !loaded;
if (state.settings.quality === 'auto') {
  state.settings.quality = window.matchMedia('(pointer: coarse)').matches ? 'low' : 'high';
}
setSound(state.settings.sound);

const game = {
  state,
  prod: E.computeProduction(state, Date.now()),
  pendingOffline: 0,
  nextGolden: GOLDEN.minDelay * 0.5,
  goldenLeft: 0,

  save() {
    try {
      state.lastTick = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Opslaan mislukt', e);
    }
  },

  upgrade(kind, i, amount) {
    const st = kind === 'line' ? { kind, i } : { kind };
    const before = E.stationLevel(state, kind, i);
    const q = E.buyUpgrade(state, kind, i, amount);
    if (!q) { sfx.error(); return false; }
    state.stats.upgrades += q.count;
    const after = E.stationLevel(state, kind, i);
    if (E.milestoneCount(after) > E.milestoneCount(before) && kind !== 'sales') {
      sfx.milestone();
      ui.toast(`Mijlpaal! ${kind === 'orchard' ? 'Boomgaard' : LINES[i].name} produceert x2`, '🏅');
      world.burst(world.stationPos(st).setY(3), 60);
    } else sfx.buy();
    world.bounceStation(st);
    return true;
  },

  unlockLine(i) {
    if (!E.buyLine(state, i)) { sfx.error(); return false; }
    sfx.unlock();
    ui.toast(`Nieuwe productielijn: ${LINES[i].name}!`, LINES[i].icon);
    world.focus({ kind: 'line', i });
    setTimeout(() => world.bounceStation({ kind: 'line', i }), 50);
    ui.open('station', { kind: 'line', i });
    return true;
  },

  buyTier() {
    if (!E.buyTier(state)) { sfx.error(); return false; }
    sfx.unlock();
    ui.toast(`Uitgebreid naar ${TIERS[state.tier].name}!`, '🏗️');
    setTimeout(() => {
      world.burst(world.target.clone().setY(3), 120);
    }, 60);
    return true;
  },

  buyResearch(id) {
    if (!E.buyResearch(state, id)) { sfx.error(); return false; }
    sfx.unlock();
    ui.toast('Onderzoek voltooid!', '🔬');
    return true;
  },

  doPrestige() {
    const gain = E.prestige(state);
    if (!gain) return;
    sfx.prestige();
    ui.close();
    ui.toast(`+${fmt(gain)} investeerders! Inkomen +${fmt(state.investors * INVESTOR_BONUS * 100)}%`, '⭐');
    world.target.set(6, 0, 3);
    world.viewSize = 34;
    this.save();
  },

  boost() {
    const now = Date.now();
    if (now < state.boostReadyAt) { sfx.error(); return; }
    state.boostUntil = now + BOOST.duration * 1000;
    state.boostReadyAt = state.boostUntil + BOOST.cooldown * 1000;
    state.stats.boosts++;
    sfx.boost();
    ui.toast(`Turbo! Alles ${BOOST.mult}x zo snel`, '⚡');
  },

  claimGoal() {
    const g = goalAt(state.goal);
    const p = goalProgress(g, state, this.prod.income);
    if (p.cur < p.max) return;
    const reward = goalReward(g, this.prod.income);
    E.earn(state, reward);
    state.goal++;
    sfx.coin();
    ui.toast(`Doel gehaald! +${money(reward)}`, '🎯');
  },

  tapStation(st) {
    if (!st) { ui.close(); return; }
    if (st.kind === 'golden') { this.collectGolden(); return; }
    sfx.click();
    ui.openStation(st);
  },

  collectGolden() {
    if (!world.golden.visible) return;
    const reward = Math.max(GOLDEN.minReward, this.prod.income * GOLDEN.incomeSeconds);
    E.earn(state, reward);
    state.stats.golden++;
    sfx.coin();
    const p = world.toScreen(world.golden.position);
    ui.float(p.x, p.y, '+' + money(reward), 'gold');
    ui.toast(`Gouden appel! +${money(reward)}`, '🍏');
    world.burst(world.golden.position.clone(), 50);
    world.showGolden(false);
    this.goldenLeft = 0;
    this.nextGolden = GOLDEN.minDelay + Math.random() * (GOLDEN.maxDelay - GOLDEN.minDelay);
  },

  setSound(on) {
    state.settings.sound = on;
    setSound(on);
    if (on) sfx.click();
  },

  setQuality(q) {
    state.settings.quality = q;
    world.setQuality(q);
  },

  hardReset() {
    localStorage.removeItem(SAVE_KEY);
    window.removeEventListener('pagehide', onHide);
    location.reload();
  },

  claimOffline() {
    E.earn(state, this.pendingOffline);
    if (this.pendingOffline > 0) sfx.coin();
    this.pendingOffline = 0;
  },
};

// ---------- Opstarten ----------

let world;
try {
  world = new World(document.getElementById('scene'), {
    quality: state.settings.quality,
    onTap: (st) => game.tapStation(st),
  });
} catch (e) {
  document.getElementById('loading').innerHTML = '<div class="logo">🍎</div><div>Je browser ondersteunt geen WebGL.</div><small>Probeer een andere browser.</small>';
  throw e;
}
game.world = world;
const ui = new UI(game);
game.ui = ui;

function handleGap(gap) {
  const secs = Math.min(gap, OFFLINE.maxHours * 3600);
  const amount = E.incomePerSecond(state, 0) * secs * OFFLINE.rate;
  if (amount <= 0) return;
  game.pendingOffline += amount;
  ui.offline(game.pendingOffline, gap);
}

const gap0 = (Date.now() - state.lastTick) / 1000;
state.lastTick = Date.now();
if (!firstVisit && gap0 > 30) handleGap(gap0);
if (firstVisit) ui.welcome();

let lastFrame = performance.now();
function frame(t) {
  const dt = Math.min(0.1, (t - lastFrame) / 1000);
  lastFrame = t;
  const now = Date.now();
  const gap = (now - state.lastTick) / 1000;
  state.lastTick = now;
  if (gap > 30) handleGap(gap);
  else if (gap > 0) E.tick(state, gap, now);

  game.prod = E.computeProduction(state, now);
  world.sync(state, game.prod);

  // gouden appel
  if (world.golden.visible) {
    game.goldenLeft -= dt;
    if (game.goldenLeft <= 0) {
      world.showGolden(false);
      game.nextGolden = GOLDEN.minDelay + Math.random() * (GOLDEN.maxDelay - GOLDEN.minDelay);
    }
  } else {
    game.nextGolden -= dt;
    if (game.nextGolden <= 0) {
      world.showGolden(true);
      game.goldenLeft = GOLDEN.lifetime;
    }
  }

  world.update(dt);
  ui.update(t);
  requestAnimationFrame(frame);
}

requestAnimationFrame((t) => {
  lastFrame = t;
  document.getElementById('loading').classList.add('gone');
  frame(t);
});

setInterval(() => game.save(), 5000);
function onHide() { game.save(); }
window.addEventListener('pagehide', onHide);
document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });

// voor debuggen in de console
window.appelTycoon = game;
