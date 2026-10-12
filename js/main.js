import * as E from './economy.js';
import { World } from './world.js';
import { UI } from './ui.js';
import { sfx, setSound, initMusic, setMusic } from './audio.js';
import { glyph } from './icons.js';
import { TUTORIAL } from './tutorial.js';
import { LINES, TIERS, GOLDEN, OFFLINE, INVESTOR_BONUS, UPGRADES, PICKER_LEVELS, DOCK_LEVELS } from './config.js';
import { goalAt, goalProgress, goalReward } from './goals.js';
import { money, fmt } from './format.js';

const SAVE_KEY = 'appeltycoon.save.v1';

function migrate(d) {
  const base = E.newState();
  // versie 2 had een andere economie (zonder sterren): nieuwe ronde, maar investeerders en statistieken blijven
  if (d.version === 2) {
    base.settings = { ...base.settings, ...(d.settings || {}) };
    for (const k of ['investors', 'prestiges', 'totalEarned', 'playTime']) if (Number.isFinite(d[k])) base[k] = d[k];
    base.stats = { ...base.stats, ...(d.stats || {}) };
    base.upgradedFrom = 2;
    return base;
  }
  // versie 1 had een heel andere economie: begin opnieuw, maar houd de instellingen (muziek weer aan)
  if (d.version !== E.SAVE_VERSION) {
    base.settings = { ...base.settings, ...(d.settings || {}), music: true };
    base.migrated = true;
    return base;
  }
  const s = { ...base, ...d };
  s.settings = { ...base.settings, ...(d.settings || {}) };
  s.stats = { ...base.stats, ...(d.stats || {}) };
  s.research = d.research || {};
  s.lines = LINES.map((_, i) => (Array.isArray(d.lines) && Number.isFinite(d.lines[i]) ? d.lines[i] : base.lines[i]));
  if (!Array.isArray(s.trucks)) s.trucks = [];
  for (const k of ['money', 'runEarned', 'totalEarned', 'investors', 'orchard', 'sales', 'tier', 'apples', 'goods', 'goodsValue', 'tutorial']) {
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
const firstVisit = !loaded || state.migrated;
const upgradedFrom = state.upgradedFrom;
delete state.migrated;
delete state.upgradedFrom;
// standaard scherp; alleen als de speler zelf Laag kiest blijft dat bewaard
if (state.settings.quality === 'auto' || !state.settings.qualityChosen) state.settings.quality = 'high';
setSound(state.settings.sound);
initMusic('assets/audio/factory-flow.mp3?v=' + (window.APP_VERSION || ''), state.settings.music);

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
    const priceBefore = kind === 'line' ? E.lineValue(state, i) * E.priceMult(state) : 0;
    const q = E.buyUpgrade(state, kind, i, amount);
    if (!q) { sfx.error(); return false; }
    state.stats.upgrades += q.count;
    const after = E.stationLevel(state, kind, i);
    // een ster: lijnen worden twee keer zo snel, de boomgaard krijgt een plukker, de vrachtwagens een laadplek
    const marks = kind === 'line' ? null : kind === 'orchard' ? PICKER_LEVELS : DOCK_LEVELS;
    const count = (lv) => (marks ? marks.filter((m) => lv >= m).length : E.starCount(lv));
    const stars = count(after) - count(before);
    if (stars > 0) {
      sfx.milestone();
      const name = kind === 'line' ? LINES[i].name : kind === 'orchard' ? 'Boomgaard' : 'Vrachtwagens';
      ui.starBanner(name, E.starReward(kind).text, count(after), kind);
      world.burst(world.stationPos(st).setY(3), 80);
    } else {
      sfx.levelUp(ui.starProgress(kind, after));
    }
    if (kind === 'line') ui.floatAtStation(st, '+' + money(E.lineValue(state, i) * E.priceMult(state) - priceBefore));
    world.bounceStation(st);
    return true;
  },

  unlockLine(i) {
    if (!E.buyLine(state, i)) { sfx.error(); return false; }
    sfx.unlock();
    ui.toast(`Nieuwe productielijn: ${LINES[i].name}!`, glyph(LINES[i].id));
    world.focus({ kind: 'line', i });
    setTimeout(() => world.bounceStation({ kind: 'line', i }), 50);
    ui.open('station', { kind: 'line', i });
    return true;
  },

  buyTier() {
    if (!E.buyTier(state)) { sfx.error(); return false; }
    sfx.unlock();
    ui.toast(`Uitgebreid naar ${TIERS[state.tier].name}!`, 'expand');
    setTimeout(() => {
      world.burst(world.target.clone().setY(3), 120);
    }, 60);
    return true;
  },

  buyResearch(id) {
    if (!E.buyUpgradeItem(state, id)) { sfx.error(); return false; }
    sfx.unlock();
    const u = UPGRADES.find((x) => x.id === id);
    ui.toast(`${u.name}: ${ui.upgradeDesc(u)}!`, 'up');
    return true;
  },

  doPrestige() {
    const gain = E.prestige(state);
    if (!gain) return;
    sfx.prestige();
    ui.close();
    ui.toast(`+${fmt(gain)} investeerders! Inkomen +${fmt(state.investors * INVESTOR_BONUS * 100)}%`, 'star');
    world.target.set(6, 0, 3);
    world.viewSize = 34;
    this.save();
  },

  claimGoal() {
    const g = goalAt(state.goal);
    const p = goalProgress(g, state, E.incomePerSecond(state));
    if (p.cur < p.max) return;
    const reward = goalReward(g, E.incomePerSecond(state));
    E.earn(state, reward);
    state.goal++;
    sfx.coin();
    ui.toast(`Doel gehaald! +${money(reward)}`, 'target');
  },

  tapStation(st) {
    if (!st) { ui.close(); return; }
    if (st.kind === 'golden') { this.collectGolden(); return; }
    if (st.kind === 'dock') st = { kind: 'sales' };
    // een nieuwe lijn bouw je direct door op het prijslabel te tikken
    if (st.kind === 'unlock' && E.lineUnlockable(state, st.i)) {
      if (state.money >= LINES[st.i].unlock) { this.unlockLine(st.i); return; }
      sfx.error();
      ui.toast(`Nog ${money(LINES[st.i].unlock - state.money)} nodig voor ${LINES[st.i].name}`);
      return;
    }
    sfx.click();
    ui.openStation(st);
  },

  collectGolden() {
    if (!world.golden.visible) return;
    const reward = Math.max(GOLDEN.minReward, E.incomePerSecond(state) * GOLDEN.incomeSeconds);
    E.earn(state, reward);
    state.stats.golden++;
    sfx.coin();
    const p = world.toScreen(world.golden.position);
    ui.float(p.x, p.y, '+' + money(reward), 'gold');
    ui.toast(`Gouden appel! +${money(reward)}`, 'sparkle');
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

  setMusic(on) {
    state.settings.music = on;
    setMusic(on);
  },

  setQuality(q) {
    state.settings.quality = q;
    state.settings.qualityChosen = true;
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
  document.getElementById('loading').innerHTML = '<img class="logo" src="icon.svg" alt=""><div>Je browser ondersteunt geen WebGL.</div><small>Probeer een andere browser.</small>';
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
  ui.offline(game.pendingOffline, gap, gap > secs ? secs : 0);
}

const gap0 = (Date.now() - state.lastTick) / 1000;
state.lastTick = Date.now();
if (!firstVisit && gap0 > 30) handleGap(gap0);
if (firstVisit) ui.welcome();
else if (upgradedFrom) ui.newVersion();

let lastFrame = performance.now();
let renderAcc = 0;
function frame(t) {
  const raw = (t - lastFrame) / 1000;
  lastFrame = t;
  requestAnimationFrame(frame);
  const now = Date.now();
  const gap = (now - state.lastTick) / 1000;
  state.lastTick = now;
  if (gap > 30) handleGap(gap);
  else if (gap > 0) {
    // geld alleen bij vertrek van een vrachtwagen
    const sales = [];
    E.tick(state, gap, now, sales);
    for (const ev of sales) ui.truckSale(world, ev.truck, ev.amount);
    // zacht geluidje per vertrekkende vrachtwagen, hooguit twee keer per seconde
    if (sales.length && t - (game.lastSaleSound || -1e9) > 500) { sfx.sale(); game.lastSaleSound = t; }
  }

  // Zuinig: hooguit 30 beelden per seconde tekenen (de economie loopt gewoon door)
  renderAcc += raw;
  if (state.settings.quality !== 'high' && renderAcc < 1 / 30 - 0.004) return;
  const dt = Math.min(0.1, renderAcc);
  renderAcc = 0;

  game.prod = E.computeProduction(state, now);
  world.sync(state, game.prod);

  // gouden appel
  if (world.golden.visible) {
    game.goldenLeft -= dt;
    if (game.goldenLeft <= 0) {
      world.showGolden(false);
      game.nextGolden = GOLDEN.minDelay + Math.random() * (GOLDEN.maxDelay - GOLDEN.minDelay);
    }
  } else if (state.tutorial >= TUTORIAL.length) {
    game.nextGolden -= dt;
    if (game.nextGolden <= 0) {
      world.showGolden(true);
      game.goldenLeft = GOLDEN.lifetime;
    }
  }

  world.update(dt);
  ui.update(t);
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
game.E = E;
