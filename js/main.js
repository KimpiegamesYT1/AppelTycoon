import * as E from './economy.js';
import { World } from './world.js';
import { UI } from './ui.js';
import { sfx, setSound, initMusic, setMusic } from './audio.js';
import { glyph } from './icons.js';
import { TUTORIAL } from './tutorial.js';
import { LINES, TIERS, GOLDEN, BELT_GOLD, OFFLINE, INVESTOR_BONUS, UPGRADES, PICKER_LEVELS, DOCK_LEVELS, STARS } from './config.js';
import { goalAt, goalProgress, goalReward } from './goals.js';
import { money, fmt } from './format.js';

const SAVE_KEY = 'appeltycoon.save.v1';

function migrate(d) {
  const base = E.newState();
  // versie 2 t/m 4 hadden een andere balans: nieuwe ronde, maar investeerders en statistieken blijven
  // (vanaf versie 3 blijft ook een afgeronde intro afgerond)
  if (d.version >= 2 && d.version <= 4) {
    base.settings = { ...base.settings, ...(d.settings || {}) };
    for (const k of ['investors', 'prestiges', 'playTime']) if (Number.isFinite(d[k])) base[k] = d[k];
    base.stats = { ...base.stats, ...(d.stats || {}) };
    if (d.version >= 3 && Number.isFinite(d.tutorial)) base.tutorial = d.tutorial;
    base.upgradedFrom = d.version;
    return base;
  }
  // versie 1 had een heel andere economie: begin opnieuw, maar houd de instellingen (muziek weer aan)
  if (d.version !== E.SAVE_VERSION && d.version !== 5) {
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
  if (d.version === 5) convertTransport(s);
  s.version = E.SAVE_VERSION;
  return s;
}

// Versie 5 -> 6: het vervoer groeit nu met kleine stappen (+8% per level) en krijgt geen gratis
// bonus meer bij uitbreidingen. We rekenen je vervoerlevel om: je houdt de capaciteit die je
// gebruikte (plus 30% ruimte); capaciteit die nergens voor nodig was vervalt.
function convertTransport(s) {
  const L = s.sales;
  const oldTrucks = 1 + [10, 20, 30, 40, 50].filter((l) => L >= l).length;
  const oldCap = 1.5 * 1.25 ** (L - 1) * oldTrucks * E.tierOrchardMult(s) * E.upgradeMult(s, 'transport', 'speed');
  const need = LINES.reduce((t, l, i) => t + E.lineRate(s, i), 0);
  const target = Math.min(oldCap, need * 1.3);
  let lv = 1;
  while (lv < 3000 && E.transportRate(s, lv) < target) lv++;
  s.trucks = [];
  s.goods = Math.min(s.goods, E.storeCapacity(s, lv));
  if (lv !== L) s.transportConverted = { from: L, to: lv };
  s.sales = lv;
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
const transportConverted = state.transportConverted;
delete state.transportConverted;
delete state.migrated;
delete state.upgradedFrom;
// standaard Auto (de prestatieregelaar past de beeldkwaliteit aan het toestel aan);
// alleen als de speler zelf Zuinig of Hoog kiest blijft dat bewaard
if (!state.settings.qualityChosen || !['low', 'high', 'auto'].includes(state.settings.quality)) state.settings.quality = 'auto';
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
    // een ster: lijnen worden twee keer zo snel, de boomgaard krijgt een plukker, het vervoer een (groter) voertuig
    const marks = kind === 'line' ? null : kind === 'orchard' ? PICKER_LEVELS : DOCK_LEVELS;
    const count = (lv) => (marks ? marks.filter((m) => lv >= m).length : E.starCount(lv));
    const stars = count(after) - count(before);
    if (stars > 0) {
      // bij ingedrukt houden komen sterren snel achter elkaar: het feestje hooguit eens per 1,5 s
      const now = performance.now();
      const loud = now - (this.lastStarFx || 0) > 1500;
      if (loud) { sfx.milestone(); world.burst(world.stationPos(st).setY(3), 80); this.lastStarFx = now; } else sfx.levelUp(1);
      const name = kind === 'line' ? LINES[i].name : kind === 'orchard' ? 'Boomgaard' : 'Vervoer';
      const reward = E.starReward(kind, marks ? marks[count(after) - 1] : STARS[count(after) - 1]).text;
      ui.starBanner(name, kind === 'sales' ? `Nu ${reward}!` : reward, count(after), kind);
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

  // Haalt de nieuwste versie op, ook in een web-app op je beginscherm waar je niet kunt verversen:
  // eerst opslaan, dan caches leegmaken en de pagina opnieuw laden met een unieke URL.
  async hardRefresh() {
    this.save();
    try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) { /* geen cache-opslag */ }
    try {
      if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    } catch (e) { /* geen service worker */ }
    // de HTTP-cache van de startpagina verversen, zodat ook een volgende start de nieuwe versie krijgt
    await Promise.all(['./', 'index.html', 'manifest.webmanifest'].map((u) => fetch(u, { cache: 'reload' }).catch(() => null)));
    const url = new URL(location.href);
    url.searchParams.set('r', Date.now().toString(36));
    location.replace(url.href);
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
// gouden appel op de band verwerkt: dat product is BELT_GOLD.mult keer zoveel waard
world.onBeltGold = (i, batch) => {
  const reward = E.lineValue(state, i) * E.priceMult(state) * batch * BELT_GOLD.mult;
  E.earn(state, reward);
  state.stats.beltGold = (state.stats.beltGold || 0) + 1;
  sfx.coin();
  const pos = world.stationPos({ kind: 'line', i }).setX(12).setY(2.5);
  world.burst(pos.clone(), 30);
  const p = world.toScreen(pos);
  if (p.visible) ui.float(p.x, p.y, `x${BELT_GOLD.mult} +${money(reward)}`, 'gold');
};
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
else if (upgradedFrom) ui.newVersion(upgradedFrom);
else if (transportConverted) ui.transportNews(transportConverted);

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
  if (state.settings.quality === 'low' && renderAcc < 1 / 30 - 0.004) return;
  const dt = Math.min(0.1, renderAcc);
  renderAcc = 0;

  game.prod = E.computeProduction(state, now);
  world.sync(state, game.prod);
  world.beltGoldOn = state.tutorial >= TUTORIAL.length;

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
  world.perfSample(raw);
}

requestAnimationFrame((t) => {
  lastFrame = t;
  const loading = document.getElementById('loading');
  loading.classList.add('gone');
  // na het vervagen helemaal weg: anders blijft er een onzichtbare laag boven het spel meedraaien
  setTimeout(() => loading.remove(), 1000);
  frame(t);
});

setInterval(() => game.save(), 5000);

// na "Update laden" de extra parameter weer uit de adresbalk halen
if (new URLSearchParams(location.search).has('r')) {
  const url = new URL(location.href);
  url.searchParams.delete('r');
  history.replaceState(null, '', url.href);
}
// Op de achtergrond kijken of er een nieuwe versie online staat: bij het starten, elke 10 minuten
// en als je terugkomt in de app. Was de app even weg en staat er een update klaar, dan laden we
// hem meteen (dan zit je niet midden in het spel).
let lastUpdateCheck = 0;
let hiddenSince = 0;
function maybeCheckUpdate() {
  if (document.hidden || Date.now() - lastUpdateCheck < 120000) return;
  lastUpdateCheck = Date.now();
  ui.checkUpdate();
}
setTimeout(maybeCheckUpdate, 5000);
setInterval(maybeCheckUpdate, 10 * 60 * 1000);
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) { hiddenSince = Date.now(); return; }
  const away = hiddenSince ? Date.now() - hiddenSince : 0;
  if (away > 60000) {
    lastUpdateCheck = Date.now();
    if (await ui.checkUpdate()) { game.hardRefresh(); return; }
  }
  maybeCheckUpdate();
});
function onHide() { game.save(); }
window.addEventListener('pagehide', onHide);
document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });

// voor debuggen in de console
window.appelTycoon = game;
game.E = E;
