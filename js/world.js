// De 3D-wereld: camera, fabriek, boomgaard, banden met producten, vrachtwagens.
import * as THREE from '../vendor/three.module.min.js';
import * as M from './models.js';
import { LINES, TIERS, TRUCK, PICKER_LEVELS, BELT_GOLD } from './config.js';
import { truckCount, truckCapacity, starCount, vehicleStage } from './economy.js';

const LINE_SPACING = 5.5;
const LZ0 = 2.5;
const HX0 = -1.5;
const HX1 = 23.5;
const BELT_Y = 1.06;
const FEED_Z = -0.5;
const BIN = new THREE.Vector3(-4.6, 0, -1.6);
const ROAD_X = 46;
// magazijn: open hal rechts van de fabriek, laadplekken aan de kant van de weg
const DX0 = 28.5;
const DX1 = 37.5;
const DZ0 = -6.5;
const DZ1 = 16.5;
const DEPOT = new THREE.Vector3((DX0 + DX1) / 2, 0, (DZ0 + DZ1) / 2);
const DEPOT_IN = DX0 + 1.5;
const dockZ = (k) => -3.6 + k * 3.6;
const BELT_SPEED = 3;
// Stappen van de prestatieregelaar: maximale pixeldichtheid, schaduwen elk zoveelste beeld, schaduwkaart.
const PERF_LEVELS = [
  { dpr: 3, shadowEvery: 1, shadowMap: 2048 },
  { dpr: 3, shadowEvery: 2, shadowMap: 2048 },
  { dpr: 2.25, shadowEvery: 2, shadowMap: 2048 },
  { dpr: 1.75, shadowEvery: 2, shadowMap: 2048 },
  { dpr: 1.5, shadowEvery: 3, shadowMap: 1024 },
  { dpr: 1.25, shadowEvery: 3, shadowMap: 1024 },
];

export const lineZ = (i) => LZ0 + i * LINE_SPACING;
const hallEnd = (slots) => lineZ(slots - 1) + 3;

const AZ = 0.8;
const EL = 0.64;
const CAM_DIR = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
const SCREEN_RIGHT = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
const SCREEN_UP = new THREE.Vector3(-Math.sin(AZ), 0, -Math.cos(AZ));

const dummy = new THREE.Object3D();
const SUN_OFFSET = new THREE.Vector3(-30, 70, 40);
const LAMP_ON = new THREE.MeshBasicMaterial({ color: 0x4cff7a });
const LAMP_OFF = new THREE.MeshBasicMaterial({ color: 0xff4d4d });

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    // kratten-sets: de buffers met posities ook vrijgeven
    if (o.isInstancedMesh) o.dispose();
  });
}

class Pool {
  constructor(parent, geometry, cap, material = M.MAT) {
    this.mesh = new THREE.InstancedMesh(geometry, material, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.cap = cap;
    this.n = 0;
    parent.add(this.mesh);
  }
  begin() { this.n = 0; }
  push(x, y, z, ry = 0, s = 1, rx = 0) {
    if (this.n >= this.cap) return;
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    this.mesh.setMatrixAt(this.n++, dummy.matrix);
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Een lopende band met een wachtrij: producten schuiven door tot ze tegen de voorganger
// aan komen, en hopen zich op als het einde geblokkeerd is.
class Belt {
  constructor(points, gap, speed = BELT_SPEED) {
    this.points = points.map((p) => new THREE.Vector3(p[0], BELT_Y, p[1]));
    this.lengths = [];
    this.total = 0;
    for (let i = 1; i < this.points.length; i++) {
      const l = this.points[i].distanceTo(this.points[i - 1]);
      this.lengths.push(l);
      this.total += l;
    }
    this.gap = gap;
    this.speed = speed;
    this.items = [];          // gesorteerd: items[0] ligt het verst
    this.holds = [];          // posities waar een ander product wil invoegen (ritsen)
  }
  canInsert(d) {
    // kleine marge zodat afrondingsfouten geen eeuwige wachtrij veroorzaken
    for (const it of this.items) if (Math.abs(it.d - d) < this.gap - 1e-3) return false;
    return true;
  }
  insert(item) {
    let k = 0;
    while (k < this.items.length && this.items[k].d > item.d) k++;
    this.items.splice(k, 0, item);
  }
  // Pak een item dat rond positie d ligt (voor afslagen naar een andere band).
  takeNear(d, before = 0.35, after = 0.12) {
    for (let k = 0; k < this.items.length; k++) {
      const it = this.items[k];
      if (it.d >= d - before && it.d <= d + after) { this.items.splice(k, 1); return it; }
    }
    return null;
  }
  // onEnd(item) geeft true als het item van de band af mag.
  update(dt, onEnd) {
    let limit = this.total;
    for (let k = 0; k < this.items.length; k++) {
      const it = this.items[k];
      let lim = limit;
      // wacht er verderop iemand om in te voegen, dan stoppen we vlak ervoor en laten hem voor
      for (const h of this.holds) if (it.d <= h - this.gap + 1e-6) lim = Math.min(lim, h - this.gap - 0.01);
      const nd = Math.min(it.d + this.speed * dt, lim);
      if (k === 0 && nd >= this.total - 1e-4) {
        it.d = this.total;
        if (onEnd && onEnd(it)) { this.items.splice(0, 1); k--; limit = this.total; continue; }
      } else if (nd > it.d) it.d = nd;
      limit = it.d - this.gap;
    }
  }
  full() {
    return this.items.length > 0 && this.items[this.items.length - 1].d < this.gap;
  }
  draw() {
    for (const it of this.items) {
      let rest = it.d;
      let i = 0;
      while (i < this.lengths.length - 1 && rest > this.lengths[i]) { rest -= this.lengths[i]; i++; }
      const a = this.points[i];
      const b = this.points[i + 1];
      const t = this.lengths[i] > 0 ? Math.min(1, rest / this.lengths[i]) : 0;
      const ry = Math.atan2(-(b.z - a.z), b.x - a.x);
      // een vers product groeit even op als het uit de machine komt
      let sc = it.fresh && it.d < 0.7 ? 0.45 + 0.55 * Math.sin((it.d / 0.7) * Math.PI / 2) : 1;
      if (it.gold) sc *= 1.35;
      // niet alles ligt keurig in het midden: een beetje opzij en scheef
      if (it.jx === undefined) { it.jx = (Math.random() - 0.5) * 0.16; it.jr = (Math.random() - 0.5) * 0.5; }
      const len = this.lengths[i] || 1;
      const nx = -(b.z - a.z) / len;
      const nz = (b.x - a.x) / len;
      it.pool.push(a.x + (b.x - a.x) * t + nx * it.jx, BELT_Y, a.z + (b.z - a.z) * t + nz * it.jx, ry + it.jr, sc);
    }
  }
}

// Volgt een gesloten pad met een vaste snelheid; voor vrachtwagens en de heftruck.
// stops: { puntIndex: seconden wachten }, reverse: segmenten waarop achteruit gereden wordt.
class PathMover {
  constructor(obj, points, speed, { offset = 0, stops = {}, reverse = [], y = 0, onLeave = null } = {}) {
    this.obj = obj;
    this.y = y;
    this.points = points.map((p) => new THREE.Vector3(p[0], 0, p[1]));
    this.lengths = [];
    this.starts = [];
    this.total = 0;
    for (let i = 0; i < this.points.length; i++) {
      const l = this.points[(i + 1) % this.points.length].distanceTo(this.points[i]);
      this.starts.push(this.total);
      this.lengths.push(l);
      this.total += l;
    }
    this.speed = speed;
    this.d = offset * this.total;
    this.stops = stops;
    this.reverse = new Set(reverse);
    this.onLeave = onLeave;
    this.wait = 0;
    this.seg = -1;
    this.heading = null;
    this.place();
  }
  // Zet het voertuig op afstand d langs het pad (voor vrachtwagens die de economie volgen).
  setDistance(d, dt) {
    this.d = ((d % this.total) + this.total) % this.total;
    this.place(dt);
  }
  update(dt) {
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0 && this.onLeave) this.onLeave(this.seg, this.obj.position);
      return;
    }
    this.d = (this.d + this.speed * dt) % this.total;
    this.place(dt);
  }
  place(dt = 1) {
    let i = 0;
    while (i < this.lengths.length - 1 && this.d >= this.starts[i + 1]) i++;
    if (i !== this.seg) {
      if (this.seg !== -1 && this.stops[i]) { this.wait = this.stops[i]; this.d = this.starts[i]; }
      this.seg = i;
    }
    const a = this.points[i];
    const b = this.points[(i + 1) % this.points.length];
    const t = Math.min(1, (this.d - this.starts[i]) / this.lengths[i]);
    this.obj.position.set(a.x + (b.x - a.x) * t, this.y, a.z + (b.z - a.z) * t);
    let target = Math.atan2(-(b.z - a.z), b.x - a.x);
    if (this.reverse.has(i)) target += Math.PI;
    if (this.heading === null) this.heading = target;
    let diff = target - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += diff * Math.min(1, dt * 5);
    this.obj.rotation.y = this.heading;
  }
}

export class World {
  constructor(canvas, { quality = 'auto', onTap = () => {} } = {}) {
    this.canvas = canvas;
    this.onTap = onTap;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa9dcf5);

    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
    this.target = new THREE.Vector3(6, 0, 3);
    this.goal = null;          // vloeiend naar een punt bewegen
    this.viewSize = 34;
    this.velocity = new THREE.Vector2();
    this.dragging = false;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x7fb069, 1.25);
    this.scene.add(hemi);
    try { this.perfLevel = Math.min(PERF_LEVELS.length - 1, Math.max(0, +localStorage.getItem('appelTycoonPerf') || 0)); } catch (e) { this.perfLevel = 0; }
    this.renderer.shadowMap.autoUpdate = false;
    this.frameNo = 0;
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.setQuality(quality);

