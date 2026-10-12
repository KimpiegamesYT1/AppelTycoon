// De 3D-wereld: camera, fabriek, boomgaard, banden met producten, vrachtwagens.
import * as THREE from '../vendor/three.module.min.js';
import * as M from './models.js';
import { LINES, TIERS, TRUCK, PICKER_LEVELS } from './config.js';
import { truckCount, truckCapacity, starCount } from './economy.js';

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

export const lineZ = (i) => LZ0 + i * LINE_SPACING;
const hallEnd = (slots) => lineZ(slots - 1) + 3;

const AZ = 0.8;
const EL = 0.64;
const CAM_DIR = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
const SCREEN_RIGHT = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
const SCREEN_UP = new THREE.Vector3(-Math.sin(AZ), 0, -Math.cos(AZ));

const dummy = new THREE.Object3D();
const LAMP_ON = new THREE.MeshBasicMaterial({ color: 0x4cff7a });
const LAMP_OFF = new THREE.MeshBasicMaterial({ color: 0xff4d4d });

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
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
    this.mesh.instanceMatrix.needsUpdate = true;
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
      it.pool.push(a.x + (b.x - a.x) * t, BELT_Y, a.z + (b.z - a.z) * t, ry);
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
  constructor(canvas, { quality = 'high', onTap = () => {} } = {}) {
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

  // Hoog: scherpe beelden (tot 3x pixeldichtheid) met zachte schaduwen.
  // Zuinig: tot 1,5x pixeldichtheid, geen schaduwen en 30 beelden per seconde (zie main.js).
  setQuality(q) {
    this.quality = q;
    const high = q === 'high';
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(high ? Math.min(dpr, 3) : Math.min(dpr, 1.5));
    this.sun.castShadow = high;
    if (high && this.sun.shadow.mapSize.x !== 2048) {
      this.sun.shadow.mapSize.set(2048, 2048);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.resize?.();
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
    this.scene.add(deco);
  }

  buildPools() {
    this.itemGroup = new THREE.Group();
    this.scene.add(this.itemGroup);
    this.applePool = new Pool(this.itemGroup, M.itemGeometry('apple'), 600);
    this.productPools = LINES.map((l) => new Pool(this.itemGroup, M.itemGeometry(l.id), 260));

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
    this.feeder = new Belt([[feedStart + 0.1, FEED_Z], [0, FEED_Z], [0, zLast]], 0.42);
    this.collector = new Belt([[21.5, zLast], [21.5, FEED_Z], [DEPOT_IN, FEED_Z]], 0.56, 4.8);
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

    // ---- Magazijn: open hal met een lage westmuur, zodat je de band ziet binnenkomen ----
    const db = new M.Builder();
    const dw = DX1 - DX0;
    const dd = DZ1 - DZ0;
    db.box(dw, 0.3, dd, 0xd9dcdf, DEPOT.x, 0, DEPOT.z);
    for (let x = DX0 + 2.25; x < DX1; x += 2.25) db.box(0.04, 0.02, dd, 0xc4c8cc, x, 0.3, DEPOT.z);
    // looproute van de heftruck
    db.box(0.12, 0.03, dd - 2, M.C.yellow, DX1 - 2.25, 0.3, DEPOT.z + 0.6);
    db.box(0.12, 0.03, dd - 2, M.C.yellow, DX1 - 4.1, 0.3, DEPOT.z + 0.6);
    const dwh = 3.6;
    db.box(dw + 0.3, dwh, 0.3, 0xe9e4da, DEPOT.x, 0.3, DZ0);
    db.box(dw + 0.32, 0.35, 0.34, M.C.red, DEPOT.x, 0.3 + dwh, DZ0);
    for (let x = DX0 + 2.4; x < DX1 - 1; x += 3.2) db.box(1.6, 0.9, 0.34, M.C.glass, x, 2.0, DZ0);
    // lage westmuur met opening voor de verzamelband
    const lw = 1.0;
    const w1 = FEED_Z - 0.85 - DZ0;
    db.box(0.3, lw, w1, 0xe9e4da, DX0, 0.3, DZ0 + w1 / 2);
    const w2 = DZ1 - (FEED_Z + 0.85);
    db.box(0.3, lw, w2, 0xe9e4da, DX0, 0.3, FEED_Z + 0.85 + w2 / 2);
    db.box(0.34, 0.12, w1, M.C.red, DX0, 0.3 + lw, DZ0 + w1 / 2);
    db.box(0.34, 0.12, w2, M.C.red, DX0, 0.3 + lw, FEED_Z + 0.85 + w2 / 2);
    db.box(0.5, dwh + 0.5, 0.5, M.C.red, DX0, 0, DZ0);
    db.box(0.5, dwh + 0.5, 0.5, M.C.red, DX1, 0, DZ0);
    // bord op de achterwand
    db.box(4.2, 1.0, 0.12, M.C.white, DEPOT.x + 1.6, 2.6, DZ0 + 0.2);
    db.ico(0.4, M.C.apple, DEPOT.x, 3.1, DZ0 + 0.3, { sz: 0.3 });
    db.box(2.4, 0.18, 0.05, M.C.red, DEPOT.x + 2.1, 3.25, DZ0 + 0.28);
    db.box(2.0, 0.18, 0.05, M.C.red, DEPOT.x + 1.9, 2.85, DZ0 + 0.28);
    // inpaktafel waar de verzamelband eindigt
    db.box(1.5, 0.75, 1.4, M.C.metalDark, DEPOT_IN + 0.45, 0.3, FEED_Z);
    for (let k = 0; k < 4; k++) db.cyl(0.07, 1.3, M.C.metal, DEPOT_IN - 0.1 + k * 0.35, 1.0, FEED_Z - 0.65, { seg: 6, rx: Math.PI / 2 });
    // laadplein naar de weg
    db.box(ROAD_X - 2.45 - DX1, 0.17, dd, M.C.road, (DX1 + ROAD_X - 2.45) / 2, 0, DEPOT.z);
    for (let k = 0; k < 6; k++) db.box(4.6, 0.02, 0.1, 0xffffff, DX1 + 2.6, 0.17, dockZ(k) + 1.55);
    const depot = db.mesh({ receive: true });
    depot.receiveShadow = true;
    g.add(depot);
    const rail = M.guardRail(dw - 0.6);
    rail.position.set(DX0 + 0.3, 0.3, DZ1);
    g.add(rail);
    // stellingen; de kratten erin laten zien hoe vol het magazijn is
    this.storeCrates = [];
    const racks = [[DX0 + 0.5, DZ0 + 0.9, 4], [DX0 + 0.5, 5.6, 4], [DX0 + 0.5, 10.6, 4]];
    for (const [x, z, bays] of racks) {
      const r = M.palletRack(bays);
      r.position.set(x, 0.3, z);
      g.add(r);
    }
    for (let lvl = 0; lvl < 3; lvl++) {
      for (const [x, z, bays] of racks) {
        for (let bay = 0; bay < bays; bay++) {
          const c = M.shelfCrate(bay + lvl * 3);
          c.position.set(x + 0.55 + bay * 1.1, 0.3 + 0.11 + lvl * 0.85, z);
          c.visible = false;
          g.add(c);
          this.storeCrates.push(c);
        }
      }
    }
    // laaddeuren met een pallet die klaarstaat voor de vrachtwagen
    this.docks = [];
    for (let k = 0; k < 6; k++) {
      const door = M.dockDoor();
      door.position.set(DX1, 0.3, dockZ(k));
      g.add(door);
      const p = M.pallet(0xc9b28a);
      p.scale.set(1, 0.17, 1);
      p.position.set(DX1 - 1.3, 0.3, dockZ(k));
      g.add(p);
      const crates = [];
      for (let c = 0; c < 4; c++) {
        const cb = new M.Builder();
        cb.box(0.55, 0.5, 0.55, c % 2 ? M.C.wood : 0xd29a62, 0, 0, 0);
        cb.ico(0.11, M.C.apple, 0, 0.52, 0);
        const m = cb.mesh();
        m.position.set(DX1 - 1.3 + (c % 2 ? 0.28 : -0.28), 0.5 + Math.floor(c / 2) * 0.52, dockZ(k) + (c % 2 ? 0.28 : -0.28) * (c < 2 ? 1 : -1));
        m.visible = false;
        g.add(m);
        crates.push(m);
      }
      this.docks.push({ door, pallet: p, crates, staged: 0, userData: door.userData });
    }
    const sh = M.hitBox(dw + 7, 5, dd, DEPOT.x + 3.5, 0, DEPOT.z);
    sh.userData.station = { kind: 'sales' };
    g.add(sh);
    this.hits.push(sh);

    const fork = M.forklift();
    g.add(fork);
    this.forklift = new PathMover(fork, [[DEPOT_IN + 1.6, 1.4], [DX1 - 2.6, 1.4], [DX1 - 2.6, 15], [DX1 - 3.7, 15], [DX1 - 3.7, 2.2], [DEPOT_IN + 1.6, 2.2]], 2.2,
      { stops: { 0: 1.0, 2: 1.0 }, y: 0.3 });

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

    this.builtTier = tier;
    this.builtSlots = slots;
    this.zEnd = zEnd;
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

    // vrachtwagens: één per open laadplek
    this.state = state;
    this.truckCap = truckCapacity(state);
    const trucks = truckCount(state.sales);
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
      const n = Math.round(sf * this.storeCrates.length);
      this.storeCrates.forEach((c, k) => { c.visible = k < n; });
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
        let v = r <= 2.5 ? r : 2.5 + Math.log2(r / 2.5) * 0.5;
        v = Math.min(v, 4);
        sum += v;
        return v;
      });
      // de verzamelband houdt zo ruim de helft vrij, zodat elke lijn kan invoegen
      const scale = sum > 3.6 ? 3.6 / sum : 1;
      let feed = 0;
      LINES.forEach((l, i) => {
        const o = this.lineObjs[i];
        if (!o) return;
        const r = rateOf(i);
        o.vis = vis[i] * scale;
        o.batch = o.vis > 0 ? r / o.vis : 1;
        o.k = Math.max(1, Math.min(l.apples, Math.floor(4 / Math.max(o.vis, 0.01))));
        o.base = Math.min(1.5, 0.25 + Math.log10(1 + r) / 2);
        feed += o.vis * o.k;
      });
      if (feed > 6.5) {
        const f = 6.5 / feed;
        feed = 0;
        this.lineObjs.forEach((o) => { if (o) { o.k = Math.max(1, Math.floor(o.k * f)); feed += o.vis * o.k; } });
      }
      this.feedRate = 0;
      this.lineObjs.forEach((o, i) => { if (o && !this.lineFlows[i].input.full()) this.feedRate += o.vis * o.k; });
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
    const obj = M.truck(colors[k % colors.length], k);
    this.scene.add(obj);
    const z = dockZ(k);
    const park = DX1 + 2.45;
    const path = [[park, z], [ROAD_X - 0.5, z], [ROAD_X - 0.5, 85], [ROAD_X + 3.5, 85], [ROAD_X + 3.5, z], [park + 4.5, z]];
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
    const s = Math.max(hw, hh) * 1.15;
    const sc = this.sun.shadow.camera;
    if (sc.right !== s) {
      sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 1; sc.far = 220;
      sc.updateProjectionMatrix();
    }
    this.sun.position.copy(this.target).add(new THREE.Vector3(-30, 70, 40));
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
    if (p) this.goal = p.clone().setY(0);
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
      this.target.lerp(this.goal, Math.min(1, dt * 2.5));
      if (this.target.distanceTo(this.goal) < 0.05) this.goal = null;
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
    this.updateBelts(dt);
    this.lineObjs.forEach((o) => {
      if (!o) return;
      const act = o.activity;
      o.machine.anim(t + o.phase, act);
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
      const sn = open ? Math.ceil(ready * 4 - 0.05) : 0;
      d.crates.forEach((c, j) => { c.visible = j < sn; });
      d.pallet.visible = open;
    });

    // plukkers
    for (const p of this.pickers) this.updatePicker(p, dt);
    // appels in manden laten zien bij plukkers
    this.applePool.end();
    this.productPools.forEach((p) => p.end());

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
      const n = Math.round(full * 8);
      tr.obj.userData.cargo.forEach((c, j) => { c.visible = j < n; });
    });
    if (this.forklift) this.forklift.update(dt);

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

    this.renderer.render(this.scene, this.camera);
  }

  // Het bandennetwerk: toevoerband -> lijnen -> machines -> verzamelband -> magazijn.
  updateBelts(dt) {
    if (!this.feeder) return;
    // Is de appelbak vol, dan duwt hij zoveel appels op de band als erop past: de band loopt vol
    // en de appels wachten voor de machines. Anders komen er precies zoveel als de machines vragen.
    const push = this.binFull;
    this.feedTimer = Math.min(2, this.feedTimer + dt * (push ? 12 : this.feedRate));
    if (this.feedTimer >= 1 && this.feeder.canInsert(0)) {
      this.feeder.insert({ d: 0, pool: this.applePool });
      this.feedTimer -= 1;
    }
    this.feeder.update(dt, () => false);
    const holds = [];
    this.lineObjs.forEach((o, i) => {
      if (!o) return;
      const f = this.lineFlows[i];
      // appels afslaan van de toevoerband naar deze lijn
      o.want = Math.min(2, o.want + o.vis * dt);
      if ((o.want >= 1 || push) && f.input.canInsert(0)) {
        const it = this.feeder.takeNear(this.feedJoin(i));
        if (it) { it.d = 0; f.input.insert(it); o.want = Math.max(0, o.want - 1); }
      }
      const k = o.k || 1;
      f.input.update(dt, () => { if (o.held < k) { o.held++; return true; } return false; });
      // de machine maakt een product van k appels, als er plek is op de band erna
      let running = false;
      if (o.held >= k && o.vis > 0) {
        o.prog += dt * o.vis;
        running = true;
        if (o.prog >= 1) {
          if (f.output.canInsert(0)) {
            f.output.insert({ d: 0, pool: this.productPools[i] });
            o.held -= k;
            o.prog = 0;
          } else { o.prog = 1; running = false; }
        }
      }
      o.activity = running ? o.base : 0;
      let waiting = false;
      f.output.update(dt, (it) => {
        const d = this.colJoin(i);
        if (!this.collector.canInsert(d)) { waiting = true; return false; }
        it.d = d;
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
