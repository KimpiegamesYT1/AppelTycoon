// Low-poly modellen. Statische delen worden samengevoegd tot één mesh met vertex-kleuren,
// zodat de scène ook op telefoons weinig draw calls kost.
import * as THREE from '../vendor/three.module.min.js';

export const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const GLOW = new THREE.MeshBasicMaterial({ color: 0xffa646 });
export const HIT = new THREE.MeshBasicMaterial({ visible: false });

export const C = {
  grass: 0x8fd16a, grassDark: 0x79be58, trunk: 0x8a5a33, leaf: 0x5dbb4c, leaf2: 0x74cc57, leaf3: 0x4aa542,
  apple: 0xe53935, appleGold: 0xffc928, wood: 0xc68e57, woodDark: 0x9c6a3c, metal: 0xb9c2cc, metalDark: 0x6f7a86,
  yellow: 0xffc43d, orange: 0xff8a3d, white: 0xf4f1ea, dark: 0x3a4250, belt: 0x454c58, red: 0xd9473b,
  blue: 0x3d7bd9, skin: 0xf2c49b, concrete: 0xcfd3d8, road: 0x5b6270, glass: 0x8fd3ff,
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

const cache = new Map();
function geo(key, make) {
  if (!cache.has(key)) {
    const g = make();
    g.userData.shared = true;
    cache.set(key, g);
  }
  return cache.get(key);
}

const unitBox = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
const unitCyl = (seg, top = 1) => geo(`cyl${seg}:${top}`, () => new THREE.CylinderGeometry(top, 1, 1, seg).translate(0, 0.5, 0));
const unitIco = (detail) => geo(`ico${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
const unitSphere = (w, h) => geo(`sph${w}:${h}`, () => new THREE.SphereGeometry(1, w, h));

export class Builder {
  constructor() { this.parts = []; }

  add(g, color, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.parts.push({ g, color: new THREE.Color(color), m: _m.clone() });
    return this;
  }

  // y = onderkant
  box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    return this.add(unitBox(), color, x, y, z, w, h, d, rx, ry, rz);
  }

  cyl(r, h, color, x = 0, y = 0, z = 0, { seg = 8, top = 1, rx = 0, ry = 0, rz = 0 } = {}) {
    return this.add(unitCyl(seg, top), color, x, y, z, r, h, r, rx, ry, rz);
  }

  cone(r, h, color, x = 0, y = 0, z = 0, seg = 8) {
    return this.add(unitCyl(seg, 0), color, x, y, z, r, h, r);
  }

  ico(r, color, x = 0, y = 0, z = 0, { detail = 0, sx = 1, sy = 1, sz = 1, ry = 0 } = {}) {
    return this.add(unitIco(detail), color, x, y, z, r * sx, r * sy, r * sz, 0, ry, 0);
  }

  sphere(r, color, x = 0, y = 0, z = 0, { w = 8, h = 6, sx = 1, sy = 1, sz = 1 } = {}) {
    return this.add(unitSphere(w, h), color, x, y, z, r * sx, r * sy, r * sz);
  }

  geometry() {
    let count = 0;
    const list = this.parts.map((p) => {
      const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      g.applyMatrix4(p.m);
      count += g.attributes.position.count;
      return g;
    });
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    let o = 0;
    list.forEach((g, i) => {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      const c = this.parts[i].color;
      for (let k = 0; k < n; k++) {
        col[(o + k) * 3] = c.r;
        col[(o + k) * 3 + 1] = c.g;
        col[(o + k) * 3 + 2] = c.b;
      }
      o += n;
      g.dispose();
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  mesh({ shadow = true, receive = false } = {}) {
    const m = new THREE.Mesh(this.geometry(), MAT);
    m.castShadow = shadow;
    m.receiveShadow = receive;
    return m;
  }
}

// ---------- Kleine hulpjes ----------

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function hitBox(w, h, d, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(unitBox(), HIT);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

// ---------- Natuur ----------

export function treeGeometry(variant) {
  const r = rng(variant * 97 + 13);
  const b = new Builder();
  const leaf = [C.leaf, C.leaf2, C.leaf3][variant % 3];
  b.cyl(0.16, 1.1, C.trunk, 0, 0, 0, { seg: 6, top: 0.7 });
  b.ico(0.95, leaf, 0, 1.75, 0, { sy: 0.9 });
  b.ico(0.65, leaf, 0.45, 2.25, -0.2, { sy: 0.9 });
  b.ico(0.55, leaf, -0.45, 2.0, 0.35);
  // appels op het oppervlak van de grote bladerbol, iets erin gedrukt
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const h = -0.5 + r() * 1.0;
    const c = Math.cos(h);
    b.ico(0.13, C.apple, Math.cos(a) * c * 0.88, 1.75 + Math.sin(h) * 0.8, Math.sin(a) * c * 0.88);
  }
  return b.geometry();
}

export function bush(seed = 1) {
  const r = rng(seed);
  const b = new Builder();
  for (let i = 0; i < 3; i++) b.ico(0.35 + r() * 0.25, i % 2 ? C.leaf2 : C.leaf, (r() - 0.5) * 0.8, 0.25, (r() - 0.5) * 0.8);
  return b.mesh();
}

export function rock(seed = 1) {
  const r = rng(seed);
  const b = new Builder();
  b.ico(0.4 + r() * 0.3, 0x9aa3ad, 0, 0.15, 0, { sy: 0.6, ry: r() * 3 });
  return b.mesh();
}

// ---------- Mensen & voertuigen ----------

export function person(shirt = C.red, cap = C.blue, { basket = false, helmet = false } = {}) {
  const b = new Builder();
  b.cyl(0.24, 0.5, 0x37415a, 0, 0, 0, { seg: 8 });
  b.cyl(0.27, 0.45, shirt, 0, 0.45, 0, { seg: 8, top: 0.85 });
  b.sphere(0.22, C.skin, 0, 1.12, 0);
  if (helmet) {
    b.sphere(0.24, C.yellow, 0, 1.2, 0, { sy: 0.7 });
    b.box(0.5, 0.04, 0.5, C.yellow, 0, 1.14, 0);
  } else {
    b.cyl(0.23, 0.14, cap, 0, 1.22, 0, { seg: 8, top: 0.9 });
    b.box(0.22, 0.04, 0.22, cap, 0, 1.22, 0.24);
  }
  if (basket) {
    b.cyl(0.2, 0.2, C.woodDark, 0, 0.55, 0.32, { seg: 7, top: 1.2 });
    b.ico(0.08, C.apple, 0.05, 0.78, 0.32);
    b.ico(0.08, C.apple, -0.07, 0.77, 0.27);
  }
  const g = new THREE.Group();
  const body = b.mesh();
  g.add(body);
  g.userData.body = body;
  return g;
}

// Vrachtwagen met open laadbak; de kratten in de bak zijn losse delen die je per stuk
// kunt tonen terwijl de vrachtwagen geladen wordt (userData.cargo).
export function truck(color = C.red, seed = 1) {
  const g = new THREE.Group();
  const b = new Builder();
  // lokaal: rijrichting +x
  b.box(4.4, 0.35, 1.7, C.dark, 0, 0.35, 0);
  b.box(1.3, 1.3, 1.75, color, 1.6, 0.7, 0);
  b.box(0.05, 0.5, 1.45, C.glass, 2.26, 1.3, 0);
  b.box(0.8, 0.5, 0.05, C.glass, 1.6, 1.3, 0.88);
  b.box(0.8, 0.5, 0.05, C.glass, 1.6, 1.3, -0.88);
  b.box(1.32, 0.12, 1.77, 0xffffff, 1.6, 2.0, 0);
  // laadvloer met lage zijwanden, achterkant open
  b.box(3.0, 0.15, 1.8, C.woodDark, -0.65, 0.7, 0);
  b.box(3.0, 0.45, 0.08, color, -0.65, 0.85, 0.88);
  b.box(3.0, 0.45, 0.08, color, -0.65, 0.85, -0.88);
  b.box(0.1, 0.9, 1.8, color, 0.82, 0.85, 0);
  b.ico(0.3, C.apple, -0.65, 1.07, 0.93, { sz: 0.25 });
  b.ico(0.3, C.apple, -0.65, 1.07, -0.93, { sz: 0.25 });
  for (const x of [1.45, -0.5, -1.5]) {
    for (const z of [0.8, -0.8]) b.cyl(0.36, 0.3, 0x222831, x, 0.36, z - 0.15 * Math.sign(z), { seg: 10, rx: Math.PI / 2 });
  }
  b.box(0.08, 0.2, 0.3, 0xfff3b0, 2.26, 0.75, 0.6);
  b.box(0.08, 0.2, 0.3, 0xfff3b0, 2.26, 0.75, -0.6);
  b.box(0.06, 0.15, 0.3, 0xff4d4d, -2.2, 0.6, 0.6);
  b.box(0.06, 0.15, 0.3, 0xff4d4d, -2.2, 0.6, -0.6);
  g.add(b.mesh());
  // 8 kratten: 2 rijen van 4 langs de laadbak
  const cargo = [];
  for (let k = 0; k < 8; k++) {
    const cb = new Builder();
    cb.box(0.62, 0.55, 0.72, k % 3 ? C.wood : 0xd29a62, 0, 0, 0);
    cb.ico(0.12, C.apple, -0.12, 0.56, 0.1);
    cb.ico(0.12, C.apple, 0.14, 0.57, -0.08);
    const m = cb.mesh();
    m.position.set(0.35 - Math.floor(k / 2) * 0.72, 0.78, k % 2 ? 0.4 : -0.4);
    m.visible = false;
    g.add(m);
    cargo.push(m);
  }
  g.userData.cargo = cargo;
  return g;
}

export function forklift() {
  const b = new Builder();
  b.box(1.4, 0.6, 1.0, C.yellow, 0, 0.25, 0);
  b.box(0.7, 0.9, 0.9, C.yellow, -0.3, 0.85, 0);
  b.box(0.08, 0.7, 0.08, C.dark, -0.05, 1.75, 0.4);
  b.box(0.08, 0.7, 0.08, C.dark, -0.05, 1.75, -0.4);
  b.box(0.55, 0.06, 0.9, C.dark, -0.3, 2.45, 0);
  b.box(0.12, 2.0, 0.12, C.dark, 0.78, 0.2, 0.32);
  b.box(0.12, 2.0, 0.12, C.dark, 0.78, 0.2, -0.32);
  b.box(0.9, 0.06, 0.12, C.metalDark, 1.2, 0.3, 0.25);
  b.box(0.9, 0.06, 0.12, C.metalDark, 1.2, 0.3, -0.25);
  b.box(0.8, 0.6, 0.8, C.wood, 1.25, 0.36, 0);
  b.ico(0.13, C.apple, 1.1, 1.0, 0.15);
  b.ico(0.13, C.apple, 1.35, 1.0, -0.1);
  for (const x of [0.45, -0.45]) for (const z of [0.5, -0.5]) b.cyl(0.22, 0.2, 0x222831, x, 0.22, z - 0.1 * Math.sign(z), { seg: 8, rx: Math.PI / 2 });
  b.sphere(0.18, C.skin, -0.35, 1.45, 0);
  b.sphere(0.2, C.yellow, -0.35, 1.55, 0, { sy: 0.6 });
  return b.mesh();
}

export function car(color, seed = 1) {
  const b = new Builder();
  b.box(2.2, 0.55, 1.1, color, 0, 0.25, 0);
  b.box(1.2, 0.45, 1.0, color, -0.15, 0.8, 0);
  b.box(1.1, 0.35, 1.02, C.glass, -0.15, 0.85, 0);
  for (const x of [0.7, -0.7]) for (const z of [0.5, -0.5]) b.cyl(0.22, 0.15, 0x222831, x, 0.22, z, { seg: 8, rx: Math.PI / 2 });
  return b.mesh();
}

// ---------- Fabrieksonderdelen ----------

let beltTexture = null;
export function getBeltTexture() {
  if (beltTexture) return beltTexture;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#3b414c'; g.fillRect(0, 0, 64, 16);
  g.fillStyle = '#525a67';
  for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 6, 16);
  beltTexture = new THREE.CanvasTexture(c);
  beltTexture.wrapS = beltTexture.wrapT = THREE.RepeatWrapping;
  beltTexture.colorSpace = THREE.SRGBColorSpace;
  return beltTexture;
}
let beltMat = null;

// Lopende band langs lokale +x, van x=0 tot x=length; bovenkant op y=0.81.
// Zijkanten: 'pos' = lokale +z, 'neg' = lokale -z. Leuningen kunnen per kant uit,
// of onderbroken worden (gaps: [[van, tot], ...]) waar een andere band aansluit.
export function conveyor(length, { width = 0.8, railPos = true, railNeg = true, gapsPos = [], gapsNeg = [], legs = true } = {}) {
  const group = new THREE.Group();
  const b = new Builder();
  const hw = width / 2;
  // zijprofielen onder het bandoppervlak
  b.box(length, 0.2, 0.08, C.metalDark, length / 2, 0.6, hw + 0.04);
  b.box(length, 0.2, 0.08, C.metalDark, length / 2, 0.6, -hw - 0.04);
  b.box(length, 0.06, width, 0x2e333c, length / 2, 0.68, 0);
  // eindrollen
  b.cyl(0.1, width + 0.06, C.metal, 0.05, 0.72, -(width + 0.06) / 2, { seg: 8, rx: Math.PI / 2 });
  b.cyl(0.1, width + 0.06, C.metal, length - 0.05, 0.72, -(width + 0.06) / 2, { seg: 8, rx: Math.PI / 2 });
  const rail = (z, gaps) => {
    let x = 0;
    const cuts = [...gaps].sort((p, q) => p[0] - q[0]);
    for (const [g0, g1] of [...cuts, [length, length]]) {
      const x1 = Math.min(g0, length);
      if (x1 - x > 0.05) {
        b.box(x1 - x, 0.12, 0.07, C.yellow, (x + x1) / 2, 0.86, z);
        for (let px = x + 0.1; px < x1; px += 1.6) b.box(0.06, 0.1, 0.06, C.yellow, px, 0.78, z);
      }
      x = Math.max(x, g1);
    }
  };
  if (railPos) rail(hw + 0.06, gapsPos);
  if (railNeg) rail(-hw - 0.06, gapsNeg);
  if (legs) {
    for (let x = 0.4; x < length - 0.1; x += 1.8) {
      b.box(0.08, 0.5, 0.08, C.metalDark, x, 0, hw);
      b.box(0.08, 0.5, 0.08, C.metalDark, x, 0, -hw);
      b.box(0.08, 0.06, width, C.metalDark, x, 0.25, 0);
    }
  }
  const frame = b.mesh();
  frame.receiveShadow = true;
  group.add(frame);
  if (!beltMat) beltMat = new THREE.MeshLambertMaterial({ map: getBeltTexture() });
  const pg = new THREE.PlaneGeometry(length, width);
  const uv = pg.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * length);
  pg.rotateX(-Math.PI / 2);
  const top = new THREE.Mesh(pg, beltMat);
  top.position.set(length / 2, 0.81, 0);
  top.receiveShadow = true;
  group.add(top);
  return group;
}

// Hoekstuk tussen twee banden (niet gedraaid). sides: welke buitenkanten een leuning krijgen: 'n','e','s','w'.
export function beltCorner(sides, width = 0.8) {
  const b = new Builder();
  const hw = width / 2 + 0.08;
  b.box(width + 0.16, 0.26, width + 0.16, C.metalDark, 0, 0.55, 0);
  b.box(width, 0.04, width, 0x3b414c, 0, 0.79, 0);
  for (let i = 0; i < 3; i++) b.cyl(0.06, width, C.metal, -0.25 + i * 0.25, 0.76, -width / 2, { seg: 6, rx: Math.PI / 2 });
  if (sides.includes('n')) b.box(width + 0.16, 0.12, 0.07, C.yellow, 0, 0.86, -hw + 0.02);
  if (sides.includes('s')) b.box(width + 0.16, 0.12, 0.07, C.yellow, 0, 0.86, hw - 0.02);
  if (sides.includes('w')) b.box(0.07, 0.12, width + 0.16, C.yellow, -hw + 0.02, 0.86, 0);
  if (sides.includes('e')) b.box(0.07, 0.12, width + 0.16, C.yellow, hw - 0.02, 0.86, 0);
  b.box(0.1, 0.55, 0.1, C.metalDark, 0, 0, 0);
  return b.mesh();
}

// Palletstelling met drie verdiepingen; bays = aantal vakken naast elkaar (langs x).
export function palletRack(bays) {
  const b = new Builder();
  const bw = 1.1;
  for (let i = 0; i <= bays; i++) {
    b.box(0.1, 2.6, 0.1, C.blue, i * bw, 0, -0.45);
    b.box(0.1, 2.6, 0.1, C.blue, i * bw, 0, 0.45);
  }
  for (const y of [0.05, 0.9, 1.75]) {
    b.box(bays * bw + 0.1, 0.08, 0.1, C.orange, (bays * bw) / 2, y, -0.45);
    b.box(bays * bw + 0.1, 0.08, 0.1, C.orange, (bays * bw) / 2, y, 0.45);
    b.box(bays * bw, 0.04, 0.9, 0xc9b28a, (bays * bw) / 2, y + 0.06, 0);
  }
  return b.mesh();
}

// Laaddeur met een rolluik dat open (omhoog) of dicht kan.
export function dockDoor() {
  const g = new THREE.Group();
  const b = new Builder();
  b.box(0.25, 3.0, 0.25, C.metalDark, 0, 0, -1.35);
  b.box(0.25, 3.0, 0.25, C.metalDark, 0, 0, 1.35);
  b.box(0.3, 0.45, 2.95, C.metalDark, 0, 3.0, 0);
  b.box(0.6, 0.18, 2.6, 0x2b2f3a, 0.35, 0.3, 0);
  for (const z of [-1.1, 1.1]) b.box(0.25, 0.4, 0.3, 0xffc43d, 0.55, 0.2, z);
  g.add(b.mesh());
  const sb = new Builder();
  for (let i = 0; i < 6; i++) sb.box(0.08, 0.42, 2.5, i % 2 ? 0xd7dbe0 : 0xc3c8ce, 0, i * 0.44, 0);
  const shutter = sb.mesh();
  shutter.position.set(0.05, 0.3, 0);
  g.add(shutter);
  g.userData.shutter = shutter;
  const lb = new Builder();
  lb.box(0.12, 0.25, 0.25, 0x4cff7a, 0, 0, 0);
  const lamp = lb.mesh({ shadow: false });
  lamp.position.set(0.15, 3.25, -1.0);
  g.add(lamp);
  g.userData.lamp = lamp;
  return g;
}

export function crateStack(seed = 1, n = 4) {
  const r = rng(seed);
  const b = new Builder();
  for (let i = 0; i < n; i++) {
    const x = (i % 2) * 0.9 + (r() - 0.5) * 0.1;
    const z = Math.floor(i / 2) % 2 * 0.9;
    const y = Math.floor(i / 4) * 0.7;
    b.box(0.8, 0.7, 0.8, i % 3 ? C.wood : C.woodDark, x, y, z, (r() - 0.5) * 0.2);
    b.ico(0.12, C.apple, x - 0.15, y + 0.7, z);
    b.ico(0.12, C.apple, x + 0.15, y + 0.72, z + 0.1);
  }
  return b.mesh();
}

// Doos voor in de stelling: vult een vak zodat je goed ziet hoe vol het magazijn is.
export function shelfCrate(seed = 0) {
  const b = new Builder();
  const col = [0xe0ac6a, 0xd29a5a, 0xe8bb7a][seed % 3];
  b.box(0.92, 0.6, 0.78, col, 0, 0, 0);
  b.box(0.94, 0.1, 0.8, 0xa86f3a, 0, 0.18, 0);
  b.ico(0.13, C.apple, -0.2, 0.62, 0.08);
  b.ico(0.13, C.apple, 0.12, 0.63, -0.1);
  b.ico(0.12, 0x8ccf3f, 0.25, 0.62, 0.15);
  return b.mesh();
}

export function pallet(color = C.wood) {
  const b = new Builder();
  b.box(1.2, 0.15, 1.2, C.woodDark, 0, 0, 0);
  b.box(1.1, 0.9, 1.1, color, 0, 0.15, 0);
  b.box(1.12, 0.06, 0.15, C.red, 0, 0.6, 0);
  return b.mesh();
}

export function cone() {
  const b = new Builder();
  b.box(0.45, 0.06, 0.45, C.orange, 0, 0, 0);
  b.cone(0.18, 0.6, C.orange, 0, 0.06, 0, 8);
  b.cyl(0.12, 0.08, C.white, 0, 0.3, 0, { seg: 8, top: 0.85 });
  return b.mesh();
}

export function lamp() {
  const b = new Builder();
  b.cyl(0.08, 3.2, C.dark, 0, 0, 0, { seg: 6 });
  b.box(0.7, 0.08, 0.12, C.dark, 0.3, 3.15, 0);
  b.box(0.3, 0.12, 0.25, 0xfff6c2, 0.6, 3.05, 0);
  return b.mesh();
}

export function fence(length, color = C.wood) {
  const b = new Builder();
  b.box(length, 0.08, 0.06, color, length / 2, 0.45, 0);
  b.box(length, 0.08, 0.06, color, length / 2, 0.2, 0);
  for (let x = 0; x <= length + 0.01; x += 1.25) b.box(0.12, 0.65, 0.12, C.woodDark, x, 0, 0);
  return b.mesh();
}

export function guardRail(length) {
  const b = new Builder();
  b.box(length, 0.12, 0.1, C.yellow, length / 2, 0.55, 0);
  for (let x = 0; x <= length + 0.01; x += 2) b.box(0.12, 0.6, 0.12, C.yellow, x, 0, 0);
  return b.mesh();
}

// Open appelbak; de appelstapel is een los deel dat omhoog komt als de bak voller wordt.
export function appleBin() {
  const g = new THREE.Group();
  const b = new Builder();
  b.box(2.6, 0.15, 2.2, C.woodDark, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const y = 0.15 + i * 0.3;
    b.box(2.6, 0.26, 0.12, i % 2 ? C.wood : 0xd29a62, 0, y, 1.04);
    b.box(2.6, 0.26, 0.12, i % 2 ? C.wood : 0xd29a62, 0, y, -1.04);
    b.box(0.12, 0.26, 2.2, i % 2 ? C.wood : 0xd29a62, 1.24, y, 0);
    b.box(0.12, 0.26, 2.2, i % 2 ? C.wood : 0xd29a62, -1.24, y, 0);
  }
  for (const [x, z] of [[-1.24, -1.04], [1.24, -1.04], [-1.24, 1.04], [1.24, 1.04]]) b.box(0.18, 1.35, 0.18, C.woodDark, x, 0, z);
  b.box(0.15, 1.9, 0.15, C.woodDark, 1.5, 0, 1.25);
  b.box(1.0, 0.6, 0.08, C.white, 1.5, 1.8, 1.25);
  b.ico(0.2, C.apple, 1.5, 2.1, 1.32, { sz: 0.3 });
  const box = b.mesh();
  g.add(box);
  const h = new Builder();
  h.box(2.3, 0.2, 1.9, 0xb52d2a, 0, -0.2, 0);
  const r = rng(5);
  for (let i = 0; i < 26; i++) h.ico(0.17, i % 9 ? C.apple : 0x8ccf3f, (r() - 0.5) * 2.0, r() * 0.12, (r() - 0.5) * 1.6);
  const heap = h.mesh();
  g.add(heap);
  g.userData.heap = heap;
  return g;
}

// ---------- Machines per productielijn ----------
// Elke machine staat lokaal rond x=0 over de band (band loopt langs x, van -x naar +x).
// Geeft { group, anim(t, act, info) } terug. info.prog loopt per product van 0 naar 1, zodat
// stempels, deuren en armen precies bewegen als er een product uitkomt. info.status is
// 'run' | 'wait' | 'jam' voor de statuslamp, info.pop (1 -> 0) laat de machine even veren.

const LAMP_COLORS = { run: 0x4cff7a, wait: 0xffb020, jam: 0xff3b30 };

// handige vormen voor bewegende delen (elk een eigen mesh)
function partMesh(fn, x = 0, y = 0, z = 0, shadow = true) {
  const b = new Builder();
  fn(b);
  const m = b.mesh({ shadow });
  m.position.set(x, y, z);
  return m;
}

// 0 -> 1 -> 0 rond het einde van een productcyclus (stempelen, uitschuiven)
const stroke = (p, from = 0.72, to = 0.98) => (p < from ? 0 : p > to ? 0 : Math.sin(((p - from) / (to - from)) * Math.PI));

export function machine(id, color) {
  const g = new THREE.Group();
  const b = new Builder();
  let anim = () => {};
  const extra = [];   // per machine extra animaties

  // statuslamp op een paaltje
  const lampMat = new THREE.MeshBasicMaterial({ color: LAMP_COLORS.wait });
  const addLamp = (x, z, h = 2.4) => {
    b.cyl(0.05, h, C.metalDark, x, 0, z, { seg: 6 });
    b.cyl(0.13, 0.08, C.dark, x, h, z, { seg: 8 });
    const lamp = new THREE.Mesh(unitCyl(8), lampMat);
    lamp.scale.set(0.11, 0.2, 0.11);
    lamp.position.set(x, h + 0.08, z);
    g.add(lamp);
  };

  // stoom/rook: bolletjes die opstijgen en vervagen
  const steamParts = [];
  const steam = (x, y, z, n = 3, size = 0.22, col = 0xffffff) => {
    for (let i = 0; i < n; i++) {
      const m = partMesh((sb) => sb.ico(size, col, 0, 0, 0), x, y, z, false);
      m.userData = { x, y, z, phase: i / n };
      g.add(m);
      steamParts.push(m);
    }
  };
  const animSteam = (t, act) => {
    for (const s of steamParts) {
      const p = (t * 0.4 * (0.4 + act) + s.userData.phase) % 1;
      s.position.set(s.userData.x + p * 0.3, s.userData.y + p * 1.6, s.userData.z);
      const sc = act > 0.01 ? (0.4 + p) * (1 - p) * 2 : 0;
      s.scale.setScalar(sc);
    }
  };

  // bubbels in een ketel: groeien en knappen op het oppervlak
  const bubbles = (x, y, z, r, col, n = 4) => {
    const list = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const m = partMesh((bb) => bb.sphere(0.12, col, 0, 0, 0, { w: 6, h: 4 }), x + Math.cos(a) * r * 0.55, y, z + Math.sin(a) * r * 0.55, false);
      m.userData.phase = i / n;
      g.add(m);
      list.push(m);
    }
    extra.push((t, act) => {
      for (const m of list) {
        const p = (t * (0.6 + act * 1.5) + m.userData.phase) % 1;
        m.scale.setScalar(act > 0.01 ? Math.sin(p * Math.PI) * 1.1 : 0.0001);
      }
    });
  };

  // draaiend tandwiel aan de zijkant (laat zien dat de machine draait)
  const gear = (x, y, z, r = 0.32, col = C.metalDark, speed = 2) => {
    const m = partMesh((gb) => {
      gb.cyl(r, 0.1, col, 0, -0.05, 0, { seg: 10 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        gb.box(0.1, 0.1, 0.14, col, Math.cos(a) * r, -0.05, Math.sin(a) * r, -a);
      }
      gb.cyl(0.08, 0.14, C.yellow, 0, -0.07, 0, { seg: 6 });
    }, x, y, z);
    m.rotation.x = Math.PI / 2;
    g.add(m);
    extra.push((t, act) => { if (act > 0.01) m.rotation.y += 0.016 * speed * (0.5 + act * 2); });
    return m;
  };

  // klein bedieningspaneel met scherm
  const panel = (x, z, ry = 0) => {
    b.box(0.12, 0.9, 0.12, C.metalDark, x, 0, z);
    b.box(0.6, 0.45, 0.12, C.dark, x, 0.9, z, ry, -0.4);
    b.box(0.46, 0.3, 0.02, 0x3fb6ff, x, 0.97, z + 0.07 * Math.cos(ry), ry, -0.4);
  };

  let body = null;
  const finish = (fn) => {
    anim = (t, act, info = {}) => {
      const st = info.status || (act > 0.01 ? 'run' : 'wait');
      // lamp: groen als hij draait, oranje als hij wacht, rood knipperend als hij vastloopt
      const blink = st === 'jam' ? (Math.sin(t * 9) > 0 ? 1 : 0.25) : 1;
      lampMat.color.setHex(LAMP_COLORS[st]).multiplyScalar(blink);
      // even veren als er een product uitkomt
      if (body) {
        const pop = info.pop || 0;
        body.scale.set(1 + pop * 0.035, 1 - pop * 0.05, 1 + pop * 0.035);
      }
      for (const e of extra) e(t, act, info);
      fn(t, act, info.prog || 0);
    };
  };

  switch (id) {
    case 'fresh': {
      // sorteertafel met draaiende rollen, een portaal met grijparm en een kratje voor de appels
      b.box(3.2, 0.75, 1.7, C.metal, 0, 0, 0);
      b.box(3.3, 0.12, 1.8, C.metalDark, 0, 0.75, 0);
      for (const x of [-1.45, 1.45]) for (const z of [-0.75, 0.75]) b.box(0.15, 0.2, 0.15, C.dark, x, 0, z);
      b.box(3.2, 0.25, 0.08, C.yellow, 0, 0.87, 0.86);
      b.box(3.2, 0.25, 0.08, C.yellow, 0, 0.87, -0.86);
      const rollers = [];
      for (let k = 0; k < 9; k++) {
        const r = partMesh((rb) => {
          rb.cyl(0.08, 0.7, C.metalDark, 0, -0.35, 0, { seg: 6 });
          rb.box(0.04, 0.7, 0.17, C.metal, 0, -0.35, 0);
        }, -1.3 + k * 0.32, 1.0, -0.42);
        r.rotation.x = Math.PI / 2;
        g.add(r);
        rollers.push(r);
      }
      // portaal
      b.box(0.18, 2.4, 0.18, C.dark, -0.5, 0, 1.05);
      b.box(0.18, 2.4, 0.18, C.dark, -0.5, 0, -1.05);
      b.box(0.36, 0.3, 2.4, C.yellow, -0.5, 2.3, 0);
      b.box(0.4, 0.06, 2.45, C.dark, -0.5, 2.6, 0);
      const carriage = partMesh((cb) => {
        cb.box(0.5, 0.35, 0.45, C.orange, 0, 0, 0);
        cb.box(0.52, 0.06, 0.47, C.dark, 0, 0.35, 0);
      }, -0.5, 1.95, 0);
      g.add(carriage);
      const arm = partMesh((ab) => {
        ab.cyl(0.06, 0.9, C.metal, 0, -0.9, 0, { seg: 6 });
        ab.cyl(0.16, 0.12, C.dark, 0, -1.0, 0, { seg: 8 });
      }, 0, 0, 0);
      carriage.add(arm);
      // inpakkrat aan de voorkant met een stapeltje appels
      g.add(crateStack(3, 4).translateX(0.9).translateZ(1.35));
      const crate = partMesh((kb) => {
        kb.box(0.75, 0.45, 0.6, C.wood, 0, 0, 0);
        kb.box(0.77, 0.08, 0.62, C.woodDark, 0, 0.3, 0);
        kb.ico(0.13, C.apple, -0.15, 0.42, 0);
        kb.ico(0.13, C.apple, 0.15, 0.43, 0.05);
      }, -0.5, 0.25, 1.65);
      g.add(crate);
      panel(1.6, 1.3);
      addLamp(-1.5, -1.05, 2.2);
      finish((t, act, p) => {
        for (const r of rollers) if (act > 0.01) r.rotation.y += 0.25 * (0.4 + act);
        // de arm pakt bij het einde van elke cyclus een appel van de band en zet hem in het krat
        const k = act > 0.01 ? p : 0;
        carriage.position.z = k < 0.5 ? 0 : Math.sin(((k - 0.5) / 0.5) * Math.PI) * 1.2;
        arm.position.y = -Math.max(stroke(k, 0.25, 0.5), stroke(k, 0.62, 0.85)) * 0.55;
        crate.position.y = 0.25 + stroke(k, 0.8, 1) * 0.06;
      });
      break;
    }
    case 'juice': {
      // pers met stempel, trechter met appels, twee sapvaten met kijkglas en een vulkraan
      b.box(2.2, 0.3, 1.9, C.metalDark, 0, 0, 0);
      for (const x of [-0.9, 0.9]) for (const z of [-0.78, 0.78]) b.box(0.22, 2.7, 0.22, C.metal, x, 0, z);
      b.box(2.3, 0.45, 1.95, C.yellow, 0, 2.65, 0);
      b.box(2.32, 0.08, 1.97, C.dark, 0, 3.1, 0);
      // trechter boven op de pers
      b.cyl(0.55, 0.7, C.metal, 0, 3.15, 0, { seg: 8, top: 1.6 });
      for (let k = 0; k < 6; k++) b.ico(0.16, k % 2 ? C.apple : 0x8ccf3f, Math.cos(k) * 0.4, 3.85, Math.sin(k) * 0.4);
      // sapvaten
      for (const [x, col] of [[-0.2, C.yellow], [1.3, 0xffe08a]]) {
        b.cyl(0.62, 2.2, col, x, 0, -1.9, { seg: 12 });
        b.sphere(0.62, col, x, 2.2, -1.9, { sy: 0.45, w: 12 });
        b.box(0.24, 1.3, 0.06, C.dark, x, 0.45, -1.29);
        for (let r = 0; r < 3; r++) b.box(0.66, 0.06, 0.66, C.metalDark, x, 0.3 + r * 0.7, -1.9);
      }
      b.cyl(0.08, 1.5, C.metal, 0.55, 1.7, -1.25, { seg: 6, rz: Math.PI / 2 });
      b.cyl(0.08, 0.9, C.metal, -0.2, 1.7, -1.25, { seg: 6, rx: Math.PI / 2 });
      // sapniveau achter het kijkglas
      const levels = [-0.2, 1.3].map((x) => {
        const m = partMesh((lb) => lb.box(0.16, 1, 0.03, 0xff9f1a, 0, 0, 0), x, 0.48, -1.25, false);
        g.add(m);
        return m;
      });
      // stempel
      const piston = partMesh((pb) => {
        pb.cyl(0.14, 1.0, C.metal, 0, 0, 0, { seg: 8 });
        pb.box(1.5, 0.22, 1.3, C.metalDark, 0, -0.22, 0);
        pb.box(1.3, 0.06, 1.1, C.yellow, 0, -0.28, 0);
      }, 0, 1.7, 0);
      g.add(piston);
      // vulkraan bij de uitgang
      const nozzle = partMesh((nb) => {
        nb.cyl(0.07, 0.5, C.metal, 0, 0, 0, { seg: 6 });
        nb.cone(0.12, 0.18, C.dark, 0, -0.15, 0, 6);
      }, 1.35, 1.2, 0);
      g.add(nozzle);
      b.box(0.16, 1.9, 0.16, C.metalDark, 1.35, 0, 0.75);
      b.box(0.16, 0.16, 0.8, C.metalDark, 1.35, 1.75, 0.35);
      gear(-1.12, 1.6, 0.4, 0.3);
      addLamp(-1.05, 1.0, 2.3);
      finish((t, act, p) => {
        const k = act > 0.01 ? p : 0;
        // stempel gaat langzaam omhoog en slaat aan het eind van elke cyclus neer
        piston.position.y = 1.55 + (act > 0.01 ? 0.5 * (1 - stroke(k, 0.7, 0.95)) : 0.5);
        nozzle.position.y = 1.2 - stroke(k, 0.4, 0.75) * 0.35;
        levels.forEach((m, j) => {
          const f = 0.55 + Math.sin(t * 0.8 + j * 2) * 0.25 * (act > 0.01 ? 1 : 0.2);
          m.scale.y = f;
          m.position.y = 0.48 - (1 - f) * 0.5 + 0.0;
        });
      });
      break;
    }
    case 'sauce': {
      // ketel op een vuurtje, roerarm, bubbelend appelmoes en een vulmachine voor potjes
      b.box(2.8, 0.3, 2.6, C.metalDark, 0, 0, -1.3);
      for (let k = 0; k < 4; k++) b.box(0.18, 0.5, 0.18, C.dark, Math.cos(k * 1.57 + 0.78) * 0.9, 0.3, -1.4 + Math.sin(k * 1.57 + 0.78) * 0.9);
      b.cyl(1.0, 1.3, C.metal, 0, 0.75, -1.4, { seg: 14, top: 1.12 });
      b.cyl(1.17, 0.14, C.metalDark, 0, 2.0, -1.4, { seg: 14 });
      b.cyl(0.98, 0.05, 0xf6e7b0, 0, 1.92, -1.4, { seg: 14 });
      b.box(0.5, 0.12, 0.12, C.metalDark, 1.25, 1.6, -1.4);
      // roerportaal
      b.box(0.15, 2.9, 0.15, C.dark, 1.15, 0, -0.35);
      b.box(1.3, 0.15, 0.15, C.dark, 0.55, 2.8, -0.35);
      b.box(0.15, 0.15, 1.1, C.dark, 0, 2.8, -0.9);
      b.box(0.4, 0.35, 0.4, C.blue, 0, 2.95, -1.4);
      // vuur onder de ketel
      const fire = new THREE.Mesh(unitCyl(8), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
      fire.scale.set(0.75, 0.25, 0.75);
      fire.position.set(0, 0.35, -1.4);
      g.add(fire);
      const paddle = partMesh((sb) => {
        sb.box(0.1, 1.3, 0.1, C.dark, 0, -1.25, 0);
        sb.box(0.75, 0.3, 0.08, C.metalDark, 0, -1.2, 0);
      }, 0, 2.8, -1.4);
      g.add(paddle);
      bubbles(0, 1.97, -1.4, 0.95, 0xe8cf7d, 5);
      // vulmachine boven de band
      b.box(0.9, 0.9, 1.4, color, 0.9, 1.3, 0);
      b.box(0.92, 0.12, 1.42, C.dark, 0.9, 2.2, 0);
      b.box(0.15, 1.3, 0.15, C.metalDark, 0.55, 0, 0.6);
      b.box(0.15, 1.3, 0.15, C.metalDark, 1.25, 0, 0.6);
      b.cyl(0.08, 1.0, C.metal, 0.4, 1.9, -0.6, { seg: 6, rz: 0.9 });
      const filler = partMesh((fb) => {
        fb.cyl(0.12, 0.45, C.metal, 0, 0, 0, { seg: 8 });
        fb.cone(0.16, 0.15, C.dark, 0, -0.12, 0, 8);
      }, 0.9, 0.95, 0);
      g.add(filler);
      steam(0, 2.2, -1.4, 3);
      addLamp(-1.3, 0.9, 2.3);
      finish((t, act, p) => {
        const k = act > 0.01 ? p : 0;
        paddle.rotation.y += act > 0.01 ? 0.02 * (0.5 + act * 3) : 0;
        fire.visible = act > 0.01;
        fire.scale.y = 0.2 + Math.abs(Math.sin(t * 11)) * 0.1;
        filler.position.y = 0.95 - stroke(k, 0.65, 0.95) * 0.4;
        animSteam(t, act);
      });
      break;
    }
    case 'chips': {
      // snijmachine met trechter en draaiend mes, droogoven met gloed, ventilator en schoorsteen
      b.box(1.2, 1.4, 1.7, C.metal, -1.4, 0, 0);
      b.box(1.25, 0.25, 1.75, C.blue, -1.4, 1.4, 0);
      b.cyl(0.45, 0.6, C.metal, -1.4, 1.65, 0, { seg: 8, top: 1.5 });
      for (let k = 0; k < 4; k++) b.ico(0.15, C.apple, -1.4 + Math.cos(k * 1.6) * 0.3, 2.3, Math.sin(k * 1.6) * 0.3);
      b.box(3.0, 1.8, 1.9, 0xd06b3a, 0.8, 0, 0);
      b.box(3.05, 0.3, 1.95, C.dark, 0.8, 1.8, 0);
      for (let k = 0; k < 5; k++) b.box(0.08, 1.2, 0.04, 0xa94f26, -0.2 + k * 0.5, 0.3, -0.96);
      b.cyl(0.2, 1.1, C.metalDark, 1.75, 2.1, -0.5, { seg: 8 });
      b.cyl(0.26, 0.12, C.dark, 1.75, 3.2, -0.5, { seg: 8 });
      b.box(0.9, 0.12, 0.9, C.metalDark, 0.4, 2.1, 0.2);
      const glow = new THREE.Mesh(unitBox(), GLOW.clone());
      glow.scale.set(2.2, 0.4, 0.05);
      glow.position.set(0.8, 0.95, 0.96);
      g.add(glow);
      b.box(2.4, 0.08, 0.06, C.dark, 0.8, 0.9, 0.97);
      b.box(2.4, 0.08, 0.06, C.dark, 0.8, 1.38, 0.97);
      const blade = partMesh((bl) => {
        bl.cyl(0.45, 0.06, C.metalDark, 0, -0.03, 0, { seg: 10 });
        bl.box(0.85, 0.07, 0.08, C.white, 0, -0.03, 0);
        bl.box(0.08, 0.07, 0.85, C.white, 0, -0.03, 0);
      }, -1.4, 1.0, 0.86);
      blade.rotation.x = Math.PI / 2;
      g.add(blade);
      // ventilator op het dak van de oven
      const fan = partMesh((fb) => {
        for (let k = 0; k < 4; k++) fb.box(0.75, 0.04, 0.16, C.metal, Math.cos(k * 1.57) * 0.3, 0, Math.sin(k * 1.57) * 0.3, -k * 1.57);
        fb.cyl(0.1, 0.08, C.dark, 0, 0, 0, { seg: 6 });
      }, 0.4, 2.25, 0.2);
      g.add(fan);
      steam(1.75, 3.3, -0.5, 3, 0.2, 0xdddddd);
      addLamp(-2.15, -0.9, 2.2);
      finish((t, act) => {
        if (act > 0.01) { blade.rotation.y += 0.3 * (1 + act * 3); fan.rotation.y += 0.25 * (1 + act * 2); }
        glow.visible = act > 0.01;
        glow.material.color.setHSL(0.06, 1, 0.55 + Math.sin(t * 5) * 0.06);
        animSteam(t, act);
      });
      break;
    }
    case 'pie': {
      // bakkersoven van baksteen met deurtje dat opengaat als er een taart klaar is
      b.box(3.4, 1.7, 2.2, 0xb5523b, 0, 0, 0);
      for (let i = 0; i < 4; i++) b.box(3.45, 0.06, 2.25, 0x9a4332, 0, 0.3 + i * 0.35, 0);
      for (let i = 0; i < 6; i++) b.box(0.06, 1.6, 2.25, 0x9a4332, -1.5 + i * 0.6, 0.05, 0);
      b.cyl(1.25, 0.9, 0xb5523b, 0, 1.7, 0, { seg: 8, top: 0.55 });
      b.box(0.55, 1.7, 0.55, 0x8c3b2c, 0.9, 1.9, -0.5);
      b.box(0.65, 0.15, 0.65, C.dark, 0.9, 3.6, -0.5);
      b.box(1.6, 0.8, 0.12, C.dark, 0, 0.3, 1.1);
      // plank met afkoelende taarten
      b.box(1.0, 0.1, 0.5, C.wood, 1.9, 0.85, 0.9);
      b.cyl(0.18, 0.08, 0xd9a35b, 1.65, 0.95, 0.9, { seg: 8 });
      b.cyl(0.18, 0.08, 0xd9a35b, 2.1, 0.95, 0.9, { seg: 8 });
      b.box(0.08, 0.85, 0.08, C.woodDark, 1.5, 0, 0.75);
      b.box(0.08, 0.85, 0.08, C.woodDark, 2.3, 0, 0.75);
      const glow = new THREE.Mesh(unitBox(), GLOW.clone());
      glow.scale.set(1.4, 0.6, 0.05);
      glow.position.set(0, 0.4, 1.12);
      g.add(glow);
      // ovendeur scharniert onderaan
      const door = partMesh((db) => {
        db.box(1.5, 0.66, 0.08, C.metalDark, 0, 0, 0);
        db.box(1.0, 0.3, 0.02, 0xffb35c, 0, 0.18, 0.05);
        db.box(0.8, 0.07, 0.07, C.metal, 0, 0.5, 0.08);
      }, 0, 0.35, 1.18);
      g.add(door);
      // thermometer
      b.cyl(0.24, 0.05, C.white, -1.25, 1.25, 1.12, { seg: 10, rx: Math.PI / 2 });
      const needle = partMesh((nb) => nb.box(0.03, 0.18, 0.02, C.red, 0, 0, 0), -1.25, 1.25, 1.16, false);
      g.add(needle);
      steam(0.9, 3.8, -0.5, 3, 0.24, 0xcfcfcf);
      addLamp(-1.9, 0.9, 2.3);
      finish((t, act, p) => {
        const k = act > 0.01 ? p : 0;
        glow.visible = act > 0.01;
        glow.material.color.setHSL(0.07, 1, 0.55 + Math.sin(t * 6) * 0.05);
        door.rotation.x = stroke(k, 0.78, 1) * 1.1;
        needle.rotation.z = act > 0.01 ? -0.6 + Math.sin(t * 2) * 0.15 : 1.0;
        animSteam(t, act);
      });
      break;
    }
    case 'cider': {
      // twee gistvaten, een kijkglas met opstijgende belletjes, een kraanwiel en een vulkraan
      for (const [x, z] of [[-0.95, -1.75], [0.95, -1.75]]) {
        b.cyl(0.85, 2.6, 0xc77b3a, x, 0.3, z, { seg: 12 });
        b.cone(0.85, 0.6, 0xb06a2f, x, 2.9, z, 12);
        for (let r = 0; r < 3; r++) b.cyl(0.88, 0.08, C.metalDark, x, 0.6 + r * 0.8, z, { seg: 12 });
        for (let k = 0; k < 4; k++) b.box(0.15, 0.3, 0.15, C.metalDark, x + Math.cos(k * 1.57) * 0.6, 0, z + Math.sin(k * 1.57) * 0.6);
      }
      b.cyl(0.08, 1.9, C.metal, 0, 2.5, -1.75, { seg: 6, rz: Math.PI / 2 });
      b.cyl(0.08, 1.4, C.metal, 0, 1.0, -1.0, { seg: 6 });
      // kijkglas
      b.cyl(0.18, 1.6, 0xbfe8ff, 0, 0.6, -1.15, { seg: 8 });
      b.cyl(0.22, 0.1, C.metalDark, 0, 0.55, -1.15, { seg: 8 });
      b.cyl(0.22, 0.1, C.metalDark, 0, 2.2, -1.15, { seg: 8 });
      const fizz = [];
      for (let k = 0; k < 5; k++) {
        const m = partMesh((fb) => fb.sphere(0.06, 0xffffff, 0, 0, 0, { w: 5, h: 4 }), (k % 2 - 0.5) * 0.12, 0.7, -0.97, false);
        m.userData.phase = k / 5;
        g.add(m);
        fizz.push(m);
      }
      b.box(1.6, 1.0, 1.4, C.metal, 0, 0, 0);
      b.box(1.65, 0.15, 1.45, C.leaf, 0, 1.0, 0);
      b.box(0.5, 0.35, 0.05, C.dark, 0.4, 0.45, 0.71);
      // manometer
      b.cyl(0.25, 0.06, C.white, -0.95, 1.6, -0.88, { seg: 10, rx: Math.PI / 2 });
      const needle = partMesh((nb) => nb.box(0.04, 0.2, 0.03, C.red, 0, 0.08, 0), -0.95, 1.6, -0.82, false);
      g.add(needle);
      // kraanwiel
      const wheel = partMesh((wb) => {
        wb.cyl(0.28, 0.05, C.red, 0, 0, 0, { seg: 10 });
        wb.box(0.5, 0.06, 0.06, C.red, 0, 0.02, 0);
        wb.box(0.06, 0.06, 0.5, C.red, 0, 0.02, 0);
      }, 0.95, 1.4, -0.85);
      wheel.rotation.x = Math.PI / 2;
      g.add(wheel);
      const nozzle = partMesh((nb) => {
        nb.cyl(0.06, 0.45, C.metal, 0, 0, 0, { seg: 6 });
        nb.cone(0.11, 0.14, C.dark, 0, -0.12, 0, 6);
      }, 1.15, 1.25, 0);
      g.add(nozzle);
      b.box(0.14, 1.8, 0.14, C.metalDark, 1.15, 0, 0.7);
      b.box(0.14, 0.14, 0.75, C.metalDark, 1.15, 1.65, 0.33);
      steam(0.95, 3.5, -1.75, 2);
      addLamp(-1.1, 0.95, 2.3);
      finish((t, act, p) => {
        const k = act > 0.01 ? p : 0;
        needle.rotation.z = act > 0.01 ? Math.sin(t * 3) * 0.6 : -1.2;
        if (act > 0.01) wheel.rotation.y += 0.03;
        fizz.forEach((m) => {
          const q = (t * (0.5 + act) + m.userData.phase) % 1;
          m.position.y = 0.7 + q * 1.4;
          m.scale.setScalar(act > 0.01 ? 1 : 0.0001);
        });
        nozzle.position.y = 1.25 - stroke(k, 0.55, 0.9) * 0.4;
        animSteam(t, act * 0.6);
      });
      break;
    }
    case 'syrup': {
      // stroopketel met vuur, roerarm, bubbels en een tuit waar stroop uit druppelt
      b.box(3.0, 0.3, 2.6, C.metalDark, 0, 0, -1.3);
      b.cyl(1.2, 1.7, 0x5a3a26, -0.2, 0.55, -1.5, { seg: 12, top: 0.9 });
      for (let r = 0; r < 2; r++) b.cyl(1.17 - r * 0.15, 0.08, C.metalDark, -0.2, 0.9 + r * 0.7, -1.5, { seg: 12 });
      b.cyl(1.1, 0.1, 0x7a3b1d, -0.2, 2.2, -1.5, { seg: 12 });
      b.cyl(0.35, 0.8, C.metal, 1.15, 0.3, -0.3, { seg: 8, top: 0.4 });
      b.cyl(0.08, 1.5, C.metal, 0.55, 1.4, -0.9, { seg: 6, rz: 0.9 });
      b.box(0.2, 3.2, 0.2, C.dark, -1.55, 0, -0.4);
      b.box(1.55, 0.2, 0.2, C.dark, -0.9, 3.1, -0.4);
      b.box(0.2, 0.2, 1.1, C.dark, -0.2, 3.1, -0.95);
      b.box(0.45, 0.4, 0.45, C.orange, -0.2, 3.25, -1.5);
      const fire = new THREE.Mesh(unitCyl(8), new THREE.MeshBasicMaterial({ color: 0xff6a10 }));
      fire.scale.set(0.9, 0.25, 0.9);
      fire.position.set(-0.2, 0.32, -1.5);
      g.add(fire);
      const paddle = partMesh((sb) => {
        sb.box(0.12, 1.5, 0.12, C.dark, 0, -1.4, 0);
        sb.box(0.95, 0.12, 0.3, C.metalDark, 0, -1.3, 0);
      }, -0.2, 3.1, -1.5);
      g.add(paddle);
      bubbles(-0.2, 2.26, -1.5, 1.05, 0x9a4a22, 5);
      // tuit boven de band met een druppel
      b.cyl(0.08, 1.2, C.metal, 0.6, 1.9, -0.6, { seg: 6, rx: 1.1 });
      b.cone(0.12, 0.2, C.dark, 0.6, 1.25, 0, 6);
      const drop = partMesh((db) => db.sphere(0.09, 0x7a3b1d, 0, 0, 0, { w: 6, h: 4, sy: 1.3 }), 0.6, 1.2, 0, false);
      g.add(drop);
      b.box(0.14, 1.5, 0.14, C.metalDark, 0.6, 0, 0.7);
      b.box(0.14, 0.14, 0.75, C.metalDark, 0.6, 1.35, 0.33);
      steam(-0.2, 2.4, -1.5, 3);
      addLamp(1.6, 0.9, 2.3);
      finish((t, act, p) => {
        if (act > 0.01) paddle.rotation.y -= 0.02 * (0.4 + act * 2);
        fire.visible = act > 0.01;
        fire.scale.y = 0.2 + Math.abs(Math.sin(t * 9)) * 0.1;
        const q = act > 0.01 ? (p * 2) % 1 : 0;
        drop.position.y = 1.2 - q * q * 0.9;
        drop.scale.setScalar(act > 0.01 ? 0.6 + q * 0.4 : 0.0001);
        animSteam(t, act);
      });
      break;
    }
    case 'candy': {
      // draaimolen die appels aan stokjes door een bak karamel haalt; gedoopte appels zijn rood-glimmend
      b.box(2.6, 0.9, 2.6, 0xff9ac5, 0, 0, -1.4);
      b.box(2.7, 0.12, 2.7, C.white, 0, 0.9, -1.4);
      for (let k = 0; k < 8; k++) b.box(0.3, 0.6, 0.04, k % 2 ? C.white : 0xff6fa8, -1.1 + k * 0.32, 0.15, -0.09);
      // karamelbak (ring) en middenpaal
      b.cyl(1.25, 0.45, C.metalDark, 0, 1.0, -1.4, { seg: 16 });
      b.cyl(1.18, 0.05, 0xb5361f, 0, 1.43, -1.4, { seg: 16 });
      b.cyl(0.35, 0.5, 0xff9ac5, 0, 1.0, -1.4, { seg: 10 });
      b.cyl(0.14, 2.4, C.white, 0, 1.0, -1.4, { seg: 8 });
      b.cone(0.45, 0.4, 0xff6fa8, 0, 3.75, -1.4, 10);
      // inpaktafel voor de band
      b.cyl(0.6, 0.6, 0xff6fa8, 1.6, 0, 0.95, { seg: 10 });
      b.cyl(0.65, 0.12, 0xc0392b, 1.6, 0.6, 0.95, { seg: 10 });
      const spider = new THREE.Group();
      spider.position.set(0, 3.2, -1.4);
      g.add(spider);
      const hub = partMesh((hb) => {
        hb.cyl(0.3, 0.2, 0xffd3e6, 0, -0.1, 0, { seg: 10 });
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          hb.box(1.0, 0.07, 0.07, C.white, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, -a);
        }
      });
      spider.add(hub);
      const arms = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const arm = new THREE.Group();
        arm.position.set(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95);
        const stick = partMesh((sb) => sb.box(0.04, 0.9, 0.04, C.wood, 0, -0.9, 0));
        const apple = partMesh((ab) => {
          ab.sphere(0.2, C.apple, 0, -1.05, 0, { w: 8, h: 6 });
          ab.box(0.03, 0.08, 0.03, C.trunk, 0, -0.85, 0);
        });
        const coat = partMesh((cb) => cb.sphere(0.23, 0xb5161f, 0, -1.07, 0, { w: 8, h: 6, sy: 0.95 }));
        arm.add(stick, apple, coat);
        spider.add(arm);
        arms.push({ arm, coat, a });
      }
      addLamp(1.5, -0.2, 2.3);
      finish((t, act) => {
        if (act > 0.01) spider.rotation.y += 0.012 * (0.4 + act * 2);
        for (const { arm, coat, a } of arms) {
          // hoek in de wereld: rechtsachter dopen ze in de karamel, vooraan gaan ze eraf
          const w = (((a - spider.rotation.y) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const dip = Math.max(0, Math.sin(w - 0.3)) ** 6;
          arm.position.y = -dip * 0.55;
          coat.visible = w > 1.3 && w < 5.6;
        }
      });
      break;
    }
    default:
      b.box(2, 1.5, 2, color, 0, 0, 0);
      addLamp(-1.2, 0.9, 2.2);
      finish(() => {});
  }
  body = b.mesh();
  g.add(body);
  g.userData.body = body;
  return { group: g, anim };
}

// ---------- Producten op de band (geometrie voor InstancedMesh) ----------

export function itemGeometry(id) {
  const b = new Builder();
  switch (id) {
    case 'apple':
      b.ico(0.16, C.apple, 0, 0.16, 0);
      b.box(0.03, 0.08, 0.03, C.trunk, 0, 0.3, 0);
      break;
    case 'fresh':
      b.box(0.5, 0.25, 0.4, C.wood, 0, 0, 0);
      b.ico(0.11, C.apple, -0.12, 0.28, 0);
      b.ico(0.11, C.apple, 0.12, 0.28, 0.05);
      b.ico(0.11, 0x8ccf3f, 0, 0.3, -0.08);
      break;
    case 'juice':
      b.box(0.3, 0.5, 0.3, 0xf7d046, 0, 0, 0);
      b.box(0.31, 0.15, 0.31, C.leaf, 0, 0.2, 0);
      b.box(0.1, 0.1, 0.1, C.white, 0, 0.5, 0);
      break;
    case 'sauce':
      b.cyl(0.18, 0.36, 0xf6e7b0, 0, 0, 0, { seg: 8 });
      b.cyl(0.19, 0.08, C.red, 0, 0.36, 0, { seg: 8 });
      break;
    case 'chips':
      b.box(0.36, 0.46, 0.14, 0xe8a33d, 0, 0, 0);
      b.box(0.37, 0.06, 0.15, C.red, 0, 0.4, 0);
      b.ico(0.08, C.apple, 0, 0.2, 0.08, { sz: 0.4 });
      break;
    case 'pie':
      b.cyl(0.28, 0.14, 0xc9853e, 0, 0, 0, { seg: 10 });
      b.cyl(0.24, 0.05, 0xe2a95e, 0, 0.14, 0, { seg: 10 });
      break;
    case 'cider':
      b.cyl(0.13, 0.42, 0x6b9e2f, 0, 0, 0, { seg: 8 });
      b.cyl(0.06, 0.18, 0x6b9e2f, 0, 0.42, 0, { seg: 6 });
      b.cyl(0.135, 0.14, 0xf4e3b5, 0, 0.14, 0, { seg: 8 });
      break;
    case 'syrup':
      b.cyl(0.17, 0.32, 0x5a2a12, 0, 0, 0, { seg: 8 });
      b.cyl(0.18, 0.08, C.yellow, 0, 0.32, 0, { seg: 8 });
      break;
    case 'candy':
      b.box(0.05, 0.25, 0.05, C.wood, 0, 0.3, 0);
      b.sphere(0.2, 0xc0392b, 0, 0.18, 0);
      break;
    case 'gold':
      b.ico(0.5, C.appleGold, 0, 0, 0, { detail: 1 });
      b.box(0.06, 0.25, 0.06, C.trunk, 0, 0.5, 0);
      b.ico(0.15, C.leaf, 0.15, 0.55, 0, { sy: 0.4 });
      break;
    case 'confetti':
      b.box(0.2, 0.2, 0.05, 0xffffff, 0, 0, 0);
      break;
    default:
      b.box(0.3, 0.3, 0.3, 0xffffff, 0, 0, 0);
  }
  return b.geometry();
}

// ---------- Grote gebouwen voor late uitbreidingen ----------

export function silo(h = 7, color = C.white) {
  const b = new Builder();
  b.cyl(1.6, h, color, 0, 0, 0, { seg: 12 });
  b.cone(1.7, 1.4, C.metalDark, 0, h, 0, 12);
  for (let y = 1; y < h; y += 1.5) b.cyl(1.62, 0.12, C.metal, 0, y, 0, { seg: 12 });
  b.box(0.1, h, 0.4, C.dark, 1.62, 0, 0);
  return b.mesh();
}

export function warehouse(w, d, h, color = C.white, roof = C.red) {
  const b = new Builder();
  b.box(w, h, d, color, 0, 0, 0);
  const teeth = Math.max(2, Math.round(w / 4));
  for (let i = 0; i < teeth; i++) {
    const x = -w / 2 + (i + 0.5) * (w / teeth);
    b.box(w / teeth, 0.9, d, roof, x, h, 0, 0, 0, 0);
    b.box(w / teeth * 0.4, 0.8, d * 0.98, C.glass, x + w / teeth * 0.25, h + 0.4, 0);
  }
  for (let i = 0; i < 3; i++) b.box(2.2, 2.6, 0.1, C.metalDark, -w / 3 + i * (w / 3), 0, d / 2 + 0.02);
  b.box(w + 0.1, 0.4, d + 0.1, roof, 0, h - 0.4, 0);
  b.ico(1.2, C.apple, w / 2 - 2, h - 1.6, d / 2 + 0.1, { sz: 0.25 });
  return b.mesh({ receive: true });
}

export function office(w, d, floors, color, seed = 1) {
  const r = rng(seed);
  const b = new Builder();
  const fh = 1.4;
  b.box(w, floors * fh, d, color, 0, 0, 0);
  for (let f = 0; f < floors; f++) {
    b.box(w + 0.04, 0.55, d + 0.04, r() > 0.15 ? C.glass : 0xfff3b0, 0, f * fh + 0.5, 0);
  }
  b.box(w + 0.2, 0.3, d + 0.2, C.metalDark, 0, floors * fh, 0);
  if (r() > 0.5) b.box(w * 0.4, 0.8, d * 0.4, C.metal, 0, floors * fh + 0.3, 0);
  return b.mesh();
}

export function house(color, seed = 1) {
  const b = new Builder();
  b.box(2.4, 1.6, 2.0, color, 0, 0, 0);
  b.cyl(1.7, 1.2, C.red, 0, 1.6, 0, { seg: 4, top: 0.01, ry: Math.PI / 4 });
  b.box(0.5, 0.9, 0.05, C.woodDark, 0, 0, 1.01);
  b.box(0.5, 0.45, 0.05, C.glass, 0.7, 0.8, 1.01);
  return b.mesh();
}

export function appleStatue() {
  const b = new Builder();
  b.box(7, 1.2, 7, C.concrete, 0, 0, 0);
  b.box(5, 1.0, 5, 0xe8e2d6, 0, 1.2, 0);
  b.ico(2.8, C.appleGold, 0, 5.0, 0, { detail: 1, sy: 0.92 });
  b.cyl(0.25, 1.6, C.trunk, 0, 7.2, 0, { seg: 6 });
  b.ico(1.0, C.leaf, 0.9, 8.2, 0, { sy: 0.35, sx: 1.4 });
  return b.mesh();
}

export function rocket() {
  const b = new Builder();
  b.box(8, 0.6, 8, C.concrete, 0, 0, 0);
  b.box(0.6, 12, 0.6, C.red, -3, 0.6, -3);
  b.box(3.2, 0.4, 0.4, C.red, -1.6, 9, -3);
  b.cyl(1.2, 7, C.white, 0, 1.6, 0, { seg: 12 });
  b.cone(1.2, 2.4, C.red, 0, 8.6, 0, 12);
  b.ico(1.3, C.apple, 0, 9.6, 0, { detail: 1 });
  b.box(0.12, 0.6, 0.12, C.trunk, 0, 10.8, 0);
  for (let k = 0; k < 4; k++) b.box(0.2, 1.8, 1.4, C.red, Math.cos(k * 1.57) * 1.25, 0.6, Math.sin(k * 1.57) * 1.25, k * 1.57);
  b.cyl(0.5, 0.25, C.glass, 0, 6, 1.12, { seg: 10, rx: Math.PI / 2 });
  return b.mesh();
}

export function waterTower() {
  const b = new Builder();
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.2, 6, 0.2, C.metalDark, x, 0, z);
  b.cyl(1.8, 2.4, C.blue, 0, 6, 0, { seg: 12 });
  b.cone(1.9, 1, C.metalDark, 0, 8.4, 0, 12);
  b.ico(0.8, C.apple, 0, 7.2, 1.75, { sz: 0.25 });
  return b.mesh();
}

export function solarPanel() {
  const b = new Builder();
  b.box(0.15, 0.8, 0.15, C.metalDark, 0, 0, 0);
  b.box(2.2, 0.08, 1.4, 0x2d4f8a, 0, 0.8, 0, 0, -0.35, 0);
  return b.mesh();
}