    this.time = 0;
    this.builtTier = -1;
    this.layout = null;
    this.lineObjs = [];
    this.lineFlows = [];
    this.hits = [];
    this.pickers = [];
    this.trucks = [];
    this.trees = [];
    this.treeShown = 0;
    this.treeAnim = [];
    this.anchorsList = [];
    this.bounces = [];

    this.buildStatic();
    this.buildPools();
    this.buildOrchardTrees();
    this.setupInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // Hoog: altijd scherpe beelden (tot 3x pixeldichtheid) met zachte schaduwen.
  // Auto (standaard): als Hoog, maar een regelaar houdt het spel vloeiend op minder snelle toestellen (zie perfSample).
  // Zuinig: tot 1,5x pixeldichtheid, geen schaduwen en 30 beelden per seconde (zie main.js).
  setQuality(q) {
    if (q !== this.quality) this.perf = null;
    this.quality = q;
    const high = q !== 'low';
    const dpr = window.devicePixelRatio || 1;
    const p = PERF_LEVELS[q === 'auto' ? this.perfLevel || 0 : 0];
    this.renderer.setPixelRatio(high ? Math.min(dpr, p.dpr) : Math.min(dpr, 1.5));
    this.sun.castShadow = high;
    const size = high ? p.shadowMap : 2048;
    if (high && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.shadowEvery = high ? p.shadowEvery : 1;
    this.resize?.();
  }

  // Prestatieregelaar: meet hoe lang een beeld duurt. Haalt het toestel het tempo niet
  // (gemiddeld onder ~45 beelden per seconde), dan gaat hij een stapje lager: eerst de schaduwen
  // om het andere beeld bijwerken (niet te zien), dan iets minder pixels. Snelle toestellen merken niets.
  perfSample(raw) {
    if (this.quality !== 'auto') return;
    const pf = this.perf || (this.perf = { sum: 0, n: 0, since: 0, bad: 0, good: 0, ups: 0 });
    // na een pauze (andere app, laden, nieuwe hal) even niet meten
    if (raw > 1) { pf.sum = 0; pf.n = 0; pf.since = 0; return; }
    pf.since += raw;
    if (pf.since < 3) return;
    pf.sum += raw;
    pf.n++;
    if (pf.sum < 2) return;
    const avg = pf.sum / pf.n;
    pf.sum = 0;
    pf.n = 0;
    const level = this.perfLevel || 0;
    if (pf.locked) return;
    // hielp de vorige stap omlaag niet (bv. een telefoon in energiebesparing die op 30 beelden
    // per seconde vastzit), dan zetten we hem terug en laten we het verder zo
    if (pf.check) {
      const before = pf.check;
      pf.check = 0;
      const capped = before > 0.031 && before < 0.0355;
      if (capped && avg > before * 0.9) { pf.locked = true; this.setPerfLevel(level - 1); return; }
    }
    if (avg > 1 / 45) {
      pf.good = 0;
      // twee trage metingen achter elkaar (of één heel trage): een stapje lager
      pf.bad += avg > 1 / 20 ? 2 : 1;
      if (pf.bad >= 2 && level < PERF_LEVELS.length - 1) {
        pf.bad = 0;
        pf.check = avg;
        // ging het na een stap omhoog weer mis, dan niet nog eens proberen
        if (pf.lastUp) pf.ups = Infinity;
        pf.lastUp = false;
        this.setPerfLevel(level + 1);
      }
    } else {
      pf.bad = 0;
      // lang ruim op tempo: voorzichtig weer een stapje hoger (hooguit twee keer per sessie)
      if (avg < 1 / 58 && ++pf.good >= 10 && level > 0 && pf.ups < 2) { pf.good = 0; pf.ups++; pf.lastUp = true; this.setPerfLevel(level - 1); }
    }
  }

  setPerfLevel(level) {
    this.perfLevel = level;
    if (this.perf) this.perf.since = 0;
    try { localStorage.setItem('appelTycoonPerf', String(level)); } catch (e) { /* geen opslag */ }
    this.setQuality(this.quality);
  }

  // ---------- Opbouw ----------

  buildStatic() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: M.C.grass }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // weg met strepen
    const b = new M.Builder();
    b.box(8, 0.05, 400, M.C.road, ROAD_X + 1.5, 0, 0);
    b.box(1.2, 0.15, 400, M.C.concrete, ROAD_X - 3.1, 0, 0);
    b.box(1.2, 0.15, 400, M.C.concrete, ROAD_X + 6.1, 0, 0);
    for (let z = -200; z < 200; z += 4) b.box(0.18, 0.06, 2, 0xffffff, ROAD_X + 1.5, 0, z);
    const road = b.mesh({ shadow: false, receive: true });
    road.receiveShadow = true;
    this.scene.add(road);

