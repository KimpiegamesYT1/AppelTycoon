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

export function truck(color = C.red, seed = 1) {
  const b = new Builder();
  // lokaal: rijrichting +x
  b.box(4.2, 0.35, 1.7, C.dark, 0, 0.35, 0);
  b.box(1.3, 1.25, 1.7, color, 1.55, 0.7, 0);
  b.box(0.05, 0.5, 1.4, C.glass, 2.2, 1.25, 0);
  b.box(0.8, 0.5, 0.05, C.glass, 1.55, 1.25, 0.86);
  b.box(0.8, 0.5, 0.05, C.glass, 1.55, 1.25, -0.86);
  b.box(2.75, 1.7, 1.8, C.white, -0.6, 0.7, 0);
  b.box(2.6, 0.22, 1.82, color, -0.6, 2.0, 0);
  b.ico(0.42, C.apple, -0.6, 1.45, 0.92, { sz: 0.3 });
  b.ico(0.42, C.apple, -0.6, 1.45, -0.92, { sz: 0.3 });
  b.box(0.1, 0.18, 0.12, C.leaf, -0.6, 1.85, 0.93);
  b.box(0.1, 0.18, 0.12, C.leaf, -0.6, 1.85, -0.93);
  for (const x of [1.4, -0.4, -1.4]) {
    for (const z of [0.8, -0.8]) b.cyl(0.36, 0.3, 0x222831, x, 0.36, z - 0.15 * Math.sign(z), { seg: 10, rx: Math.PI / 2 });
  }
  b.box(0.08, 0.2, 0.3, 0xfff3b0, 2.2, 0.75, 0.6);
  b.box(0.08, 0.2, 0.3, 0xfff3b0, 2.2, 0.75, -0.6);
  return b.mesh();
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

// Lopende band langs lokale +x, van x=0 tot x=length; bovenkant op y=0.8.
export function conveyor(length, width = 0.8) {
  const group = new THREE.Group();
  const b = new Builder();
  b.box(length, 0.18, width + 0.16, C.metalDark, length / 2, 0.62, 0);
  b.box(length, 0.1, 0.08, C.yellow, length / 2, 0.78, width / 2 + 0.08);
  b.box(length, 0.1, 0.08, C.yellow, length / 2, 0.78, -width / 2 - 0.08);
  for (let x = 0.3; x < length; x += 1.6) {
    b.box(0.1, 0.62, 0.1, C.metalDark, x, 0, width / 2);
    b.box(0.1, 0.62, 0.1, C.metalDark, x, 0, -width / 2);
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

export function appleBin() {
  const b = new Builder();
  b.box(2.4, 1.1, 2.0, C.wood, 0, 0, 0);
  for (let i = 0; i < 4; i++) b.box(2.45, 0.08, 2.05, C.woodDark, 0, 0.12 + i * 0.28, 0);
  const r = rng(5);
  for (let i = 0; i < 18; i++) b.ico(0.18, i % 7 ? C.apple : C.appleGold, (r() - 0.5) * 2, 1.05 + r() * 0.15, (r() - 0.5) * 1.6);
  b.box(0.15, 1.7, 0.15, C.woodDark, 1.3, 0, 1.05);
  b.box(1.0, 0.6, 0.08, C.white, 1.3, 1.6, 1.05);
  b.ico(0.2, C.apple, 1.3, 1.9, 1.12, { sz: 0.3 });
  return b.mesh();
}

// ---------- Machines per productielijn ----------
// Elke machine staat lokaal rond x=0 over de band (band loopt langs x).
// Geeft { group, anim(time, activity) } terug.

export function machine(id, color) {
  const g = new THREE.Group();
  const b = new Builder();
  let anim = () => {};
  const moving = new THREE.Group();
  g.add(moving);

  const steamParts = [];
  const steam = (x, y, z, n = 3) => {
    for (let i = 0; i < n; i++) {
      const sb = new Builder();
      sb.ico(0.22, 0xffffff, 0, 0, 0);
      const m = sb.mesh({ shadow: false });
      m.position.set(x, y, z);
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

  switch (id) {
    case 'fresh': {
      b.box(3.2, 0.9, 1.6, C.metal, 0, 0, 0);
      for (let x = -1.3; x <= 1.31; x += 0.32) b.cyl(0.07, 1.3, C.metalDark, x, 0.95, -0.65, { seg: 6, rx: Math.PI / 2 });
      b.box(0.2, 2.2, 0.2, C.dark, -0.4, 0, 1.0);
      b.box(0.2, 2.2, 0.2, C.dark, -0.4, 0, -1.0);
      b.box(0.4, 0.35, 2.2, C.yellow, -0.4, 2.0, 0);
      g.add(crateStack(3, 4).translateX(0.9).translateZ(1.3));
      const lightB = new Builder();
      lightB.box(0.25, 0.15, 0.25, 0x4cff7a, 0, 0, 0);
      const light = lightB.mesh({ shadow: false });
      light.position.set(-0.4, 2.35, 0);
      g.add(light);
      anim = (t, act) => { light.visible = act > 0.01 && Math.sin(t * 8) > 0; };
      break;
    }
    case 'juice': {
      b.box(2.2, 0.3, 1.8, C.metalDark, 0, 0, 0);
      b.box(0.25, 2.6, 0.25, C.metal, -0.9, 0, 0.75);
      b.box(0.25, 2.6, 0.25, C.metal, -0.9, 0, -0.75);
      b.box(0.25, 2.6, 0.25, C.metal, 0.9, 0, 0.75);
      b.box(0.25, 2.6, 0.25, C.metal, 0.9, 0, -0.75);
      b.box(2.2, 0.4, 1.8, C.yellow, 0, 2.6, 0);
      b.cyl(0.6, 2.2, C.yellow, -0.1, 0, -1.8, { seg: 10 });
      b.sphere(0.6, C.yellow, -0.1, 2.2, -1.8, { sy: 0.5 });
      b.cyl(0.6, 2.2, 0xffe08a, 1.3, 0, -1.8, { seg: 10 });
      b.sphere(0.6, 0xffe08a, 1.3, 2.2, -1.8, { sy: 0.5 });
      b.cyl(0.08, 1.4, C.metal, 0.6, 1.6, -1.2, { seg: 6, rz: Math.PI / 2 });
      const pb = new Builder();
      pb.box(0.3, 0.9, 0.3, C.metal, 0, 0, 0);
      pb.box(1.4, 0.25, 1.2, C.metalDark, 0, -0.25, 0);
      const piston = pb.mesh();
      piston.position.set(0, 1.7, 0);
      g.add(piston);
      anim = (t, act) => { piston.position.y = 1.55 + (act > 0.01 ? Math.abs(Math.sin(t * (2 + act * 3))) * 0.45 : 0.45); };
      break;
    }
    case 'sauce': {
      b.box(2.6, 0.3, 2.4, C.metalDark, 0, 0, -1.2);
      b.cyl(1.0, 1.3, C.metal, 0, 0.3, -1.4, { seg: 12, top: 1.1 });
      b.cyl(1.15, 0.12, C.metalDark, 0, 1.6, -1.4, { seg: 12 });
      b.cyl(0.95, 0.05, 0xf6e7b0, 0, 1.55, -1.4, { seg: 12 });
      b.box(0.15, 2.6, 0.15, C.dark, 1.0, 0, -0.4);
      b.box(1.2, 0.15, 0.15, C.dark, 0.45, 2.5, -0.4);
      b.box(0.5, 0.6, 0.5, color, 1.0, 0.3, 0.2);
      const sb = new Builder();
      sb.box(0.1, 1.2, 0.1, C.dark, 0, -1.1, 0);
      sb.box(0.7, 0.3, 0.08, C.metalDark, 0, -1.1, 0);
      const paddle = sb.mesh();
      paddle.position.set(0, 2.5, -1.4);
      g.add(paddle);
      steam(0, 1.9, -1.4, 3);
      anim = (t, act) => { paddle.rotation.y = t * (0.5 + act * 3); animSteam(t, act); };
      break;
    }
    case 'chips': {
      b.box(1.2, 1.4, 1.6, C.metal, -1.4, 0, 0);
      b.box(1.25, 0.25, 1.65, C.blue, -1.4, 1.4, 0);
      b.box(3.0, 1.8, 1.9, 0xd06b3a, 0.8, 0, 0);
      b.box(3.05, 0.3, 1.95, C.dark, 0.8, 1.8, 0);
      b.cyl(0.18, 0.9, C.metalDark, 1.6, 2.0, -0.4, { seg: 6 });
      const glow = new THREE.Mesh(unitBox(), GLOW);
      glow.scale.set(2.2, 0.4, 0.05);
      glow.position.set(0.8, 1.0, 0.96);
      g.add(glow);
      const bl = new Builder();
      bl.cyl(0.45, 0.06, C.metalDark, 0, 0, 0, { seg: 10, rx: Math.PI / 2 });
      bl.box(0.85, 0.07, 0.08, C.white, 0, -0.03, 0.06, 0, 0, 0);
      const blade = bl.mesh();
      blade.position.set(-1.4, 1.1, 0.85);
      g.add(blade);
      steam(1.6, 2.9, -0.4, 2);
      anim = (t, act) => { blade.rotation.z = -t * (1 + act * 10); glow.visible = act > 0.01; animSteam(t, act); };
      break;
    }
    case 'pie': {
      b.box(3.4, 1.6, 2.2, 0xb5523b, 0, 0, 0);
      for (let i = 0; i < 4; i++) b.box(3.45, 0.06, 2.25, 0x9a4332, 0, 0.3 + i * 0.35, 0);
      b.cyl(1.25, 0.9, 0xb5523b, 0, 1.6, 0, { seg: 8, top: 0.55 });
      b.box(0.5, 1.6, 0.5, 0x8c3b2c, 0.9, 1.8, -0.5);
      b.box(1.0, 0.25, 0.4, C.dark, 1.9, 0.85, 0.9);
      const glow = new THREE.Mesh(unitBox(), GLOW.clone());
      glow.scale.set(1.4, 0.55, 0.05);
      glow.position.set(0, 0.6, 1.11);
      g.add(glow);
      steam(0.9, 3.5, -0.5, 3);
      anim = (t, act) => { glow.visible = act > 0.01; glow.material.color.setHSL(0.07, 1, 0.55 + Math.sin(t * 6) * 0.05); animSteam(t, act); };
      break;
    }
    case 'cider': {
      for (const [x, z] of [[-0.9, -1.7], [0.9, -1.7]]) {
        b.cyl(0.85, 2.6, 0xc77b3a, x, 0.3, z, { seg: 10 });
        b.cone(0.85, 0.6, 0xb06a2f, x, 2.9, z, 10);
        for (let k = 0; k < 4; k++) b.box(0.15, 0.3, 0.15, C.metalDark, x + Math.cos(k * 1.57) * 0.6, 0, z + Math.sin(k * 1.57) * 0.6);
      }
      b.cyl(0.08, 1.8, C.metal, 0, 2.5, -1.7, { seg: 6, rz: Math.PI / 2 });
      b.cyl(0.08, 1.4, C.metal, 0, 1.0, -1.0, { seg: 6 });
      b.box(1.6, 1.0, 1.4, C.metal, 0, 0, 0);
      b.box(1.65, 0.15, 1.45, C.leaf, 0, 1.0, 0);
      const gb = new Builder();
      gb.cyl(0.25, 0.06, C.white, 0, 0, 0, { seg: 10, rx: Math.PI / 2 });
      const gauge = gb.mesh({ shadow: false });
      gauge.position.set(-0.9, 1.6, -0.82);
      g.add(gauge);
      const nb = new Builder();
      nb.box(0.04, 0.2, 0.03, C.red, 0, 0, 0);
      const needle = nb.mesh({ shadow: false });
      needle.position.set(-0.9, 1.6, -0.78);
      g.add(needle);
      steam(0.9, 3.5, -1.7, 2);
      anim = (t, act) => { needle.rotation.z = act > 0.01 ? Math.sin(t * 3) * 0.8 : -1.2; animSteam(t, act * 0.6); };
      break;
    }
    case 'syrup': {
      b.box(3.0, 0.3, 2.6, C.metalDark, 0, 0, -1.3);
      b.cyl(1.2, 1.6, 0x5a3a26, -0.2, 0.3, -1.5, { seg: 10, top: 0.9 });
      b.cyl(1.1, 0.1, 0x7a3b1d, -0.2, 1.9, -1.5, { seg: 10 });
      b.cyl(0.35, 0.8, C.metal, 1.1, 0.3, -0.3, { seg: 8, top: 0.4 });
      b.cyl(0.08, 1.5, C.metal, 0.5, 1.4, -0.9, { seg: 6, rz: 0.9 });
      b.box(0.2, 3.0, 0.2, C.dark, -1.5, 0, -0.4);
      b.box(1.5, 0.2, 0.2, C.dark, -0.9, 2.9, -0.4);
      const sb = new Builder();
      sb.box(0.12, 1.4, 0.12, C.dark, 0, -1.3, 0);
      sb.box(0.9, 0.12, 0.3, C.metalDark, 0, -1.2, 0);
      const paddle = sb.mesh();
      paddle.position.set(-0.2, 2.9, -1.5);
      g.add(paddle);
      steam(-0.2, 2.2, -1.5, 3);
      anim = (t, act) => { paddle.rotation.y = -t * (0.4 + act * 2); animSteam(t, act); };
      break;
    }
    case 'candy': {
      b.box(2.4, 0.9, 2.4, 0xff9ac5, 0, 0, -1.4);
      b.box(2.5, 0.12, 2.5, C.white, 0, 0.9, -1.4);
      b.cyl(0.2, 2.0, C.white, 0, 0.9, -1.4, { seg: 8 });
      b.cyl(0.6, 0.6, 0xff6fa8, 1.6, 0, 0.9, { seg: 8 });
      b.cyl(0.65, 0.12, 0xc0392b, 1.6, 0.6, 0.9, { seg: 8 });
      const wb = new Builder();
      wb.cyl(1.2, 0.12, 0xffd3e6, 0, 0, 0, { seg: 12 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const x = Math.cos(a) * 0.95, z = Math.sin(a) * 0.95;
        wb.box(0.05, 0.5, 0.05, C.wood, x, 0.12, z);
        wb.sphere(0.24, 0xc0392b, x, 0.75, z);
      }
      const wheel = wb.mesh();
      wheel.position.set(0, 2.2, -1.4);
      g.add(wheel);
      anim = (t, act) => { wheel.rotation.y = t * (0.3 + act * 2); };
      break;
    }
    default:
      b.box(2, 1.5, 2, color, 0, 0, 0);
  }
  const body = b.mesh();
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