    // decoratie rondom
    const deco = new THREE.Group();
    const r = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    for (let i = 0; i < 70; i++) {
      const x = -90 + r() * 200;
      const z = -70 + r() * 170;
      if (x > -38 && x < 50 && z > -14 && z < 60) continue;
      if (Math.abs(x - ROAD_X - 1.5) < 7) continue;
      const m = r() > 0.35 ? M.bush(i) : M.rock(i);
      m.position.set(x, 0, z);
      deco.add(m);
    }
    for (let z = -10; z < 80; z += 12) {
      const l = M.lamp();
      l.position.set(ROAD_X - 3, 0, z);
      l.rotation.y = 0;
      deco.add(l);
    }
    M.mergeStatic(deco);
    this.scene.add(deco);
  }

  buildPools() {
    this.itemGroup = new THREE.Group();
    this.scene.add(this.itemGroup);
    this.applePool = new Pool(this.itemGroup, M.itemGeometry('apple'), 600);
    this.productPools = LINES.map((l) => new Pool(this.itemGroup, M.itemGeometry(l.id), 260));
    // gouden appel op de band en het gouden product dat de machine ervan maakt
    const shiny = new THREE.MeshLambertMaterial({ color: 0xffc83d, emissive: 0x8a5a00, flatShading: true });
    this.goldApplePool = new Pool(this.itemGroup, M.itemGeometry('apple'), 4, shiny);
    this.goldProductPools = LINES.map((l) => new Pool(this.itemGroup, M.itemGeometry(l.id), 4, shiny));
    this.beltGoldTimer = BELT_GOLD.minDelay * 0.6 + Math.random() * 20;

    const goldMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x7a5200 });
    this.golden = new THREE.Mesh(M.itemGeometry('gold'), goldMat);
    this.golden.visible = false;
    this.golden.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    ring.rotation.x = Math.PI / 2;
    this.golden.add(ring);
    this.goldenRing = ring;
    this.golden.userData.station = { kind: 'golden' };
    this.scene.add(this.golden);
    const gh = M.hitBox(2.4, 2.4, 2.4, 0, -1.2, 0);
    gh.userData.station = { kind: 'golden' };
    this.golden.add(gh);
    this.goldenHit = gh;

    const confettiMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.confetti = new THREE.InstancedMesh(M.itemGeometry('confetti'), confettiMat, 160);
    this.confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.confetti.frustumCulled = false;
    this.confetti.count = 0;
    this.confettiParts = [];
    const palette = [0xff5a5a, 0xffc43d, 0x5ad16a, 0x4aa8ff, 0xff7ad9, 0xffffff];
    for (let i = 0; i < 160; i++) this.confetti.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    this.scene.add(this.confetti);
  }

  plotCenters() {
    const out = [];
    for (let k = 0; k < 6; k++) out.push(new THREE.Vector3(-11.5 - (k % 2) * 12, 0, 3.5 + Math.floor(k / 2) * 12));
    return out;
  }

  buildOrchardTrees() {
    const geos = [0, 1, 2].map((v) => M.treeGeometry(v));
    this.treeMeshes = geos.map((g) => {
      const m = new THREE.InstancedMesh(g, M.MAT, 40);
      m.castShadow = true;
      m.receiveShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    });
    let seed = 3;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    this.treeSlots = [];
    for (const c of this.plotCenters()) {
      for (let gz = 0; gz < 4; gz++) {
        for (let gx = 0; gx < 4; gx++) {
          this.treeSlots.push({
            x: c.x - 3.6 + gx * 2.4 + (rnd() - 0.5) * 0.6,
            z: c.z - 3.6 + gz * 2.4 + (rnd() - 0.5) * 0.6,
            ry: rnd() * Math.PI * 2,
            s: 0.85 + rnd() * 0.3,
          });
        }
      }
    }
  }

  rebuildLayout(state) {
    if (this.layout) { this.scene.remove(this.layout); disposeTree(this.layout); }
    this.lineObjs.forEach((o) => { if (o) { this.scene.remove(o.group); disposeTree(o.group); } });
    this.lineObjs = [];
    this.lineFlows = [];
    this.trucks.forEach((t) => { this.scene.remove(t.obj); disposeTree(t.obj); });
    this.trucks = [];
    this.builtLines = [];

    const tier = state.tier;
    const T = TIERS[tier];
    const g = new THREE.Group();
    this.layout = g;
    this.scene.add(g);
    this.hits = [];
    const slots = T.slots;
    const zEnd = hallEnd(slots);

    // ---- Hal ----
    const style = tier === 0 ? 'wood' : tier === 1 ? 'brick' : tier < 5 ? 'concrete' : 'modern';
    const floorCol = { wood: 0xc9a46c, brick: 0xd8c6a2, concrete: 0xd3d7dc, modern: 0xe4e7eb }[style];
    const wallCol = { wood: 0x9c6a3c, brick: 0xb9573f, concrete: 0xe9e4da, modern: 0xf5f5f5 }[style];
    const trimCol = { wood: 0x7a5230, brick: 0x8e3f2d, concrete: 0x3d7bd9, modern: 0xffc43d }[style];
    const hb = new M.Builder();
    const w = HX1 - HX0;
    const d = zEnd - (-3.5);
    const cx = (HX0 + HX1) / 2;
    const cz = (zEnd - 3.5) / 2;
    hb.box(w, 0.25, d, floorCol, cx, 0, cz);
    // tegels / planken
    if (style === 'wood') {
      for (let x = HX0 + 1; x < HX1; x += 1.2) hb.box(0.05, 0.02, d, 0xb08a55, x, 0.25, cz);
    } else {
      for (let x = HX0 + 2.5; x < HX1; x += 2.5) hb.box(0.04, 0.02, d, floorCol - 0x101010, x, 0.25, cz);
      for (let z = -3.5 + 2.5; z < zEnd; z += 2.5) hb.box(w, 0.02, 0.04, floorCol - 0x101010, cx, 0.25, z);
    }
    // gele looplijnen
    if (style !== 'wood') {
      for (let i = 0; i < slots; i++) {
        hb.box(w - 2, 0.03, 0.12, M.C.yellow, cx, 0.25, lineZ(i) + 2.6);
      }
    }
    const wh = tier < 2 ? 2.6 : 3.4;
    // achterwand (noord) en linkerwand (west) - cutaway zoals mobiele tycoons
    hb.box(w + 0.3, wh, 0.3, wallCol, cx, 0.25, -3.5);
    hb.box(w + 0.32, 0.3, 0.34, trimCol, cx, wh, -3.5);
    for (let x = HX0 + 3; x < HX1 - 1; x += 4) hb.box(1.8, 1.0, 0.34, M.C.glass, x, 1.3, -3.5);
    // westwand met opening voor de toevoerband
    const westLen = zEnd - (FEED_Z + 0.9);
    hb.box(0.3, wh, westLen, wallCol, HX0, 0.25, FEED_Z + 0.9 + westLen / 2);
    hb.box(0.34, 0.3, westLen, trimCol, HX0, wh, FEED_Z + 0.9 + westLen / 2);
    hb.box(0.3, wh, 2.2, wallCol, HX0, 0.25, -2.4);
    // deurposten met waarschuwingsstrepen rond de doorgang van de toevoerband
    for (const z of [FEED_Z - 0.82, FEED_Z + 0.82]) {
      for (let k = 0; k < 6; k++) hb.box(0.36, (wh - 0.1) / 6, 0.16, k % 2 ? 0x2b2f3a : M.C.yellow, HX0, 0.25 + k * ((wh - 0.1) / 6), z);
    }
    for (let z = 4; z < zEnd - 1; z += 5.5) hb.box(0.34, 1.0, 1.8, M.C.glass, HX0, 1.3, z);
    // pilaren
    for (const [x, z] of [[HX0, -3.5], [HX1, -3.5], [HX0, zEnd], [HX1, zEnd]]) hb.box(0.6, wh + 0.4, 0.6, trimCol, x, 0, z);
    const hall = hb.mesh({ receive: true });
    hall.receiveShadow = true;
    g.add(hall);
    // vangrails voor en rechts
    const rail1 = M.guardRail(w - 1);
    rail1.position.set(HX0 + 0.5, 0.25, zEnd);
    g.add(rail1);
    const rail2 = M.guardRail(zEnd - 2.5);
    rail2.rotation.y = -Math.PI / 2;
    rail2.position.set(HX1, 0.25, 2.5);
    g.add(rail2);

    // ---- Toevoerband vanaf de boomgaard en verzamelband naar het magazijn ----
    const zLast = lineZ(slots - 1);
    const feedStart = BIN.x + 1.4;
    const pad = new M.Builder();
    pad.box(-0.45 - feedStart + 0.4, 0.25, 1.3, M.C.concrete, (feedStart - 0.45) / 2, 0, FEED_Z);
    g.add(pad.mesh({ shadow: false, receive: true }));
    const feedA = M.conveyor(-0.45 - feedStart);
    feedA.position.set(feedStart, 0.25, FEED_Z);
    g.add(feedA);
    const c1 = M.beltCorner(['n', 'e']);
    c1.position.set(0, 0.25, FEED_Z);
    g.add(c1);
    // langs de lijnen: west doorlopende leuning, oost onderbroken waar een lijn aansluit
    const fb0 = FEED_Z + 0.45;
    const feedB = M.conveyor(zLast + 0.5 - fb0, {
      gapsNeg: Array.from({ length: slots }, (_, i) => [lineZ(i) - fb0 - 0.48, lineZ(i) - fb0 + 0.48]),
    });
    feedB.rotation.y = -Math.PI / 2;
    feedB.position.set(0, 0.25, fb0);
    g.add(feedB);
    const colLen = zLast + 0.5 - fb0;
    const col = M.conveyor(colLen, {
      gapsNeg: Array.from({ length: slots }, (_, i) => [zLast + 0.5 - lineZ(i) - 0.48, zLast + 0.5 - lineZ(i) + 0.48]),
    });
    col.rotation.y = Math.PI / 2;
    col.position.set(21.5, 0.25, zLast + 0.5);
    g.add(col);
    const ends = new M.Builder();
    ends.box(0.96, 0.12, 0.07, M.C.yellow, 0, 1.11, zLast + 0.5);
    ends.box(0.96, 0.12, 0.07, M.C.yellow, 21.5, 1.11, zLast + 0.5);
    g.add(ends.mesh());
    const c2 = M.beltCorner(['n', 'w']);
    c2.position.set(21.5, 0.25, FEED_Z);
    g.add(c2);
    const colOut = M.conveyor(DEPOT_IN - 21.95);
    colOut.position.set(21.95, 0.25, FEED_Z);
    g.add(colOut);
    // de toevoer- en verzamelband lopen sneller dan de lijnbanden: ze moeten alle lijnen tegelijk
    // bedienen, en zo blijft er altijd ruimte om appels af te nemen en producten in te voegen
    this.feeder = new Belt([[feedStart + 0.1, FEED_Z], [0, FEED_Z], [0, zLast]], 0.42, 4.5);
    this.collector = new Belt([[21.5, zLast], [21.5, FEED_Z], [DEPOT_IN, FEED_Z]], 0.5, 6.5);
    this.feedJoin = (i) => (0 - (feedStart + 0.1)) + (lineZ(i) - FEED_Z);
    this.colJoin = (i) => zLast - lineZ(i);
    this.feedTimer = 0;
    this.feedRate = 0;

    // ---- Boomgaard ----
    const plots = this.plotCenters().slice(0, T.plots);
    plots.forEach((c, k) => {
      const pb = new M.Builder();
      pb.box(11, 0.06, 11, M.C.grassDark, c.x, 0, c.z);
      for (let i = 0; i < 4; i++) pb.box(11, 0.02, 0.6, 0x6aa84b, c.x, 0.06, c.z - 3.6 + i * 2.4);
      const patch = pb.mesh({ shadow: false, receive: true });
      g.add(patch);
      const fN = M.fence(11); fN.position.set(c.x - 5.5, 0, c.z - 5.5); g.add(fN);
      const fS = M.fence(11); fS.position.set(c.x - 5.5, 0, c.z + 5.5); g.add(fS);
      const fW = M.fence(11); fW.rotation.y = -Math.PI / 2; fW.position.set(c.x - 5.5, 0, c.z - 5.5); g.add(fW);
    });
    const bin = M.appleBin();
    bin.position.copy(BIN);
    g.add(bin);
    this.binMesh = bin;
    const oh = M.hitBox(13, 4, 13, plots[0].x + 1.5, 0, plots[0].z - 1);
    oh.userData.station = { kind: 'orchard' };
    g.add(oh);
    this.hits.push(oh);
    for (const c of plots.slice(1)) {
      const h = M.hitBox(11, 4, 11, c.x, 0, c.z);
      h.userData.station = { kind: 'orchard' };
      g.add(h);
      this.hits.push(h);
    }

    // ---- Magazijn: groeit mee met je vrachtwagens (zie buildDepot) ----
    this.depotKey = null;
    this.buildDepot(state);

    // ---- Lege lijnplekken ----
    this.slotMarks = [];
    for (let i = 0; i < slots; i++) {
      const mb = new M.Builder();
      const z = lineZ(i);
      for (let x = 1; x < 21; x += 1.4) {
        mb.box(0.8, 0.03, 0.12, 0xffffff, x + 0.4, 0.25, z - 1.8);
        mb.box(0.8, 0.03, 0.12, 0xffffff, x + 0.4, 0.25, z + 1.8);
      }
      const mark = mb.mesh({ shadow: false });
      g.add(mark);
      const h = M.hitBox(20, 2, 4, 11, 0.25, z);
      h.userData.station = { kind: 'unlock', i };
      g.add(h);
      this.slotMarks.push({ mark, hit: h });
    }

    // ---- Bouwplaats voor de volgende uitbreiding ----
    this.siteAnchor = null;
    const next = TIERS[tier + 1];
    if (next) {
      const site = this.sitePosition(tier + 1);
      const sb = new THREE.Group();
      const cb = new M.Builder();
      cb.box(site.w, 0.05, site.d, 0xd7b98a, 0, 0, 0);
      for (let x = -site.w / 2; x < site.w / 2; x += 1.6) {
        cb.box(0.8, 0.07, 0.25, M.C.yellow, x + 0.4, 0.02, -site.d / 2);
        cb.box(0.8, 0.07, 0.25, M.C.yellow, x + 0.4, 0.02, site.d / 2);
      }
      const pad = cb.mesh({ shadow: false, receive: true });
      sb.add(pad);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const c = M.cone();
        c.position.set((x * site.w) / 2, 0, (z * site.d) / 2);
        sb.add(c);
      }
      const pb = new M.Builder();
      pb.box(0.5, 0.25, 2.2, M.C.wood, 0, 0, 0);
      pb.box(0.5, 0.25, 2.2, M.C.wood, 0, 0.25, 0.1);
      pb.box(0.4, 0.4, 0.4, M.C.metalDark, 1.2, 0, 0.6);
      const pile = pb.mesh();
      pile.position.set(site.w / 4, 0, 0);
      sb.add(pile);
      sb.position.set(site.x, 0.02, site.z);
      g.add(sb);
      const h = M.hitBox(site.w, 2, site.d, site.x, 0, site.z);
      h.userData.station = { kind: 'tier' };
      g.add(h);
      this.hits.push(h);
      this.siteAnchor = new THREE.Vector3(site.x, 2.5, site.z);
    }

    // ---- Extra gebouwen bij grote uitbreidingen ----
    this.buildLandmarks(g, tier);

    // alles wat stilstaat samenvoegen (de appelbak stuitert en de lege plekken verdwijnen, die blijven los)
    M.mergeStatic(g, new Set([this.binMesh, ...this.slotMarks.map((sm) => sm.mark)]));

    this.builtTier = tier;
    this.builtSlots = slots;
    this.zEnd = zEnd;
  }

  // Hoe het magazijn eruitziet hangt af van het vrachtwagen-level: elke laadplek een stuk hal erbij,
  // en op hogere levels medewerkers, lampen, een groot bord, een wikkelmachine
  // en een tweede heftruck.
  depotLook(state) {
    const lv = state.sales;
    return {
      docks: truckCount(lv),
      decor: [20, 40, 60, 80, 110].filter((x) => lv >= x).length,
      workers: Math.min(6, Math.floor(lv / 12)),
    };
  }

  buildDepot(state) {
    const look = this.depotLook(state);
    const key = `${look.docks}|${look.decor}|${look.workers}`;
    if (key === this.depotKey) return false;
    const first = this.depotKey === null;
    this.depotKey = key;
    if (this.depotGroup) {
      this.scene.remove(this.depotGroup);
      disposeTree(this.depotGroup);
      this.hits = this.hits.filter((h) => !h.userData.depot);
    }
    const g = new THREE.Group();
    this.depotGroup = g;
    this.scene.add(g);
    const { docks: nDocks, decor, workers } = look;
    const z1 = Math.max(2.6, dockZ(nDocks - 1) + 2.1);
    const dw = DX1 - DX0;
    const dd = z1 - DZ0;
    const cz = (DZ0 + z1) / 2;
    const db = new M.Builder();
    db.box(dw, 0.3, dd, 0xd9dcdf, DEPOT.x, 0, cz);
    for (let x = DX0 + 2.25; x < DX1; x += 2.25) db.box(0.04, 0.02, dd, 0xc4c8cc, x, 0.3, cz);
    // looproute van de heftruck
    db.box(0.12, 0.03, dd - 2, M.C.yellow, DX1 - 2.25, 0.3, cz + 0.6);
    db.box(0.12, 0.03, dd - 2, M.C.yellow, DX1 - 4.1, 0.3, cz + 0.6);
    const dwh = 3.6;
    db.box(dw + 0.3, dwh, 0.3, 0xe9e4da, DEPOT.x, 0.3, DZ0);
    db.box(dw + 0.32, 0.35, 0.34, M.C.red, DEPOT.x, 0.3 + dwh, DZ0);
    for (let x = DX0 + 2.4; x < DX1 - 1; x += 3.2) db.box(1.6, 0.9, 0.34, M.C.glass, x, 2.0, DZ0);
    // lage westmuur met opening voor de verzamelband
    const lw = 1.0;
    const w1 = FEED_Z - 0.85 - DZ0;
    db.box(0.3, lw, w1, 0xe9e4da, DX0, 0.3, DZ0 + w1 / 2);
    const w2 = z1 - (FEED_Z + 0.85);
    db.box(0.3, lw, w2, 0xe9e4da, DX0, 0.3, FEED_Z + 0.85 + w2 / 2);
    db.box(0.34, 0.12, w1, M.C.red, DX0, 0.3 + lw, DZ0 + w1 / 2);
    db.box(0.34, 0.12, w2, M.C.red, DX0, 0.3 + lw, FEED_Z + 0.85 + w2 / 2);
    db.box(0.5, dwh + 0.5, 0.5, M.C.red, DX0, 0, DZ0);
    db.box(0.5, dwh + 0.5, 0.5, M.C.red, DX1, 0, DZ0);
    db.box(0.5, 1.5, 0.5, M.C.red, DX0, 0, z1);
    // bord op de achterwand
    db.box(4.2, 1.0, 0.12, M.C.white, DEPOT.x + 1.6, 2.6, DZ0 + 0.2);
    db.ico(0.4, M.C.apple, DEPOT.x, 3.1, DZ0 + 0.3, { sz: 0.3 });
    db.box(2.4, 0.18, 0.05, M.C.red, DEPOT.x + 2.1, 3.25, DZ0 + 0.28);
    db.box(2.0, 0.18, 0.05, M.C.red, DEPOT.x + 1.9, 2.85, DZ0 + 0.28);
    // inpaktafel waar de verzamelband eindigt
    db.box(1.5, 0.75, 1.4, M.C.metalDark, DEPOT_IN + 0.45, 0.3, FEED_Z);
    for (let k = 0; k < 4; k++) db.cyl(0.07, 1.3, M.C.metal, DEPOT_IN - 0.1 + k * 0.35, 1.0, FEED_Z - 0.65, { seg: 6, rx: Math.PI / 2 });
    // laadplein naar de weg: groeit mee met het aantal laadplekken
    db.box(ROAD_X - 2.45 - DX1, 0.17, dd, M.C.road, (DX1 + ROAD_X - 2.45) / 2, 0, cz);
    for (let k = 0; k < nDocks - 1; k++) db.box(4.6, 0.02, 0.1, 0xffffff, DX1 + 2.6, 0.17, dockZ(k) + 1.8);
    // lampen aan de achterwand
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8 });
    if (decor >= 1) {
      const lamp = (x, y, z) => {
        db.box(0.7, 0.14, 0.45, 0x3a4250, x, y, z);
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.32), lampMat);
        l.position.set(x, y - 0.01, z);
        g.add(l);
      };
      for (let x = DX0 + 1.6; x < DX1 - 0.5; x += 3.2) lamp(x, 3.2, DZ0 + 0.4);
    }
    if (decor >= 2) {
      // veiligheidsstrepen op de vloer bij de deuren en een stapel lege pallets
      for (let k = 0; k < nDocks; k++) for (let j = 0; j < 4; j++) db.box(0.3, 0.02, 0.5, j % 2 ? 0x2b2f3a : M.C.yellow, DX1 - 0.4 - j * 0.3, 0.31, dockZ(k));
      for (let k = 0; k < 5; k++) db.box(1.1, 0.14, 1.1, k % 2 ? 0xc9b28a : 0xb89a6e, DX0 + 1.0, 0.3 + k * 0.16, z1 - 0.9);
    }
    // groot bord boven de hal
    if (decor >= 3) {
      db.box(0.15, 2.0, 0.15, 0x3a4250, DEPOT.x - 2.5, 3.9, DZ0);
      db.box(0.15, 2.0, 0.15, 0x3a4250, DEPOT.x + 2.5, 3.9, DZ0);
      db.box(6.2, 1.5, 0.2, M.C.red, DEPOT.x, 5.0, DZ0);
      db.box(5.8, 1.1, 0.05, M.C.white, DEPOT.x, 5.2, DZ0 + 0.12);
      db.ico(0.55, M.C.apple, DEPOT.x - 2.0, 5.75, DZ0 + 0.2, { sz: 0.35 });
      for (let k = 0; k < 4; k++) db.box(0.55, 0.6, 0.05, M.C.red, DEPOT.x - 0.9 + k * 0.85, 5.45, DZ0 + 0.16);
    }
    // kantoortje in de hoek
    if (decor >= 5) {
      db.box(2.4, 2.4, 2.2, 0xf4f1ea, DX1 - 1.5, 0.3, DZ0 + 1.4);
      db.box(2.5, 0.15, 2.3, M.C.blue, DX1 - 1.5, 2.7, DZ0 + 1.4);
      db.box(1.4, 0.8, 0.05, M.C.glass, DX1 - 1.7, 1.4, DZ0 + 2.52);
      db.box(0.7, 1.6, 0.05, 0x8a5a33, DX1 - 0.6, 0.3, DZ0 + 2.52);
    }
    const depot = db.mesh({ receive: true });
    depot.receiveShadow = true;
    g.add(depot);
    const rail = M.guardRail(dw - 0.6);
    rail.position.set(DX0 + 0.3, 0.3, z1);
    g.add(rail);

    // stellingen; de kratten erin laten zien hoe vol het magazijn is
    const rz = [DZ0 + 0.9];
    if (nDocks >= 3) rz.push(nDocks >= 4 ? 5.6 : 3.0);
    if (nDocks >= 5) rz.push(10.6);
    const racks = rz.map((z) => [DX0 + 0.5, z, 4]);
    for (const [x, z, bays] of racks) {
      const r = M.palletRack(bays);
      r.position.set(x, 0.3, z);
      g.add(r);
    }
    const shelfSlots = [];
    for (let lvl = 0; lvl < 3; lvl++) {
      for (const [x, z, bays] of racks) {
        for (let bay = 0; bay < bays; bay++) shelfSlots.push({ x: x + 0.55 + bay * 1.1, y: 0.3 + 0.11 + lvl * 0.85, z, v: bay % 3 });
      }
    }
    this.storeCrates = new M.CrateSet([0, 1, 2].map((v) => M.shelfCrateGeometry(v)), shelfSlots);
    g.add(this.storeCrates);
    // laaddeuren met een pallet die klaarstaat voor de vrachtwagen (alleen in het gebouwde deel)
    this.docks = [];
    for (let k = 0; k < 6; k++) {
      if (dockZ(k) > z1 - 1) break;
      const door = M.dockDoor();
      door.position.set(DX1, 0.3, dockZ(k));
      g.add(door);
      const p = M.pallet(0xc9b28a);
      p.scale.set(1, 0.17, 1);
      p.position.set(DX1 - 1.3, 0.3, dockZ(k));
      g.add(p);
      this.docks.push({ door, pallet: p, staged: 0, userData: door.userData });
    }
    // kratten op de pallets bij de deuren: één set voor alle deuren (krat c van elke deur na elkaar)
    const dockGeo = (col) => M.sharedGeometry(`dockCrate:${col}`, () => {
      const cb = new M.Builder();
      cb.box(0.55, 0.5, 0.55, col, 0, 0, 0);
      cb.ico(0.11, M.C.apple, 0, 0.52, 0);
      return cb;
    });
    const dockSlots = [];
    for (let c = 0; c < 4; c++) {
      for (let k = 0; k < Math.min(nDocks, this.docks.length); k++) dockSlots.push({ x: DX1 - 1.3 + (c % 2 ? 0.28 : -0.28), y: 0.5 + Math.floor(c / 2) * 0.52, z: dockZ(k) + (c % 2 ? 0.28 : -0.28) * (c < 2 ? 1 : -1), v: c % 2 });
    }
    this.dockCrates = new M.CrateSet([dockGeo(0xd29a62), dockGeo(M.C.wood)], dockSlots);
    g.add(this.dockCrates);
    const sh = M.hitBox(dw + 7, 5, dd, DEPOT.x + 3.5, 0, cz);
    sh.userData.station = { kind: 'sales' };
    sh.userData.depot = true;
    g.add(sh);
    this.hits.push(sh);

    // heftrucks: van de band naar de laaddeuren; vorken omhoog met lading, omlaag zonder
    const zFar = z1 > 5 ? z1 - 1.6 : -3.3;
    const forkPath = [[DEPOT_IN + 1.6, 1.4], [DX1 - 2.6, 1.4], [DX1 - 2.6, zFar], [DX1 - 3.7, zFar], [DX1 - 3.7, zFar > 1.4 ? 2.2 : 0.6], [DEPOT_IN + 1.6, zFar > 1.4 ? 2.2 : 0.6]];
    this.forklifts = [];
    for (let f = 0; f < (decor >= 5 ? 2 : 1); f++) {
      const fork = M.forklift();
      g.add(fork);
      const fl = { obj: fork, loaded: false, lift: 0 };
      fl.mover = new PathMover(fork, forkPath, 2.2, {
        offset: f * 0.5, stops: { 0: 1.2, 2: 1.2 }, y: 0.3,
        onLeave: (seg) => { fl.loaded = seg === 0 ? true : seg === 2 ? false : fl.loaded; },
      });
      fl.loaded = f === 1;
      this.forklifts.push(fl);
    }

    // wikkelmachine: draait folie om een pallet
    this.wrapper = null;
    if (decor >= 4) {
      const wb = new M.Builder();
      wb.cyl(0.9, 0.15, 0x3a4250, 0, 0, 0, { seg: 12 });
      wb.box(0.25, 2.4, 0.25, 0x3a4250, 1.0, 0, 0);
      wb.box(0.85, 0.85, 0.85, M.C.wood, 0, 0.15, 0);
      wb.box(0.9, 0.5, 0.9, 0xcfe8ff, 0, 0.3, 0);
      const base = wb.mesh();
      base.position.set(DX0 + 6.4, 0.3, z1 > 5 ? z1 - 2.2 : DZ0 + 3.0);
      g.add(base);
      const arm = new THREE.Group();
      arm.position.copy(base.position);
      const ab = new M.Builder();
      ab.box(0.15, 0.6, 0.15, M.C.orange, 1.0, 0.5, 0);
      ab.cyl(0.08, 0.6, 0xcfe8ff, 0.85, 0.5, 0, { seg: 6 });
      arm.add(ab.mesh());
      g.add(arm);
      this.wrapper = arm;
    }

    // medewerkers: sjouwen kratten van de stelling naar de laaddeuren
    this.depotWorkers = [];
    const vest = [0xff7a1a, 0xd9e04a, 0xff7a1a, 0x3d7bd9, 0xd9e04a, 0xff7a1a];
    for (let w = 0; w < workers; w++) {
      const person = M.person(vest[w % vest.length], M.C.white, { helmet: true });
      const cb = new M.Builder();
      cb.box(0.5, 0.4, 0.4, M.C.wood, 0, 0, 0);
      cb.ico(0.1, M.C.apple, 0, 0.42, 0);
      const crate = cb.mesh();
      crate.position.set(0.35, 0.75, 0);
      person.add(crate);
      g.add(person);
      const rack = racks[w % racks.length];
      const from = [rack[0] + 0.9 + (w % 3) * 1.2, rack[1] + 1.1];
      const k = w % Math.max(1, this.docks.length);
      const to = [DX1 - 1.9, dockZ(k) + (w % 2 ? 0.7 : -0.7)];
      const mover = new PathMover(person, [from, to], 1.6, { offset: (w * 0.37) % 1, stops: { 0: 1.0, 1: 0.8 } });
      this.depotWorkers.push({ person, crate, mover });
    }

    // stilstaande delen samenvoegen; heftrucks, mensen, deuren, pallets en de wikkelarm bewegen
    const moving = new Set([...this.forklifts.map((f) => f.obj), ...this.depotWorkers.map((w) => w.person), ...this.docks.flatMap((d) => [d.userData.shutter, d.pallet])]);
    if (this.wrapper) moving.add(this.wrapper);
    M.mergeStatic(g, moving);

    if (!first) {
      this.bounce(g);
      this.burst(new THREE.Vector3(DEPOT.x, 4, cz), 70);
    }
    return true;
  }

  // Waar de volgende uitbreiding gebouwd wordt.
  sitePosition(t) {
    if (t <= 6) {
      const z0 = hallEnd(TIERS[t - 1].slots);
      const z1 = hallEnd(TIERS[t].slots);
      return { x: (HX0 + HX1) / 2, z: (z0 + z1) / 2 + 0.5, w: HX1 - HX0, d: z1 - z0 + 1 };
    }
    return [
      { x: 66, z: 2, w: 26, d: 24 },
      { x: 10, z: 66, w: 40, d: 20 },
      { x: -18, z: -22, w: 16, d: 14 },
      { x: 68, z: 44, w: 16, d: 16 },
    ][t - 7];
  }

  buildLandmarks(g, tier) {
    const add = (m, x, z, ry = 0) => { m.position.set(x, 0, z); m.rotation.y = ry; g.add(m); return m; };
    if (tier >= 3) add(M.waterTower(), -6, -9);
    if (tier >= 4) {
      const cols = [0x4aa8ff, 0xffc43d, 0xff6b6b, 0x7ad17a, 0xffffff];
      const pk = new M.Builder();
      pk.box(12, 0.05, 7, M.C.road, 0, 0, 0);
      for (let i = 0; i < 6; i++) pk.box(0.12, 0.06, 2.6, 0xffffff, -5 + i * 2, 0, -1.8);
      add(pk.mesh({ shadow: false, receive: true }), 29, 24);
      for (let i = 0; i < 4; i++) add(M.car(cols[i]), 25 + i * 2, 22.2, Math.PI / 2);
    }
    if (tier >= 5) {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) add(M.solarPanel(), 4 + i * 2.6, -7 - j * 2);
    }
    if (tier >= 6) {
      add(M.silo(8, 0xf0f0f0), -5, 50);
      add(M.silo(8, 0xe53935), -9, 50);
    }
    if (tier >= 7) {
      add(M.warehouse(18, 12, 6, 0xf4f1ea, 0xd9473b), 66, -3);
      add(M.silo(9), 60, 10);
      add(M.silo(9), 64, 10);
      add(M.silo(9, 0xe53935), 68, 10);
      const yard = new M.Builder();
      yard.box(26, 0.05, 26, M.C.concrete, 66, 0, 2);
      add(yard.mesh({ shadow: false, receive: true }), 0, 0);
    }
    if (tier >= 8) {
      const colors = [0xf4f1ea, 0xd5e6f5, 0xf5e0c8, 0xe8d5f0, 0xd8f0d5];
      let k = 0;
      for (let x = -8; x <= 28; x += 7) {
        add(M.office(4.5, 4.5, 4 + ((k * 7) % 6), colors[k % colors.length], k + 3), x, 62);
        add(M.house(colors[(k + 2) % colors.length], k), x + 1, 70);
        k++;
      }
      const st = new M.Builder();
      st.box(48, 0.05, 3, M.C.road, 10, 0, 66);
      add(st.mesh({ shadow: false, receive: true }), 0, 0);
    }
    if (tier >= 9) {
      add(M.appleStatue(), -18, -22);
      add(M.office(6, 6, 12, 0xffffff, 99), 10, -16);
    }
    if (tier >= 10) {
      add(M.rocket(), 68, 44);
      add(M.office(5, 5, 8, 0xd5e6f5, 42), 60, 34);
    }
  }

  buildLine(i) {
    const z = lineZ(i);
    const group = new THREE.Group();
    const belt = M.conveyor(20.6);
    belt.position.set(0.45, 0.25, z);
    group.add(belt);
    const m = M.machine(LINES[i].id, LINES[i].color);
    m.group.position.set(10, 0.25, z);
    group.add(m.group);
    const worker = M.person(LINES[i].color, M.C.blue, { helmet: i % 2 === 1 });
    worker.position.set(15, 0.25, z + 1.3);
    worker.rotation.y = Math.PI;
    group.add(worker);
    const worker2 = M.person(M.C.blue, M.C.red, {});
    worker2.position.set(5, 0.25, z + 1.3);
    worker2.rotation.y = Math.PI;
    worker2.visible = false;
    group.add(worker2);
    const crates = M.crateStack(i + 11, 6);
    crates.position.set(18.2, 0.25, z - 2.0);
    crates.visible = false;
    group.add(crates);
    const h = M.hitBox(21, 4, 4.4, 11, 0.25, z);
    h.userData.station = { kind: 'line', i };
    group.add(h);
    this.scene.add(group);
    const obj = { group, machine: m, worker, worker2, crates, hit: h, phase: i * 0.7, vis: 0, want: 0, held: 0, prog: 0, base: 0, activity: 0 };
    this.lineObjs[i] = obj;
    this.lineFlows[i] = {
      input: new Belt([[0.45, z], [8.4, z]], 0.42),
      output: new Belt([[11.6, z], [21.05, z]], 0.62),
    };
    return obj;
  }

  // ---------- Synchroniseren met spelstatus ----------

  sync(state, prod) {
    if (state.tier !== this.builtTier || this._prestiges !== state.prestiges) {
      this._prestiges = state.prestiges;
      this.rebuildLayout(state);
    }
    LINES.forEach((l, i) => {
      const unlocked = state.lines[i] > 0;
      if (unlocked && !this.lineObjs[i]) {
        const o = this.buildLine(i);
        this.bounce(o.group);
      }
      const o = this.lineObjs[i];
      if (o) {
        // met elke ster ziet de lijn er drukker uit
        const stars = starCount(state.lines[i]);
        o.worker2.visible = stars >= 2;
        o.crates.visible = stars >= 3;
        if (prod) o.lineStatus = prod.lines[i].status;
      }
      if (this.slotMarks[i]) {
        const show = !unlocked;
        this.slotMarks[i].mark.visible = show;
        this.slotMarks[i].hit.visible = show;
        this.slotMarks[i].hit.userData.station = show ? { kind: 'unlock', i } : null;
      }
    });

    // bomen
    const plots = TIERS[state.tier].plots;
    const want = Math.min(plots * 16, 3 + Math.floor(state.orchard * 0.75));
    if (want !== this.treeShown) {
      if (want > this.treeShown) for (let k = this.treeShown; k < want; k++) this.treeAnim[k] = this.time;
      this.treeShown = want;
    }

    // plukkers
    // extra plukkers op vaste levels, zodat je de boomgaard ziet groeien
    const pickers = Math.min(plots * 3, 12, 1 + PICKER_LEVELS.filter((l) => state.orchard >= l).length);
    while (this.pickers.length < pickers) this.addPicker();
    while (this.pickers.length > pickers) { const p = this.pickers.pop(); this.scene.remove(p.obj); disposeTree(p.obj); }

    // magazijn groeit mee met het vrachtwagen-level
    this.buildDepot(state);

    // vrachtwagens: één per open laadplek
    this.state = state;
    this.truckCap = truckCapacity(state);
    const trucks = truckCount(state.sales);
    // groter voertuig (scooter -> pickup -> bestelbus -> vrachtwagen -> grote truck): alles opnieuw
    const stage = vehicleStage(state.sales);
    if (stage !== this.vehicleStage) {
      const upgrade = this.vehicleStage != null && this.trucks.length > 0;
      this.trucks.forEach((t) => { this.scene.remove(t.obj); disposeTree(t.obj); });
      this.trucks = [];
      this.vehicleStage = stage;
      while (this.trucks.length < trucks) this.addTruck(this.trucks.length);
      if (upgrade) this.trucks.forEach((t) => this.bounce(t.obj));
    }
    while (this.trucks.length < trucks) this.addTruck(this.trucks.length);
    this.openDocks = trucks;

    // appelbak en magazijn
    if (prod) {
      this.binFull = prod.binFull;
      const bf = Math.min(1, state.apples / prod.binCap);
      if (this.binMesh) this.binMesh.userData.heap.position.y = 0.2 + bf * 1.05;
      if (this.binMesh) this.binMesh.userData.heap.visible = bf > 0.02;
      const sf = Math.min(1, state.goods / prod.storeCap);
      this.storeFill = sf;
      if (this.storeCrates) this.storeCrates.show(Math.round(sf * this.storeCrates.length));
    }

    // Stroom op de banden: tot 2,5 per seconde zie je precies wat de lijn maakt. Daarboven gaan
    // producten in bakjes (batch), zodat de banden het kunnen bijhouden.
    if (prod) {
      this.storeFull = prod.storeFull;
      // bij een vol magazijn tonen we de echte machinesnelheid; het ophopen ontstaat dan op de band
      const rateOf = (i) => (prod.lines[i].status === 'full' ? prod.lines[i].potential : prod.lines[i].rate);
      let sum = 0;
      const vis = LINES.map((l, i) => {
        const r = this.lineObjs[i] ? rateOf(i) : 0;
        let v = r <= 3 ? r : 3 + Math.log2(r / 3) * 0.6;
        v = Math.min(v, 4.2);
        sum += v;
        return v;
      });
      // de verzamelband mag flink vol, maar houdt nog wat ruimte zodat elke lijn kan invoegen
      const scale = sum > 5.4 ? 5.4 / sum : 1;
      let feed = 0;
      LINES.forEach((l, i) => {
        const o = this.lineObjs[i];
        if (!o) return;
        const r = rateOf(i);
        o.vis = vis[i] * scale;
        o.batch = o.vis > 0 ? r / o.vis : 1;
        o.k = Math.max(1, Math.min(l.apples, Math.floor(5 / Math.max(o.vis, 0.01))));
        o.base = Math.min(1.5, 0.25 + Math.log10(1 + r) / 2);
        feed += o.vis * o.k;
      });
      if (feed > 6.5) {
        const f = 6.5 / feed;
        feed = 0;
        this.lineObjs.forEach((o) => { if (o) { o.k = Math.max(1, Math.floor(o.k * f)); feed += o.vis * o.k; } });
      }
      this.feedRate = feed;
      this.applesShort = prod.lines.some((l, i) => this.lineObjs[i] && l.status === 'apples');
    }
  }

  truckPosition(k) {
    const tr = this.trucks[k];
    return tr ? tr.obj.position.clone() : DEPOT.clone();
  }

  // Hoeveel stuks één product op de band voorstelt (1 = precies wat je ziet).
  beltBatch(i) {
    const o = this.lineObjs[i];
    return o && o.batch ? o.batch : 1;
  }

  addPicker() {
    const shirts = [0xe74c3c, 0x3d7bd9, 0x27ae60, 0xf39c12, 0x8e44ad];
    const n = this.pickers.length;
    const obj = M.person(shirts[n % shirts.length], n % 2 ? M.C.yellow : 0x2c3e50, { basket: true });
    obj.position.copy(BIN).add(new THREE.Vector3(-1.5, 0, 1));
    this.scene.add(obj);
    this.pickers.push({ obj, state: 'idle', wait: Math.random() * 2, target: new THREE.Vector3() });
  }

  addTruck(k) {
    const colors = [0xd9473b, 0x3d7bd9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085];
    const obj = M.vehicle(this.vehicleStage || 0, colors[k % colors.length], k);
    this.scene.add(obj);
    const z = dockZ(k);
    // achterkant van het voertuig tegen de laaddeur
    const park = DX1 + 0.25 + obj.userData.len / 2;
    // korte rit: de vrachtwagen keert op de weg om, zodat er elke ~10 s een vrachtwagen met geld vertrekt
    const turn = 34;
    const path = [[park, z], [ROAD_X - 0.5, z], [ROAD_X - 0.5, turn], [ROAD_X + 3.5, turn], [ROAD_X + 3.5, z], [park + 4.5, z]];
    // de positie komt uit de economie (state.trucks[k].t), zodat verkoop en beeld kloppen
    const mover = new PathMover(obj, path, 12, { reverse: [5] });
    this.trucks.push({ obj, mover });
  }

  // ---------- Effecten ----------

  bounce(obj) {
    // altijd terug naar de oorspronkelijke schaal, ook als er snel achter elkaar gekocht wordt
    if (!obj.userData.baseScale) obj.userData.baseScale = obj.scale.clone();
    const running = this.bounces.find((b) => b.obj === obj);
    if (running) { running.t = 0; return; }
    this.bounces.push({ obj, t: 0, base: obj.userData.baseScale });
  }

  bounceStation(st) {
    if (!st) return;
    if (st.kind === 'line' && this.lineObjs[st.i]) {
      this.bounce(this.lineObjs[st.i].machine.group);
      this.burst(new THREE.Vector3(10, 2.5, lineZ(st.i)));
    } else if (st.kind === 'orchard' && this.binMesh) {
      this.bounce(this.binMesh);
      this.burst(BIN.clone().setY(2));
    } else if (st.kind === 'sales') {
      this.burst(DEPOT.clone().setY(4.5));
      this.docks.forEach((d) => this.bounce(d.userData.shutter));
    } else if (st.kind === 'tier' || st.kind === 'unlock') {
      this.burst(this.target.clone().setY(3), 80);
    }
  }

  burst(pos, n = 40) {
    for (let k = 0; k < n; k++) {
      if (this.confettiParts.length >= 160) this.confettiParts.shift();
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 4;
      this.confettiParts.push({
        p: pos.clone(),
        v: new THREE.Vector3(Math.cos(a) * s, 5 + Math.random() * 5, Math.sin(a) * s),
        r: Math.random() * 6, life: 1.6 + Math.random() * 0.6,
      });
    }
  }

  showGolden(on) {
    if (on) {
      const slot = this.treeSlots[Math.floor(Math.random() * Math.max(1, this.treeShown))];
      this.golden.position.set(slot.x, 4.3, slot.z);
      this.golden.visible = true;
      this.golden.scale.setScalar(1.6);
      this.goldenBorn = this.time;
    } else {
      this.golden.visible = false;
    }
  }

  // ---------- Camera & invoer ----------

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.width = w;
    this.height = h;
    this.updateCamera();
  }

  updateCamera() {
    const aspect = this.width / this.height;
    const half = this.viewSize / 2;
    let hw, hh;
    if (aspect >= 1) { hh = half; hw = half * aspect; } else { hw = half * 0.9; hh = hw / aspect; }
    this.camera.left = -hw; this.camera.right = hw; this.camera.top = hh; this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.target).addScaledVector(CAM_DIR, 150);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    // Schaduwgebied: precies wat de camera ziet. De hoeken van het scherm, geprojecteerd op de grond
    // en op objecthoogte, bekeken vanuit de zon. Een vast vierkant miste op een staand (mobiel) scherm
    // de boven- en onderkant: daar verdwenen de schaduwen op een vaste lijn.
    const key = `${hw.toFixed(2)}|${hh.toFixed(2)}`;
    if (key !== this.shadowKey) {
      this.shadowKey = key;
      const sc = this.sun.shadow.camera;
      const light = new THREE.Matrix4().lookAt(SUN_OFFSET, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
      light.setPosition(SUN_OFFSET);
      const toLight = light.invert();
      const right = SCREEN_RIGHT, up = new THREE.Vector3().crossVectors(CAM_DIR, SCREEN_RIGHT);
      const p = new THREE.Vector3();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const h of [0, 7]) {
        // punt op het scherm (relatief aan het doel), langs de kijkrichting naar hoogte h
        p.copy(right).multiplyScalar(sx * hw).addScaledVector(up, sy * hh);
        p.addScaledVector(CAM_DIR, (h - p.y) / CAM_DIR.y);
        p.applyMatrix4(toLight);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      const m = 3;
      sc.left = minX - m; sc.right = maxX + m; sc.bottom = minY - m; sc.top = maxY + m;
      sc.near = 1; sc.far = 260;
      sc.updateProjectionMatrix();
    }
    this.sun.position.copy(this.target).add(SUN_OFFSET);
    this.sun.target.position.copy(this.target);
    this.sun.target.updateMatrixWorld();
  }

  worldPerPixel() {
    return (this.camera.top - this.camera.bottom) / this.height;
  }

  pan(dx, dy) {
    const wpp = this.worldPerPixel();
    this.target.addScaledVector(SCREEN_RIGHT, -dx * wpp);
    this.target.addScaledVector(SCREEN_UP, (dy * wpp) / Math.sin(EL));
    this.clampTarget();
  }

  clampTarget() {
    const T = this.builtTier;
    const maxX = T >= 7 ? 78 : 50;
    const maxZ = T >= 7 ? 75 : (this.zEnd || 20) + 8;
    const minZ = T >= 8 ? -28 : -12;
    this.target.x = Math.min(maxX, Math.max(-36, this.target.x));
    this.target.z = Math.min(maxZ, Math.max(minZ, this.target.z));
  }

  zoom(factor) {
    this.viewSize = Math.min(this.maxZoom(), Math.max(12, this.viewSize * factor));
  }

  maxZoom() { return this.builtTier >= 7 ? 110 : 70; }

  focus(st) {
    const p = this.stationPos(st);
    if (!p) return;
    // vloeiend (in en uit) naar het station schuiven; langere afstanden duren iets langer
    this.goal = p.clone().setY(0);
    this.goalFrom = this.target.clone();
    this.goalT = 0;
    this.goalDur = Math.min(1.3, Math.max(0.6, this.goalFrom.distanceTo(this.goal) / 30));
  }

  stationPos(st) {
    if (!st) return null;
    if (st.kind === 'orchard') return BIN.clone().add(new THREE.Vector3(-4, 0, 3));
    if (st.kind === 'sales' || st.kind === 'dock') return DEPOT.clone().setX(DEPOT.x + 2);
    if (st.kind === 'line' || st.kind === 'unlock') return new THREE.Vector3(10, 0, lineZ(st.i));
    if (st.kind === 'tier' && this.siteAnchor) return this.siteAnchor.clone();
    return null;
  }

  setupInput() {
    const c = this.canvas;
    const pointers = new Map();
    let downPos = null;
    let moved = 0;
    let pinchDist = 0;
    let lastT = 0;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragging = true;
      if (pointers.size === 1) { downPos = { x: e.clientX, y: e.clientY }; moved = 0; this.velocity.set(0, 0); this.goal = null; }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        moved = 99;
      }
      lastT = performance.now();
    });
    c.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 6) {
          const k = e.pointerType === 'mouse' ? 0.6 : 1;
          this.pan(dx * k, dy * k);
          if (e.pointerType === 'mouse') { lastT = performance.now(); return; }
          // snelheid in pixels per seconde, afgevlakt, voor het uitglijden na loslaten
          const now = performance.now();
          const dt = Math.max(8, now - lastT);
          this.velocity.lerp(new THREE.Vector2((dx / dt) * 1000, (dy / dt) * 1000), 0.35);
          if (this.velocity.length() > 2500) this.velocity.setLength(2500);
          lastT = now;
        }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) this.zoom(pinchDist / dist);
        pinchDist = dist;
      }
    });
    const up = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size === 0 && downPos && moved <= 6) {
        this.velocity.set(0, 0);
        const st = this.pick(e.clientX, e.clientY);
        this.onTap(st);
      }
      if (pointers.size === 0) {
        this.dragging = false;
        if (performance.now() - lastT > 60) this.velocity.set(0, 0);
      }
      if (pointers.size < 2) pinchDist = 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      // muiswiel én trackpad: zoom evenredig met de scrollafstand
      const delta = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
      this.zoom(Math.exp(Math.max(-120, Math.min(120, delta)) * 0.0012));
    }, { passive: false });
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const list = [...this.hits, ...this.lineObjs.filter(Boolean).map((o) => o.hit), ...(this.slotMarks || []).filter((s) => s.hit.userData.station).map((s) => s.hit)];
    if (this.golden.visible) list.unshift(this.goldenHit);
    const res = ray.intersectObjects(list, false);
    for (const r of res) if (r.object.userData.station) return r.object.userData.station;
    return null;
  }

  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * this.width, y: (1 - p.y) / 2 * this.height, visible: p.z < 1 && p.z > -1 };
  }

  // Ankerpunten voor de zwevende labels.
  anchors(state) {
    const out = [];
    out.push({ key: 'orchard', st: { kind: 'orchard' }, pos: BIN.clone().setY(3.6) });
    out.push({ key: 'sales', st: { kind: 'sales' }, pos: DEPOT.clone().setY(5.2) });
    LINES.forEach((l, i) => {
      if (state.lines[i] > 0) out.push({ key: 'line' + i, st: { kind: 'line', i }, pos: new THREE.Vector3(10, 4.2, lineZ(i)) });
      else if (i < TIERS[state.tier].slots && (i === 0 || state.lines[i - 1] > 0)) out.push({ key: 'unlock' + i, st: { kind: 'unlock', i }, pos: new THREE.Vector3(10, 1.4, lineZ(i)) });
    });
    if (this.siteAnchor && (state.lines[1] > 0 || state.tier > 0)) out.push({ key: 'tier', st: { kind: 'tier' }, pos: this.siteAnchor });
    if (this.golden.visible) out.push({ key: 'golden', st: { kind: 'golden' }, pos: this.golden.position.clone().setY(5.2) });
    return out;
  }

  // ---------- Animatie ----------

  update(dt) {
    this.time += dt;
    const t = this.time;

    // camera traagheid / focus
    if (this.goal) {
      this.goalT = Math.min(1, this.goalT + dt / this.goalDur);
      const k = this.goalT;
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      this.target.lerpVectors(this.goalFrom, this.goal, e);
      if (k >= 1) this.goal = null;
    } else if (!this.dragging && this.velocity.lengthSq() > 25) {
      this.pan(this.velocity.x * dt, this.velocity.y * dt);
      this.velocity.multiplyScalar(Math.pow(0.003, dt));
    }
    this.updateCamera();

    // bandtextuur laten lopen
    M.getBeltTexture().offset.x -= dt * 0.9;

    // banden en machines
    this.applePool.begin();
    this.productPools.forEach((p) => p.begin());
    this.goldApplePool.begin();
    this.goldProductPools.forEach((p) => p.begin());
    this.updateBelts(dt);
    this.lineObjs.forEach((o) => {
      if (!o) return;
      const act = o.activity;
      o.pop = Math.max(0, (o.pop || 0) - dt * 5);
      // lamp: rood als het magazijn vol zit, oranje als de machine op appels wacht
      const status = o.lineStatus === 'full' && act <= 0.01 ? 'jam' : act > 0.01 ? 'run' : 'wait';
      o.machine.anim(t + o.phase, act, { prog: o.prog, status, pop: o.pop });
      o.worker.userData.body.position.y = act > 0 ? Math.abs(Math.sin(t * 5 + o.phase)) * 0.08 : 0;
      o.worker2.userData.body.position.y = act > 0 ? Math.abs(Math.sin(t * 5 + o.phase + 1)) * 0.08 : 0;
    });

    // laaddeuren: open voor elke vrachtwagen, dicht voor plekken die nog komen
    // pallets bij de deuren: wat klaarstaat voor de volgende vrachtwagen
    const goods = this.state ? this.state.goods : 0;
    const ready = this.truckCap > 0 ? Math.min(1, goods / this.truckCap) : 0;
    (this.docks || []).forEach((d, k) => {
      const open = k < (this.openDocks || 1);
      const sh = d.userData.shutter;
      sh.position.y += ((open ? 2.75 : 0.3) - sh.position.y) * Math.min(1, dt * 3);
      d.userData.lamp.material = open ? LAMP_ON : LAMP_OFF;
      d.pallet.visible = open;
    });
    // kratten staan alleen klaar bij open deuren (de set bevat alleen die)
    if (this.dockCrates) this.dockCrates.show(Math.max(0, Math.ceil(ready * 4 - 0.05)) * (this.dockCrates.length / 4));

    // plukkers
    for (const p of this.pickers) this.updatePicker(p, dt);
    // appels in manden laten zien bij plukkers
    this.applePool.end();
    this.productPools.forEach((p) => p.end());
    this.goldApplePool.end();
    this.goldProductPools.forEach((p) => p.end());

    // bomen tonen met pop-animatie
    const counts = [0, 0, 0];
    for (let k = 0; k < this.treeShown; k++) {
      const s = this.treeSlots[k];
      const v = k % 3;
      const born = this.treeAnim[k];
      let sc = s.s;
      if (born !== undefined) {
        const a = Math.min(1, (t - born) / 0.6);
        sc *= a < 1 ? Math.sin(a * Math.PI * 0.5) * (1 + Math.sin(a * Math.PI) * 0.25) : 1;
      }
      const sway = Math.sin(t * 1.2 + k) * 0.02;
      dummy.position.set(s.x, 0, s.z);
      dummy.rotation.set(sway, s.ry, sway);
      dummy.scale.setScalar(Math.max(0.001, sc));
      dummy.updateMatrix();
      this.treeMeshes[v].setMatrixAt(counts[v]++, dummy.matrix);
    }
    this.treeMeshes.forEach((m, v) => { m.count = counts[v]; m.instanceMatrix.needsUpdate = true; });

    // voertuigen
    // vrachtwagens: laden aan de deur, rijden weg (verkocht) en komen leeg terug
    const L = TRUCK.loadTime;
    this.trucks.forEach((tr, k) => {
      const st = this.state && this.state.trucks && this.state.trucks[k];
      if (!st) return;
      const d = st.t < L ? 0 : ((st.t - L) / (TRUCK.cycle - L)) * tr.mover.total;
      tr.mover.setDistance(d, dt);
      const full = st.t < L ? (this.truckCap > 0 ? st.load / this.truckCap : 0) : tr.mover.seg < 2 ? st.last : 0;
      const cargo = tr.obj.userData.cargo;
      cargo.show(Math.round(full * cargo.length));
    });
    for (const fl of this.forklifts || []) {
      fl.mover.update(dt);
      const u = fl.obj.userData;
      // vorken: omhoog als hij een pallet draagt, omlaag zonder; de lading is alleen zichtbaar als hij iets draagt
      const target = fl.loaded ? 0.45 : 0.08;
      fl.lift += (target - fl.lift) * Math.min(1, dt * 3);
      u.carriage.position.y = 0.12 + fl.lift;
      u.load.visible = fl.loaded;
      u.beaconMat.color.setHex(Math.sin(this.time * 10 + fl.mover.d) > 0 ? 0xffb02e : 0x8a4a00);
    }
    for (const w of this.depotWorkers || []) {
      w.mover.update(dt);
      const walking = w.mover.wait <= 0;
      w.crate.visible = w.mover.seg === 0;
      if (w.person.userData.body) w.person.userData.body.position.y = walking ? Math.abs(Math.sin(this.time * 9 + w.mover.d)) * 0.08 : 0;
    }
    if (this.wrapper) this.wrapper.rotation.y += dt * 2.2;

    // gouden appel
    if (this.golden.visible) {
      this.golden.rotation.y += dt * 2;
      this.golden.position.y = 4.3 + Math.sin(t * 3) * 0.25;
      this.goldenRing.scale.setScalar(1 + Math.sin(t * 6) * 0.15);
    }

    // stuiter-effect
    this.bounces = this.bounces.filter((b) => {
      b.t += dt;
      const k = b.t / 0.45;
      if (k >= 1) { b.obj.scale.copy(b.base); return false; }
      const s = 1 + Math.sin(k * Math.PI) * 0.18 * (1 - k);
      b.obj.scale.set(b.base.x * s, b.base.y * (2 - s), b.base.z * s);
      return true;
    });

    // confetti
    let n = 0;
    this.confettiParts = this.confettiParts.filter((c) => {
      c.life -= dt;
      if (c.life <= 0) return false;
      c.v.y -= 14 * dt;
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < 0.3) { c.p.y = 0.3; c.v.set(0, 0, 0); }
      c.r += dt * 8;
      dummy.position.copy(c.p);
      dummy.rotation.set(c.r, c.r * 0.7, 0);
      dummy.scale.setScalar(Math.min(1, c.life * 2));
      dummy.updateMatrix();
      this.confetti.setMatrixAt(n++, dummy.matrix);
      return true;
    });
    this.confetti.count = n;
    this.confetti.instanceMatrix.needsUpdate = true;

    if (this.sun.castShadow && this.frameNo++ % (this.shadowEvery || 1) === 0) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  // Het bandennetwerk: toevoerband -> lijnen -> machines -> verzamelband -> magazijn.
  updateBelts(dt) {
    if (!this.feeder) return;
    // Genoeg appels: de toevoerband staat vol en elke machine pakt er zijn appels af (een bufferband).
    // Te weinig: er komen maar zoveel appels als de boomgaard plukt, en die worden eerlijk verdeeld.
    const short = this.applesShort && !this.binFull;
    if (short) this.feedTimer = Math.min(2, this.feedTimer + dt * this.feedRate);
    else this.feedTimer = this.feedRate > 0 || this.binFull ? 1.5 : 0;
    this.beltGoldTimer -= dt;
    if (this.feedTimer >= 1 && this.feeder.canInsert(0)) {
      // af en toe een gouden appel ertussen
      const gold = this.beltGoldOn && this.beltGoldTimer <= 0 && this.feedRate > 0;
      if (gold) this.beltGoldTimer = BELT_GOLD.minDelay + Math.random() * (BELT_GOLD.maxDelay - BELT_GOLD.minDelay);
      this.feeder.insert(gold ? { d: 0, pool: this.goldApplePool, gold: true } : { d: 0, pool: this.applePool });
      this.feedTimer -= 1;
    }
    this.feeder.update(dt, () => false);
    const holds = [];
    this.lineObjs.forEach((o, i) => {
      if (!o) return;
      const f = this.lineFlows[i];
      const k = o.k || 1;
      // appels afslaan naar deze lijn: bij een tekort alleen het eigen deel (k appels per product)
      o.want = Math.min(3, o.want + o.vis * k * dt);
      if ((o.want >= 1 || !short) && f.input.canInsert(0)) {
        const it = this.feeder.takeNear(this.feedJoin(i));
        if (it) { it.d = 0; f.input.insert(it); o.want = Math.max(0, o.want - 1); }
      }
      f.input.update(dt, (it) => {
        if (o.held >= k) return false;
        o.held++;
        if (it.gold) o.goldIn = true;
        return true;
      });
      // de machine maakt een product van k appels, als er plek is op de band erna
      let running = false;
      if (o.held >= k && o.vis > 0) {
        o.prog += dt * o.vis;
        running = true;
        if (o.prog >= 1) {
          if (f.output.canInsert(0)) {
            const gold = !!o.goldIn;
            o.goldIn = false;
            f.output.insert({ d: 0, pool: gold ? this.goldProductPools[i] : this.productPools[i], fresh: true, gold });
            if (gold && this.onBeltGold) this.onBeltGold(i, o.batch || 1);
            o.held -= k;
            o.prog = 0;
            o.pop = 1;
          } else { o.prog = 1; running = false; }
        }
      }
      o.activity = running ? o.base : 0;
      let waiting = false;
      f.output.update(dt, (it) => {
        const d = this.colJoin(i);
        if (!this.collector.canInsert(d)) { waiting = true; return false; }
        it.d = d;
        it.fresh = false;
        this.collector.insert(it);
        return true;
      });
      // ritsen: wacht een product te lang op een gat, dan houdt de verzamelband ruimte vrij
      o.mergeWait = waiting ? (o.mergeWait || 0) + dt : 0;
      if (o.mergeWait > 0.2 && !this.storeFull) holds.push(this.colJoin(i));
      f.input.draw();
      f.output.draw();
    });
    // aan het eind van de verzamelband gaat alles het magazijn in, behalve als dat vol is
    this.collector.holds = holds;
    this.collector.update(dt, () => !this.storeFull);
    this.feeder.draw();
    this.collector.draw();
  }

  updatePicker(p, dt) {
    const o = p.obj;
    // appelbak vol: niemand gaat meer plukken
    if (this.binFull && (p.state === 'idle' || p.state === 'drop') ) {
      p.wait = Math.max(p.wait, 0.3);
      o.userData.body.position.y = 0;
      return;
    }
    if (p.wait > 0) {
      p.wait -= dt;
      o.userData.body.position.y = p.state === 'pick' ? Math.abs(Math.sin(this.time * 6)) * 0.12 : 0;
      if (p.wait <= 0) {
        if (p.state === 'idle' || p.state === 'drop') {
          const k = Math.floor(Math.random() * Math.max(1, this.treeShown));
          const s = this.treeSlots[k];
          p.target.set(s.x + 0.9, 0, s.z + 0.9);
          p.state = 'toTree';
        } else if (p.state === 'pick') {
          p.target.set(BIN.x - 1.4 + Math.random() * 0.4, 0, BIN.z + 1.2 + Math.random() * 0.6);
          p.state = 'toBin';
        }
      }
      return;
    }
    const d = p.target.clone().sub(o.position);
    d.y = 0;
    const dist = d.length();
    if (dist < 0.1) {
      if (p.state === 'toTree') { p.state = 'pick'; p.wait = 1.2 + Math.random(); }
      else { p.state = 'drop'; p.wait = 0.4; }
      return;
    }
    const step = Math.min(dist, 2.6 * dt);
    o.position.addScaledVector(d.normalize(), step);
    o.rotation.y = Math.atan2(d.x, d.z);
    o.userData.body.position.y = Math.abs(Math.sin(this.time * 12)) * 0.1;
  }
}
