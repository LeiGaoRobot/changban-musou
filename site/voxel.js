// Voxel builder + every model in the game (hero, officers, soldiers, dragon, props).
// Models face +Z; a character's right hand is at -X. 1 voxel = VS metres unless a builder passes its own scale.
import * as THREE from 'three';

export const VS = 0.03;

export function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const FACES = [
  { n: [1, 0, 0], a: 0, v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], a: 0, v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], a: 1, v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], a: 1, v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], a: 2, v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], a: 2, v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const AO = [0.52, 0.7, 0.86, 1];
const _c = new THREE.Color();

export class Vox {
  constructor() { this.m = new Map(); }
  static key(x, y, z) { return (x + 512) + (y + 512) * 1024 + (z + 512) * 1048576; }
  set(x, y, z, c) { const k = Vox.key(x, y, z); if (c == null) this.m.delete(k); else this.m.set(k, c); return this; }
  has(x, y, z) { return this.m.has(Vox.key(x, y, z)); }
  get(x, y, z) { return this.m.get(Vox.key(x, y, z)); }
  box(x0, y0, z0, x1, y1, z1, c) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, c);
    return this;
  }
  // paint only voxels that already exist
  paint(x0, y0, z0, x1, y1, z1, c) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) if (this.has(x, y, z)) this.set(x, y, z, c);
    return this;
  }
  mirrorX() { // copy every voxel at x to -1-x (symmetric about the x=0 plane between voxels -1 and 0)
    for (const [k, c] of [...this.m]) { const [x, y, z] = Vox.dec(k); if (!this.has(-1 - x, y, z)) this.set(-1 - x, y, z, c); }
    return this;
  }
  static dec(k) { return [(k % 1024) - 512, (Math.floor(k / 1024) % 1024) - 512, Math.floor(k / 1048576) - 512]; }
  // ---- shape helpers. Continuous coordinates: voxel (x,y,z) has its centre at (x+.5, y+.5, z+.5).
  // ellipsoid; pred(x,y,z) limits it, keep=true only fills empty cells
  ell(cx, cy, cz, rx, ry, rz, c, pred, keep) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
      const a = (x + 0.5 - cx) / rx, b = (y + 0.5 - cy) / ry, d = (z + 0.5 - cz) / rz;
      if (a * a + b * b + d * d > 1) continue;
      if (pred && !pred(x, y, z)) continue;
      if (keep && this.has(x, y, z)) continue;
      this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c);
    }
    return this;
  }
  // one horizontal slice: superellipse |x/w|^n + |z/d|^n <= 1
  layer(y, cx, cz, w, d, c, n = 2.6, pred) {
    for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) for (let z = Math.floor(cz - d); z <= Math.ceil(cz + d); z++) {
      const a = Math.abs((x + 0.5 - cx) / w), b = Math.abs((z + 0.5 - cz) / d);
      if (a ** n + b ** n > 1) continue;
      if (pred && !pred(x, y, z)) continue;
      this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c);
    }
    return this;
  }
  // tapered column along Y from row y0 (radii a0,b0) to row y1 (radii a1,b1)
  cylY(cx, cz, y0, y1, a0, b0, a1, b1, c, n = 2) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0); this.layer(y, cx, cz, a0 + (a1 - a0) * t, b0 + (b1 - b0) * t, c, n); }
    return this;
  }
  recolor(fn) { for (const [k, c] of [...this.m]) { const [x, y, z] = Vox.dec(k); const n = fn(x, y, z, c); if (n !== undefined) this.m.set(k, n); } return this; }
  // outermost filled z in column (x, y): dir +1 = front, -1 = back; null when empty
  surf(x, y, dir = 1) { for (let z = dir > 0 ? 40 : -40; dir > 0 ? z >= -40 : z <= 40; z -= dir) if (this.has(x, y, z)) return z; return null; }
  // paint the front (dir=1) / back (dir=-1) surface voxel of a column, or add `out` voxels proud of it
  face(x, y, c, out = 0, dir = 1) { const z = this.surf(x, y, dir); if (z === null) return this; for (let k = out ? 1 : 0; k <= out; k++) this.set(x, y, z + dir * k, c); return this; }
  // half-resolution copy for LOD (use with s * 2)
  down() { const v = new Vox(); for (const [k, c] of this.m) { const [x, y, z] = Vox.dec(k); const kk = Vox.key(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2)); if (!v.m.has(kk) || ((x & 1) === 0 && (y & 1) === 1)) v.m.set(kk, c); } return v; }
  // o = pivot in voxel units (voxel corners), s = metres per voxel, jit = per-voxel colour noise
  geometry({ s = VS, o = [0, 0, 0], jit = 0.08, ao = true } = {}) {
    const pos = [], nor = [], col = [], idx = [];
    for (const [k, c] of this.m) {
      const [x, y, z] = Vox.dec(k);
      _c.setHex(c);
      const n0 = 1 + (hash3(x, y, z) - 0.5) * 2 * jit;
      for (const f of FACES) {
        const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
        if (this.has(nx, ny, nz)) continue;
        const base = pos.length / 3;
        const t1 = (f.a + 1) % 3, t2 = (f.a + 2) % 3;
        for (const v of f.v) {
          pos.push((x + v[0] - o[0]) * s, (y + v[1] - o[1]) * s, (z + v[2] - o[2]) * s);
          nor.push(f.n[0], f.n[1], f.n[2]);
          let a = 3;
          if (ao) {
            const p = [nx, ny, nz], d1 = [0, 0, 0], d2 = [0, 0, 0];
            d1[t1] = v[t1] ? 1 : -1; d2[t2] = v[t2] ? 1 : -1;
            const s1 = this.has(p[0] + d1[0], p[1] + d1[1], p[2] + d1[2]) ? 1 : 0;
            const s2 = this.has(p[0] + d2[0], p[1] + d2[1], p[2] + d2[2]) ? 1 : 0;
            const cc = this.has(p[0] + d1[0] + d2[0], p[1] + d1[1] + d2[1], p[2] + d1[2] + d2[2]) ? 1 : 0;
            a = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
          }
          const m = n0 * AO[a];
          col.push(_c.r * m, _c.g * m, _c.b * m);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ palettes
export const PAL = {
  zhao: { armor: 0xeeece6, plate: 0xc9ced6, trim: 0x1fa39a, trim2: 0x66dccd, cloth: 0x26303e, skin: 0xf0d4b8, hair: 0x17171c,
    boot: 0xe6e4de, belt: 0x1b6c68, cape: 0xf3f0e8, eye: 0x1b1b22, lip: 0xc07a6a, metal: 0xd9dee6 },
  grunt: { armor: 0x414857, plate: 0x7a8496, trim: 0xb02c20, cloth: 0x4a3e32, skin: 0xe2bfa0, helm: 0x4c535f, plume: 0xc42c1e, boot: 0x25252b, wrap: 0x8a7860, eye: 0x1a1a1a, hair: 0x1a1512 },
  xiahou: { armor: 0x2b3350, plate: 0x4a5577, trim: 0xd9a843, trim2: 0xf2d27a, cloth: 0x252a3a, skin: 0xe6c4a4, hair: 0x221a16,
    boot: 0x22242c, belt: 0x8a2a22, helm: 0x3a4262, plume: 0xc8322a, eye: 0x1b1b22, lip: 0xa86a5a, cape: 0x8a2a22, metal: 0xd9a843 },
  yan: { armor: 0x4a2b24, plate: 0x7a4a36, trim: 0xc9a040, trim2: 0xe8c86a, cloth: 0x2e2420, skin: 0xdcb694, hair: 0x1a1512,
    boot: 0x241c18, belt: 0x6a2a1e, helm: 0x5a3a2c, plume: 0x2a2a2a, eye: 0x1b1b22, lip: 0x9a5e50, metal: 0xc9a040 },
  chunyu: { armor: 0x3a4030, plate: 0x6a7258, trim: 0xb88a3a, trim2: 0xdcb462, cloth: 0x2a2c22, skin: 0xdfba98, hair: 0x201a14,
    boot: 0x22241c, belt: 0x5e3a1e, helm: 0x4a5040, plume: 0xa82c1e, eye: 0x1b1b22, lip: 0x9a5e50, metal: 0xb88a3a },
  zhang: { armor: 0x3b2a58, plate: 0x6e58a0, trim: 0xe0b450, trim2: 0xf6dc8a, cloth: 0x201a30, skin: 0xecccae, hair: 0x14121a,
    boot: 0x1e1a2a, belt: 0xa8322a, helm: 0x4a3a6e, plume: 0xe8e0f0, eye: 0x1b1b22, lip: 0xb07060, cape: 0x5a3a8a, metal: 0xe0b450 },
  wenpin: { armor: 0x2f4a4a, plate: 0x5a7a78, trim: 0xc8ccd2, trim2: 0xeef2f6, cloth: 0x1e2a2c, skin: 0xe2c0a0, hair: 0x1a1512,
    boot: 0x1e2628, belt: 0x6a2a22, helm: 0x3a5a58, plume: 0xeeeeee, eye: 0x1b1b22, lip: 0x9a5e50, cape: 0x2a5a8a, metal: 0xc8ccd2 },
  xuchu: { armor: 0x5a4630, plate: 0x8a6a42, trim: 0x2a2420, trim2: 0xb8281c, cloth: 0x3a2c20, skin: 0xc89868, hair: 0x14100c,
    boot: 0x241a14, belt: 0xb8281c, helm: 0x6a5236, plume: 0xb8281c, eye: 0x101010, lip: 0x8a5040, metal: 0xd8b04a },
  zhangfei: { armor: 0x2a2a30, plate: 0x4a4a52, trim: 0xa8322a, trim2: 0xd8503c, cloth: 0x1c1c22, skin: 0xb88a62, hair: 0x0e0e10,
    boot: 0x18181c, belt: 0x6a1e18, eye: 0x101010, lip: 0x7a4a3a, metal: 0x8a8a92 },
};
// shade a hex colour
const sh = (c, k) => { const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k)); return (r << 16) | (g << 8) | b; };
const mod = (a, n) => ((a % n) + n) % n;
// lamellar armour: rows of small plates with a shadow line under each row and staggered seams
const lam = (base, rows = 3, cols = 3, hi = 1.07, lo = 0.74) => (x, y, z, c) => {
  if (c !== base) return undefined;
  const r = Math.floor(y / rows);
  if (mod(y, rows) === 0) return sh(base, lo);
  if (mod(x + z + (r & 1) * ((cols / 2) | 0), cols) === 0) return sh(base, 0.86);
  return mod(y, rows) === rows - 1 ? sh(base, hi) : base;
};

// ------------------------------------------------------------------ warrior (hero / officers), 3 cm voxels
// Joints (voxels): hip joint y=32, waist +6, neck +18, shoulders at torso (±11, 14.4), elbow 11 below, knee 15 below.
export const RIG = { hipY: 31, hipX: 4.5, neckY: 18, shX: 10.5, shY: 14.4, upper: 11, fore: 11.5, thigh: 14.5, shin: 16 };

function thighV(p) {
  const v = new Vox();
  v.cylY(0, 0, -15, 0, 2.9, 2.9, 3.5, 3.6, p.cloth);
  v.recolor((x, y, z, c) => (z >= 1 && y <= -2 && y >= -10 ? (mod(y, 3) === 0 ? sh(p.plate, 0.76) : p.plate) : undefined));   // cuisse
  v.recolor((x, y, z) => (z >= 1 && (y === -11 || y === -12) ? p.trim : undefined));
  return v;
}
function shinV(p) {
  const v = new Vox();
  v.cylY(0, 0, -14, -1, 2.3, 2.5, 2.9, 3.0, p.boot);
  v.recolor((x, y, z, c) => (z >= 0 && y <= -4 && y >= -12 ? (x === -1 || x === 0 ? sh(p.plate, 1.1) : p.plate) : undefined));  // greave + ridge
  v.recolor((x, y) => (y === -13 || y === -3 ? p.trim : undefined));
  v.ell(0, -0.5, 0.9, 3.3, 2.5, 3.4, p.plate);                                             // knee cop
  v.ell(0, -0.5, 3.6, 1.4, 1.4, 1.2, p.trim2 || p.trim);
  for (let y = -16; y <= -14; y++) v.layer(y, 0, 1.6, 2.9, y === -14 ? 3.8 : 4.8, y === -16 ? sh(p.boot, 0.5) : p.boot, 3);
  v.box(-1, -15, 6, 0, -14, 7, p.trim); v.box(-1, -13, 7, 0, -13, 7, p.trim);          // upturned toe
  return v;
}
function pelvisV(p) {
  const v = new Vox();
  for (let y = -3; y <= 5; y++) v.layer(y, 0, 0, 6.6 + Math.min(0, y) * 0.5, 4.2, p.cloth, 3);
  for (let y = 3; y <= 5; y++) v.layer(y, 0, 0, 7.1, 4.7, y === 4 ? sh(p.belt, 1.2) : p.belt, 3);
  const panel = (x0, x1, z0, z1, y0, y1, base) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) {
      let c = mod(y1 - y, 3) === 2 ? sh(base, 0.76) : mod(x + z + (Math.floor((y1 - y) / 3) & 1), 3) === 0 ? sh(base, 0.88) : base;
      if (y <= y0 + 1) c = p.trim;
      v.set(x, y, z, c);
    }
  };
  panel(-7, -2, 5, 5, -12, 2, p.armor); panel(1, 6, 5, 5, -12, 2, p.armor);               // front tassets
  panel(-7, 6, -6, -6, -13, 2, p.armor);                                                  // back
  panel(-8, -8, -4, 3, -10, 2, p.plate); panel(7, 7, -4, 3, -10, 2, p.plate);             // hips
  for (let y = -16; y <= 2; y++) for (let x = -1; x <= 0; x++) v.set(x, y, 5, y <= -14 ? (p.trim2 || p.trim) : mod(y, 4) === 0 ? sh(p.trim, 0.8) : p.trim);  // centre tabard
  v.box(-2, 3, 5, 1, 5, 5, p.metal || p.trim2 || p.trim); v.box(-1, 4, 6, 0, 4, 6, p.trim2 || p.trim);   // buckle
  v.set(-3, 5, 5, p.metal || p.trim).set(2, 5, 5, p.metal || p.trim);
  return v;
}
function torsoV(p, o) {
  const v = new Vox();
  for (let y = 0; y <= 17; y++) {
    const t = Math.min(1, y / 11), s = t * t * (3 - 2 * t);
    let w = 6.4 + 2.3 * s, d = 4.0 + 1.2 * s;
    if (y >= 16) { w -= (y - 15) * 0.9; d -= (y - 15) * 0.5; }
    v.layer(y, 0, 0, w, d, y <= 2 ? p.cloth : p.armor, 3);
  }
  v.recolor(lam(p.armor));
  v.recolor((x, y, z, c) => (c !== p.cloth && (y === 3 || y === 15) ? p.trim : undefined));
  // breast disc
  for (let x = -4; x <= 3; x++) for (let y = 7; y <= 14; y++) {
    const r = Math.hypot(x + 0.5, y - 10.5);
    if (r < 3.6) v.face(x, y, r > 2.6 ? p.trim : r < 1.2 ? (p.trim2 || p.trim) : (p.metal || p.plate), r < 2.6 ? 1 : 0);
  }
  // shoulder straps, front and back
  for (const x of [-6, -5, 4, 5]) for (let y = 11; y <= 17; y++) { v.face(x, y, sh(p.plate, 0.9)); v.face(x, y, sh(p.plate, 0.9), 0, -1); }
  v.cylY(0, -0.3, 16, 19, 3.9, 3.7, 3.2, 3.0, p.trim);                                    // collar
  if (o.scarf) { v.ell(0, 17.2, -0.5, 5.2, 2.0, 4.6, p.trim); v.ell(0, 17.4, -0.5, 5.2, 0.6, 4.6, p.trim2 || p.trim); }
  if (o.adou) {                                                                            // A Dou in a sling on the chest
    for (let x = -8; x <= 7; x++) for (let y = 3; y <= 16; y++) if (Math.abs((x + 0.5) + (y - 9.5) * 0.85) < 1.3) { v.face(x, y, 0xb8902e, 1); v.face(x, y, 0xb8902e, 1, -1); }
    v.ell(-0.5, 7.4, 6.6, 4.4, 3.4, 2.6, (x, y) => (mod(x + y, 4) === 0 ? 0xc79a34 : 0xdcb24a));
    v.ell(-0.5, 10.6, 7.6, 2.4, 2.3, 2.0, 0xf6dcc4);
    v.set(-2, 11, 9, 0x2a2018).set(0, 11, 9, 0x2a2018).set(-1, 10, 9, 0xd88a7a);
    v.ell(-0.5, 12.6, 7.4, 2.5, 1.2, 2.1, 0xb8322a);                                       // little red cap
  }
  return v;
}
function headV(p, o) {
  const v = new Vox(), H = p.hair, skin = p.skin;
  v.cylY(0, -0.4, 0, 3, 2.3, 2.3, 2.3, 2.3, sh(skin, 0.92));
  const jaw = (x, y) => y >= 7 || Math.abs(x + 0.5) <= 2.7 + (y - 3) * 0.75;
  v.ell(0, 9.5, 0, 5.7, 6.4, 5.7, skin, jaw);
  // hair cap: crown, back and temples
  v.ell(0, 10.4, -0.5, 6.3, 6.2, 6.3, (x, y, z) => (hash3(x, y, z) < 0.25 ? sh(H, 1.5) : H), (x, y, z) => y >= 13 || (z < -1 && y >= 5) || (Math.abs(x + 0.5) > 4.6 && z < 2 && y >= 9));
  // face
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -3 : 1;
    v.face(x0, 9, p.eye).face(x0 + 1, 9, p.eye).face(x0, 8, p.eye).face(x0 + 1, 8, p.eye);
    v.face(s < 0 ? x0 : x0 + 1, 9, 0xffffff);
    for (let x = x0 - (s < 0 ? 1 : 0); x <= x0 + 1 + (s > 0 ? 1 : 0); x++) v.face(x, 11, H);
  }
  v.face(-1, 7, sh(skin, 0.9)).face(0, 7, sh(skin, 0.9));
  v.face(-1, 5, sh(p.lip, 0.85)).face(0, 5, sh(p.lip, 0.85));
  if (o.headband) {
    v.recolor((x, y) => (y === 12 || y === 13 ? (y === 13 ? p.trim : sh(p.trim, 0.85)) : undefined));
    for (let k = 0; k < 12; k++) { v.set(-2, 12 - k, -7 - (k >> 2), p.trim); v.set(1, 11 - k, -7 - ((k + 2) >> 2), p.trim2 || p.trim); }
  }
  if (!o.helm) {   // fringe
    const len = [3, 3, 2, 3, 2, 1, 2, 3, 2, 3, 3];
    for (let x = -6; x <= 4; x++) for (let k = 0; k < len[x + 6]; k++) v.face(x, 14 - k, hash3(x, k, 3) < 0.3 ? sh(H, 1.5) : H, k === 0 ? 1 : 0);
    for (let k = 0; k < 5; k++) { v.face(-6, 12 - k, H, 1); v.face(5, 12 - k, H, 1); }
  }
  if (o.topknot) {
    v.cylY(0, -1.5, 15, 20, 2.1, 2.1, 1.6, 1.6, H);
    v.cylY(0, -1.5, 16, 17, 2.9, 2.9, 2.9, 2.9, p.metal || p.trim2);
    v.box(-4, 17, -2, 3, 17, -2, p.metal || p.trim2);
    for (let k = 0; k <= 22; k++) {
      const t = k / 22;
      v.ell(Math.sin(t * 5) * 0.5, 20.5 - t * 3 - t * t * 20, -3.5 - t * 6.5 - Math.sin(t * 3.1) * 1.5, 1.9 - t * 0.9, 1.5, 1.9 - t * 0.9, (x, y, z) => (hash3(x, y, z) < 0.3 ? sh(H, 1.6) : H));
    }
  }
  if (o.helm) {
    const hm = p.helm;
    v.ell(0, 10.2, -0.2, 7.0, 6.8, 7.0, (x, y, z) => (mod(Math.round(Math.atan2(z + 0.7, x + 0.5) * 5), 2) === 0 ? sh(hm, 1.25) : hm), (x, y) => y >= 10);
    v.ell(0, 10.2, -0.2, 8.0, 0.9, 8.0, p.trim, (x, y, z) => y === 9 || y === 10 ? Math.hypot(x + 0.5, z + 0.7) > 6.2 : false);   // brim
    v.box(-2, 9, 7, 1, 10, 8, p.trim);                                                         // peak
    v.face(-1, 12, p.trim2 || p.trim, 1).face(0, 12, p.trim2 || p.trim, 1).face(-1, 13, p.trim2 || p.trim, 1).face(0, 13, p.trim2 || p.trim, 1).face(-1, 11, p.trim, 1).face(0, 11, p.trim, 1);
    // neck guard: lamellar curtain round the back and sides
    v.ell(0, 6, -0.4, 7.4, 4.6, 7.4, (x, y) => (mod(y, 2) === 0 ? sh(hm, 0.7) : sh(hm, 1.1)), (x, y, z) => y >= 2 && y <= 9 && z < 1.5 && Math.hypot(x + 0.5, z + 0.9) > 6.0, true);
    for (let y = 3; y <= 9; y++) for (let z = 1; z <= 3; z++) { v.set(-7, y, z, y === 3 ? p.trim : hm); v.set(6, y, z, y === 3 ? p.trim : hm); }   // cheek guards
    v.cylY(0, -0.2, 16, 19, 1.8, 1.8, 0.9, 0.9, p.trim2 || p.trim);
    for (let k = 0; k <= 9; k++) { const t = k / 9; v.ell(0, 20.5 + Math.sin(t * 2.6) * 3.2, -0.5 - t * 7, 2.3 - t * 1.2, 2.0 - t * 0.8, 2.3 - t * 0.8, (x, y, z) => (hash3(x, y, z) < 0.3 ? sh(p.plume, 1.25) : p.plume)); }
    if (o.horns) for (let i = 0; i < 11; i++) for (const s of [-1, 1]) { const hx = 7 + Math.sin(i * 0.22) * 6, hy = 11 + i * 1.25; v.box(Math.round(s * hx - 0.5), Math.round(hy), 0, Math.round(s * hx - 0.5), Math.round(hy) + 1, 1, i > 8 ? 0xfff2c0 : p.trim2); }
  }
  if (o.beard) {
    for (let x = -4; x <= 3; x++) for (let y = 3; y <= 6; y++) if (!(y === 5 && (x === -1 || x === 0))) v.face(x, y, H, y < 6 ? 1 : 0);
    v.ell(0, 1.0, 3.8, 3.6, 4.2, 2.2, (x, y, z) => (hash3(x, y, z) < 0.3 ? sh(H, 1.6) : H));
    for (let x = -5; x <= 4; x++) v.face(x, 11, H, 1);                                          // heavy brow
  }
  return v;
}
function upperArmV(p) {
  const v = new Vox();
  v.cylY(0, 0, -11, 0, 2.3, 2.3, 2.7, 2.7, p.cloth);
  for (const [cy, r, ry, c] of [[-4.6, 4.0, 2.3, p.plate], [-2.0, 4.5, 2.5, p.armor], [1.0, 5.0, 3.2, p.plate]]) {
    const y0 = Math.floor(cy - 0.5);
    v.ell(0, cy, 0, r, ry, r, (x, y) => (y === y0 ? p.trim : y === y0 + 1 ? sh(c, 0.82) : c), (x, y) => y >= y0);
  }
  v.ell(0, 3.4, 0, 1.6, 1.2, 1.6, p.trim2 || p.trim);
  return v;
}
function foreArmV(p) {
  const v = new Vox();
  v.cylY(0, 0, -9, 0, 2.2, 2.2, 2.7, 2.7, p.armor);
  v.recolor((x, y, z, c) => (y === -1 || y === -9 ? p.trim : z <= -1 ? (mod(y, 2) ? p.plate : sh(p.plate, 0.85)) : undefined));
  v.cylY(0, 0, -10, -10, 1.9, 1.9, 1.9, 1.9, p.cloth);
  for (let y = -14; y <= -11; y++) v.layer(y, 0, 0, 2.1, y === -14 ? 1.6 : 2.1, y === -14 ? sh(p.skin, 0.92) : p.skin, 3);
  v.set(2, -12, 1, p.skin).set(-3, -12, 1, p.skin);
  return v;
}
const CAPE_H = 12;
function capeV(p, seg, n = 3) {
  const v = new Vox();
  for (let y = -CAPE_H; y <= -1; y++) {
    const ya = seg * CAPE_H - y, hw = Math.min(10, 6.5 + ya * 0.12);
    for (let x = -10; x <= 9; x++) {
      if (Math.abs(x + 0.5) > hw) continue;
      const fold = mod(x + 40, 4) < 2 ? 0 : -1;
      let c = fold ? sh(p.cape, 0.88) : p.cape;
      if (Math.abs(x + 0.5) > hw - 1.3) c = p.trim;
      if (seg === n - 1 && y <= -CAPE_H + 1) c = p.trim;
      if (seg === n - 1 && y === -CAPE_H && mod(x + 40, 4) === 1) continue;
      if (seg === 1) { const r = Math.hypot(x + 0.5, y + 5.5); if (r < 4.4 && r > 3.0) c = p.trim; else if (r < 1.5) c = p.trim2 || p.trim; }
      v.set(x, y, fold, c);
    }
  }
  return v;
}

// weapons: along +Z, pivot = right-hand grip
export function weaponV(kind) {
  const v = new Vox();
  const ring = (z, c) => v.set(-1, 0, z, c).set(1, 0, z, c).set(0, -1, z, c).set(0, 1, z, c);
  const S1 = 0xd3d9e0, S2 = 0xf4f7fa, G = 0xd8b04a;
  if (kind === 'spear') {                                     // 龍膽亮銀槍
    v.box(0, 0, -24, 0, 0, 56, 0x3a2c24);
    for (let z = -18; z <= 50; z += 12) ring(z, 0x9aa0aa);
    v.box(0, 0, -29, 0, 0, -25, S1); ring(-25, S1); ring(-26, G);
    v.box(-1, -1, 57, 1, 1, 59, G); ring(58, 0xf0d27a);
    v.ell(0.5, -2.2, 54.5, 2.5, 3.0, 2.3, (x, y, z) => (hash3(x, y, z) < 0.35 ? 0x5a9cf0 : 0x3d7fd6));
    v.box(0, -8, 54, 0, -5, 54, 0x5a9cf0).set(1, -6, 55, 0x3d7fd6).set(-1, -7, 53, 0x3d7fd6).set(1, -7, 53, 0x5a9cf0);
    for (let z = 60; z <= 74; z++) {
      const hw = z < 63 ? 1 + (z - 60) : 3.4 * (1 - (z - 63) / 11.6);
      for (let x = -3; x <= 3; x++) if (Math.abs(x) <= hw) v.set(x, 0, z, Math.abs(x) >= hw - 0.9 ? S2 : S1);
      if (z <= 69) v.set(0, 1, z, 0xe6eaef).set(0, -1, z, 0xe6eaef);
    }
  } else if (kind === 'sword') {                             // 青釭劍
    v.box(0, 0, -6, 0, 0, -1, 0x5a3a22); ring(-3, 0x3a2416); ring(-5, 0x3a2416); ring(-7, G); v.set(0, 0, -8, G).set(0, 0, -7, G);
    v.box(-3, 0, 0, 3, 0, 1, G); v.box(-1, -1, 0, 1, 1, 1, G); v.set(-4, 0, 1, G).set(4, 0, 1, G);
    for (let z = 2; z <= 34; z++) { const hw = z > 31 ? 0 : 1; for (let x = -hw; x <= hw; x++) v.set(x, 0, z, x === 0 ? 0x7fd4ee : 0xd8f6ff); if (z < 28) v.set(0, 1, z, 0x9fe6fa).set(0, -1, z, 0x9fe6fa); }
  } else if (kind === 'halberd') {                           // 三尖兩刃刀
    v.box(0, 0, -24, 0, 0, 46, 0x2a2420); for (let z = -16; z <= 40; z += 14) ring(z, 0x8a6a2a);
    v.box(-1, -1, 46, 1, 1, 48, G); v.ell(0.5, -2, 44, 2, 2.6, 2, 0xb3261c);
    for (let z = 49; z <= 68; z++) { const hw = z > 64 ? 0 : z > 60 ? 1 : 2; for (let x = -hw; x <= hw; x++) v.set(x, 0, z, Math.abs(x) === hw ? S2 : S1); }
    for (const s of [-1, 1]) for (let z = 50; z <= 62; z++) { const x = s * (z < 54 ? 3 + (z - 50) / 2 : 5); v.set(Math.round(x), 0, z, z > 59 ? S2 : S1); if (z < 60) v.set(Math.round(x) - s, 0, z, S1); }
    for (let z = 49; z <= 58; z++) v.set(0, 1, z, 0xe6eaef).set(0, -1, z, 0xe6eaef);
  } else if (kind === 'glaive') {                            // 大刀
    v.box(0, 0, -22, 0, 0, 44, 0x3a2e24); for (let z = -14; z <= 38; z += 13) ring(z, 0x8a6a2a);
    v.box(-1, -1, 44, 1, 1, 46, G); v.ell(0.5, -2, 42.5, 2, 2.6, 2, 0xb3261c);
    for (let z = 47; z <= 72; z++) {
      const t = (z - 47) / 25, top = Math.round(2 + Math.sin(t * 2.6) * 5 + t * 2), bot = Math.round(-1 + t * t * 6);
      for (let y = bot; y <= top; y++) v.set(0, y, z, y === bot ? S2 : y === top ? 0x9aa0aa : S1);
    }
    v.box(0, 6, 50, 0, 8, 51, 0x9aa0aa); v.set(0, 9, 50, 0x9aa0aa);                         // back hook
  } else if (kind === 'claw') {                              // 張郃 鉤爪
    v.box(-2, -2, -3, 2, 2, 2, 0x6e58a0); v.box(-3, -1, 3, 3, 1, 4, G);
    for (const x of [-3, 0, 3]) { for (let z = 5; z <= 22; z++) v.set(x, z > 16 ? Math.round((z - 16) * 0.5) : 0, z, z > 19 ? S2 : S1); for (let z = 5; z <= 12; z++) v.set(x, -1, z, 0x9aa0aa); }
  } else if (kind === 'hammer') {                            // 許褚 大錘
    v.box(0, 0, -16, 0, 0, 38, 0x3a2e24); for (let z = -10; z <= 32; z += 14) ring(z, 0x8a6a2a);
    v.box(-1, -1, 38, 1, 1, 40, G);
    for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) for (let z = 41; z <= 53; z++) {
      if (Math.abs(x) === 4 && Math.abs(y) === 4) continue;
      const face = Math.abs(x) === 4 || Math.abs(y) === 4 || z === 41 || z === 53;
      if (!face) continue;
      v.set(x, y, z, (z === 41 || z === 53 || z === 47) ? G : (x + y + z) % 4 === 0 ? 0x6a6e78 : 0x4a4e58);
    }
    for (const [x, y] of [[-5, 0], [5, 0], [0, -5], [0, 5]]) { v.set(x, y, 44, G); v.set(x, y, 50, G); }
  } else if (kind === 'serpent') {                           // 丈八蛇矛
    v.box(0, 0, -30, 0, 0, 54, 0x1e1a18); for (let z = -20; z <= 46; z += 11) ring(z, 0x8a2a22);
    v.box(-1, -1, 54, 1, 1, 56, 0xa8322a); v.ell(0.5, -2, 52.5, 2, 2.6, 2, 0xb3261c);
    for (let z = 57; z <= 82; z++) { const ox = Math.round(Math.sin((z - 57) * 0.62) * 1.5); for (let x = -1; x <= 1; x++) v.set(ox + x, 0, z, x ? S2 : S1); }
    for (let z = 83; z <= 87; z++) v.set(-1 - ((z - 83) >> 1), 0, z, S2).set(1 + ((z - 83) >> 1), 0, z, S2);
  }
  return v;
}

// A rigged warrior as a THREE.Group hierarchy. Returns { root, body, j: joints, mat, scale }.
export function buildWarrior(p, o = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.06 });
  const g = (vox) => vox.geometry({ jit: 0.045 });
  const mesh = (geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
  const node = (parent, x, y, z, geo) => { const n = new THREE.Group(); n.position.set(x * VS, y * VS, z * VS); if (geo) n.add(mesh(geo)); parent.add(n); return n; };
  const root = new THREE.Group();
  const scale = o.scale || 1;
  const body = new THREE.Group(); body.scale.setScalar(scale); root.add(body);
  const j = {};
  j.hips = node(body, 0, RIG.hipY + 1, 0, g(pelvisV(p)));
  j.torso = node(j.hips, 0, 6, 0, g(torsoV(p, o)));
  j.head = node(j.torso, 0, RIG.neckY, 0, g(headV(p, o)));
  const thigh = g(thighV(p)), shin = g(shinV(p)), up = g(upperArmV(p)), fore = g(foreArmV(p));
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    const th = node(j.hips, s * (RIG.hipX + 0.5), -2, 0, thigh);
    const shn = node(th, 0, -RIG.thigh - 0.5, 0, shin);
    const ua = node(j.torso, s * (RIG.shX + 0.5), RIG.shY, 0, up);
    const fa = node(ua, 0, -RIG.upper, 0, fore);
    j['thigh' + L] = th; j['shin' + L] = shn; j['upper' + L] = ua; j['fore' + L] = fa;
  }
  if (o.cape) {
    j.cape0 = node(j.torso, 0, 16, -6, g(capeV(p, 0)));
    j.cape1 = node(j.cape0, 0, -CAPE_H, 0, g(capeV(p, 1)));
    j.cape2 = node(j.cape1, 0, -CAPE_H, 0, g(capeV(p, 2)));
  }
  j.wep = node(j.torso, 0, 0, 0, g(weaponV(o.weapon || 'spear')));
  if (o.offhand) j.wep2 = node(j.torso, 0, 0, 0, g(weaponV(o.offhand)));
  root.traverse((n) => { if (n.isMesh) n.frustumCulled = false; });
  return { root, body, j, mat, scale };
}

// ------------------------------------------------------------------ Wei soldier parts (instanced). lod 0 = 3 cm voxels, lod 1 = half resolution.
// Pivots: body = hip centre (shoulders at ±10, 21; neck at 24), head = neck, arm = shoulder (hand at -21), leg = hip joint (sole at -32).
export function soldierParts(lod = 0) {
  const p = PAL.grunt;
  const body = new Vox();
  for (let y = -3; y <= 23; y++) {
    const t = Math.min(1, Math.max(0, (y - 4) / 12)), s = t * t * (3 - 2 * t);
    let w = 6.3 + 2.0 * s, d = 4.0 + 1.0 * s;
    if (y >= 22) { w -= (y - 21) * 1.0; d -= (y - 21) * 0.5; }
    if (y < 0) w += y * 0.4;
    body.layer(y, 0, 0, w, d, y < 3 ? p.cloth : p.armor, 3);
  }
  body.recolor(lam(p.armor, 3, 3, 1.35, 0.62));
  for (let y = 3; y <= 6; y++) body.layer(y, 0, 0, 7.0, 4.6, y === 5 ? sh(p.trim, 1.2) : p.trim, 3);     // sash
  body.box(4, -3, 4, 5, 3, 5, p.trim); body.box(4, -6, 5, 4, -4, 5, sh(p.trim, 1.2));                      // sash knot + tail
  for (let x = -3; x <= 2; x++) for (let y = 12; y <= 17; y++) { const r = Math.hypot(x + 0.5, y - 14.5); if (r < 2.9) body.face(x, y, r > 1.9 ? 0x6a5a3a : 0x9a8450, r < 1.9 ? 1 : 0); }   // bronze heart mirror
  for (const x of [-6, -5, 4, 5]) for (let y = 16; y <= 23; y++) { body.face(x, y, 0x4a3a2c); body.face(x, y, 0x4a3a2c, 0, -1); }
  const panel = (x0, x1, z0, z1, y0, y1) => { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) body.set(x, y, z, y <= y0 + 1 ? p.trim : mod(y1 - y, 3) === 2 ? sh(p.armor, 0.7) : mod(x + z, 3) === 0 ? p.armor : sh(p.armor, 1.3)); };
  panel(-7, -1, 5, 5, -11, 2); panel(0, 6, 5, 5, -11, 2); panel(-7, 6, -6, -6, -11, 2); panel(-8, -8, -4, 3, -9, 2); panel(7, 7, -4, 3, -9, 2);
  body.ell(0, 23.2, -0.3, 4.4, 1.8, 4.0, p.trim);                                                         // neck scarf

  const face = (v) => {
    v.cylY(0, -0.4, 0, 3, 2.2, 2.2, 2.2, 2.2, sh(p.skin, 0.9));
    v.ell(0, 9, 0, 5.3, 6.0, 5.3, p.skin, (x, y) => y >= 7 || Math.abs(x + 0.5) <= 2.7 + (y - 3) * 0.7);
    for (const x of [-3, -2, 1, 2]) { v.face(x, 7, p.eye); v.face(x, 8, p.eye); }
    for (const x of [-4, -3, -2, 1, 2, 3]) v.face(x, 9, p.hair);
    v.face(-1, 6, sh(p.skin, 0.88)).face(0, 6, sh(p.skin, 0.88));
    v.face(-1, 4, 0x9a6050).face(0, 4, 0x9a6050);
  };
  const helmet = (v, hm, rim, plume, big) => {
    v.ell(0, 9.6, -0.2, 6.5, 6.6, 6.5, (x, y, z) => (mod(Math.round(Math.atan2(z + 0.7, x + 0.5) * 4), 2) === 0 ? sh(hm, 1.3) : hm), (x, y) => y >= 10);
    v.ell(0, 10, -0.2, 7.6, 0.9, 7.6, rim, (x, y, z) => (y === 9 || y === 10) && Math.hypot(x + 0.5, z + 0.7) > 5.6);
    v.ell(0, 6, -0.4, 6.9, 4.4, 6.9, (x, y) => (mod(y, 2) === 0 ? sh(hm, 0.72) : sh(hm, 1.2)), (x, y, z) => y >= 3 && y <= 9 && z < 1 && Math.hypot(x + 0.5, z + 0.9) > 5.5, true);
    v.cylY(0, -0.2, 16, 18, 1.5, 1.5, 0.9, 0.9, rim);
    const n = big ? 8 : 5;
    for (let k = 0; k <= n; k++) { const t = k / n; v.ell(0, 19.6 + Math.sin(t * 2.8) * (big ? 3 : 1.6), -0.3 - t * (big ? 6 : 3.2), (big ? 2.6 : 2.1) - t, 1.9 - t * 0.6, (big ? 2.6 : 2.1) - t * 0.6, (x, y, z) => (hash3(x, y, z) < 0.3 ? sh(plume, 1.3) : plume)); }
  };
  const head = new Vox(); face(head); helmet(head, p.helm, 0x5a606c, p.plume, false);
  const cap = new Vox(); face(cap);
  for (let x = -4; x <= 3; x++) for (let y = 3; y <= 6; y++) if (!(y === 5 && (x === -1 || x === 0))) cap.face(x, y, p.hair, y < 5 ? 1 : 0);
  helmet(cap, 0xc39a3a, 0x8a6a22, 0xc02a1e, true);
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) { const hx = 7 + i * 0.9, hy = 11 + i * 1.3; cap.box(Math.round(s * hx - 0.5), Math.round(hy), -1, Math.round(s * hx - 0.5), Math.round(hy) + 1, 0, 0xe6c664); }

  const arm = new Vox();
  arm.cylY(0, 0, -17, 0, 2.3, 2.3, 2.7, 2.7, p.cloth);
  arm.ell(0, 0.6, 0, 4.4, 3.0, 4.4, (x, y, z) => (y === -2 ? p.trim : mod(x + z, 3) === 0 ? p.plate : sh(p.plate, 0.8)), (x, y) => y >= -2);
  arm.ell(0, -2.6, 0, 3.9, 2.0, 3.9, (x, y) => (y === -4 ? p.trim : p.armor), (x, y) => y >= -4 && y <= -3, true);
  arm.recolor((x, y, z, c) => (y <= -11 && y >= -16 && c === p.cloth ? (mod(y, 2) ? 0x4a3a2c : 0x3a2c20) : undefined));       // leather bracer
  for (let y = -21; y <= -18; y++) arm.layer(y, 0, 0, 2.1, y === -21 ? 1.6 : 2.1, p.skin, 3);
  const leg = new Vox();
  leg.cylY(0, 0, -16, 0, 2.8, 2.8, 3.4, 3.5, p.cloth);
  leg.cylY(0, 0, -27, -17, 2.3, 2.4, 2.8, 2.8, (x, y) => (mod(y + (x >> 1), 3) === 0 ? sh(p.wrap, 0.75) : p.wrap));                 // leg wraps
  for (let y = -32; y <= -28; y++) leg.layer(y, 0, 1.4, 2.8, y >= -29 ? 3.4 : 4.6, y === -32 ? 0x0e0e10 : p.boot, 3);

  const ring = (v, z, c) => v.set(-1, 0, z, c).set(1, 0, z, c).set(0, -1, z, c).set(0, 1, z, c);
  const spear = new Vox();
  spear.box(0, 0, -20, 0, 0, 48, 0x4a3a2c); ring(spear, 47, 0x7a808a); ring(spear, 48, 0x7a808a);
  spear.ell(0.5, -1.8, 44.5, 2, 2.6, 2, p.plume);
  for (let z = 49; z <= 60; z++) { const hw = z < 52 ? z - 49 : 2.6 * (1 - (z - 52) / 8.5); for (let x = -2; x <= 2; x++) if (Math.abs(x) <= hw) spear.set(x, 0, z, Math.abs(x) >= hw - 0.9 ? 0xd0d4dc : 0xa8aeb8); }
  const sword = new Vox();
  sword.box(0, 0, -5, 0, 0, -1, 0x3a2a1e); sword.set(0, 0, -6, 0x8a6a2a); sword.box(-2, 0, 0, 2, 0, 0, 0x7a7a82); sword.box(0, -1, 0, 0, 1, 0, 0x7a7a82);
  for (let z = 1; z <= 26; z++) { const hw = z > 23 ? 0 : 1; for (let x = -hw; x <= hw; x++) sword.set(x, 0, z, x ? 0xd8dce4 : 0xa8aeb8); }
  const shield = new Vox();
  for (let x = -8; x <= 7; x++) for (let y = -8; y <= 7; y++) {
    const r = Math.hypot(x + 0.5, y + 0.5); if (r > 7.8) continue;
    shield.set(x, y, 0, r > 6.6 ? 0x4a4e58 : mod(x, 3) === 0 ? 0x5e2a1c : 0x7a3624);
    if (r > 6.6 || r < 2.2) shield.set(x, y, 1, r < 2.2 ? 0xc8a24a : 0x5a606c);
    else if (Math.abs(Math.abs(x + 0.5) - Math.abs(y + 0.5)) < 0.8 && r < 5.6) shield.set(x, y, 1, 0x1e1a18);
  }
  shield.ell(0, 0, 1.6, 1.4, 1.4, 1.2, 0xe6c664);
  const bow = new Vox();
  for (let i = -18; i <= 18; i++) { const z = Math.round(5 - (i * i) / 62); bow.set(0, i, z, Math.abs(i) < 3 ? 0x8a2a22 : 0x5a3a22); if (Math.abs(i) > 15) bow.set(0, i, z - 1, 0x2a2018); bow.set(0, i, -1, 0xe8e0d0); }
  const pole = new Vox();
  pole.box(0, 0, 0, 0, 116, 0, 0x4a3a2c); for (let y = 10; y <= 110; y += 20) pole.box(-1, y, 0, 1, y, 0, 0x2a2018).box(0, y, -1, 0, y, 1, 0x2a2018);
  pole.ell(0.5, 119, 0.5, 1.6, 2.6, 1.6, 0xd8b04a); pole.box(0, 76, 1, 0, 76, 32, 0x4a3a2c); pole.set(0, 76, 33, 0xd8b04a);
  const G = (v) => { let q = v; for (let i = 0; i < lod; i++) q = q.down(); return q.geometry({ s: VS * (1 << lod), jit: 0.05 }); };
  return { body: G(body), head: G(head), cap: G(cap), arm: G(arm), leg: G(leg), spear: G(spear), sword: G(sword), shield: G(shield), bow: G(bow), pole: G(pole) };
}

// ------------------------------------------------------------------ azure dragon (musou), 7 cm voxels
export function dragonParts() {
  const S = 0.07;
  const B = 0x2476d8, B2 = 0x57b6ff, B3 = 0x163f9a, W = 0xeaf6ff, G = 0xf2c858, C = 0x7fe6ff;
  const scales = (x, y, z) => (y + 0.5 < -1.4 ? (mod(z, 2) ? 0xd8ecff : 0xb6d8f6) : mod(z + (mod(x + y, 2)), 3) === 0 ? B3 : hash3(x, y, z) < 0.25 ? B2 : B);
  const head = new Vox();
  head.ell(0, 0.5, 3, 4.2, 3.6, 5.2, scales);                              // skull
  head.ell(0, -0.2, 10.5, 3.0, 2.4, 5.6, scales);                          // snout
  head.ell(0, 0.8, 15.2, 2.6, 1.6, 1.6, B2);                               // nose
  head.set(-2, 1, 16, 0x0e1a3a).set(1, 1, 16, 0x0e1a3a);
  head.ell(0, -3.4, 8.5, 2.6, 1.0, 6.2, (x, y, z) => (mod(z, 2) ? 0xd8ecff : 0xb6d8f6));    // lower jaw
  for (let z = 6; z <= 14; z += 2) for (const x of [-3, 2]) { head.set(x, -2, z, W); head.set(x, -3, z + 1, W); }   // teeth
  head.set(-3, -1, 15, W).set(2, -1, 15, W).set(-3, -2, 15, W).set(2, -2, 15, W);
  for (const s of [-1, 1]) {
    const ex = s < 0 ? -5 : 4;
    head.box(ex, 1, 5, ex, 2, 7, 0xffe25a); head.set(ex, 1, 6, 0x1a1408).set(ex + (s < 0 ? 0 : 0), 2, 7, 0xfff6c0);       // eye
    head.box(ex, 3, 4, ex, 3, 8, B3); head.set(ex, 4, 4, B3);                                                             // brow ridge
    for (let i = 0; i < 12; i++) { const hx = s * (2.5 + i * 0.25), hy = 3 + i * 0.8, hz = 0 - i * 1.1; head.box(Math.round(hx - 0.5), Math.round(hy), Math.round(hz), Math.round(hx - 0.5), Math.round(hy) + 1, Math.round(hz), i > 9 ? 0xfff2c0 : G); if (i === 6) for (let k = 1; k < 5; k++) head.set(Math.round(hx - 0.5 + s * k * 0.6), Math.round(hy + k), Math.round(hz + 1), G); }   // antlers
    for (let i = 0; i < 14; i++) head.set(Math.round(s * (2.6 + i * 0.5) - 0.5), Math.round(-0.5 - Math.sin(i * 0.3) * 2.5), 14 + Math.round(i * 0.35), i > 11 ? 0xfff2c0 : G);                  // whiskers
    for (let i = 0; i < 6; i++) head.ell(s * (4 + i * 0.3), 0.5 - i * 0.2, -1 - i * 1.3, 1.4, 1.8 - i * 0.2, 1.6, i % 2 ? W : C);                                                             // cheek mane
  }
  for (let i = 0; i < 7; i++) head.ell(0, 4.2 - i * 0.2, 2 - i * 1.6, 1.3, 2.2 - i * 0.2, 1.6, i % 2 ? C : W);          // crest mane
  for (let i = 0; i < 4; i++) head.set(-1, -5 - i, 5 + i, W).set(0, -5 - i, 6 + i, C);                                    // chin beard
  const seg = new Vox();
  seg.ell(0, 0, 0, 3.0, 3.0, 3.6, scales);
  for (let z = -3; z <= 2; z++) { const h = 3 + (z === -1 || z === 0 ? 2 : z === -2 || z === 1 ? 1 : 0); for (let y = 3; y <= h; y++) seg.set(-1, y, z, y === h ? W : C).set(0, y, z, y === h ? W : C); }   // dorsal fin
  const tail = new Vox();
  tail.ell(0, 0, 0, 1.6, 1.6, 2.6, scales);
  for (let i = 0; i < 10; i++) for (const a of [-1, 0, 1]) tail.ell(a * i * 0.45, i * 0.35 * (a === 0 ? 1 : 0.2), -2 - i * 1.2, 0.9, 1.4 - i * 0.08, 1.2, i % 2 ? W : C);
  const claw = new Vox();
  claw.cylY(0, 0, -7, 0, 1.2, 1.2, 1.6, 1.6, scales);
  claw.ell(0, -8, 0.5, 2, 1.2, 2.2, G);
  for (const x of [-2, 0, 1]) for (let k = 0; k < 4; k++) claw.set(x, -9 - (k > 1 ? 1 : 0), 2 + k, k > 2 ? 0xfff6d8 : W);
  const geo = (v) => v.geometry({ s: S, o: [0, 0, 0], jit: 0.08 });
  return { head: geo(head), seg: geo(seg), tail: geo(tail), claw: geo(claw) };
}

// ------------------------------------------------------------------ props
export function propParts() {
  const W = 0x7a5636, W2 = 0x56391f, W3 = 0x94704a, IRON = 0x2e2b2a;
  const P = {};
  const wood = (x, y, z) => { const h = hash3(x >> 1, y >> 2, z >> 1); return h < 0.3 ? W2 : h < 0.75 ? W : W3; };
  // planted stake, sharpened, with a scrap of cloth (5 cm)
  const stake = new Vox();
  for (let y = 0; y <= 30; y++) stake.set(0, y, 0, y > 27 ? 0xd8c8a4 : mod(y, 7) === 0 ? W2 : W);
  stake.set(1, 0, 0, W2).set(-1, 0, 0, W2).set(0, 0, 1, W2).set(0, 0, -1, W2);
  stake.box(1, 20, 0, 2, 22, 0, 0x8a2a20).set(3, 20, 0, 0x8a2a20).set(2, 19, 0, 0x6a1e18);
  P.stake = stake.geometry({ s: 0.05, o: [0.5, 0, 0.5] });
  // spent arrows stuck in the ground (3 cm)
  const arr = new Vox();
  for (const [bx, bz, lx, lz] of [[0, 0, 0.25, 0.1], [6, 3, -0.2, 0.3], [-5, 5, 0.1, -0.35], [3, -6, -0.3, -0.1], [-7, -3, 0.35, 0.2], [9, -2, 0.1, 0.15]]) {
    for (let y = 0; y <= 20; y++) { const x = Math.round(bx + lx * y), z = Math.round(bz + lz * y); arr.set(x, y, z, 0x8e7650); if (y > 15) { arr.set(x + 1, y, z, y % 2 ? 0xf4f0e6 : 0xc42c1e); arr.set(x - 1, y, z, 0xf4f0e6); } }
  }
  P.arrows = arr.geometry({ s: 0.03, o: [0, 0, 0] });
  // 拒馬 cheval-de-frise along X (6 cm): a log with crossed, sharpened stakes
  const jm = new Vox();
  for (let x = -22; x <= 21; x++) jm.ell(x + 0.5, 9, 0, 0.6, 1.7, 1.7, wood);
  for (let x = -19; x <= 19; x += 7) for (let i = -9; i <= 9; i++) {
    const tip = Math.abs(i) > 7;
    jm.set(x, 9 + i, i, tip ? 0xe0d2b0 : W2).set(x + 1, 9 + i, i, tip ? 0xe0d2b0 : W);
    jm.set(x + 3, 9 + i, -i, tip ? 0xe0d2b0 : W2).set(x + 4, 9 + i, -i, tip ? 0xe0d2b0 : W);
  }
  for (const x of [-21, 20]) { jm.box(x, 8, -2, x, 10, 2, IRON); jm.box(x, 7, -1, x, 11, 1, IRON); }
  P.juma = jm.geometry({ s: 0.06, o: [0, 0, 0] });
  // fire basket on a tripod (4 cm); rim at ~1 m
  const bz = new Vox();
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + 0.5; for (let y = 0; y <= 20; y++) { const r = 8 - y * 0.22; bz.set(Math.round(Math.cos(a) * r - 0.5), y, Math.round(Math.sin(a) * r - 0.5), IRON); if (y === 0) bz.set(Math.round(Math.cos(a) * (r + 1) - 0.5), 0, Math.round(Math.sin(a) * (r + 1) - 0.5), IRON); } }
  for (let a = 0; a < 40; a++) bz.set(Math.round(Math.cos(a / 40 * 6.283) * 5 - 0.5), 9, Math.round(Math.sin(a / 40 * 6.283) * 5 - 0.5), IRON);   // brace ring
  bz.ell(0, 25, 0, 8.4, 6, 8.4, (x, y, z) => (mod(Math.round(Math.atan2(z + 0.5, x + 0.5) * 6), 3) === 0 ? 0x4a4440 : IRON), (x, y, z) => y <= 25 && y >= 20);
  bz.ell(0, 25, 0, 9.2, 0.9, 9.2, 0x5a524a, (x, y, z) => y === 25 && Math.hypot(x + 0.5, z + 0.5) > 7.4);
  bz.ell(0, 25, 0, 7.2, 3, 7.2, (x, y, z) => { const h = hash3(x, y, z); return h < 0.3 ? 0x2a1610 : h < 0.65 ? 0xff7a1e : h < 0.9 ? 0xffb43c : 0xffe08a; }, (x, y) => y >= 24 && y <= 27);
  P.brazier = bz.geometry({ s: 0.04, o: [0, 0, 0], jit: 0.04 });
  // crate (5 cm)
  const cr = new Vox();
  for (let x = 0; x < 16; x++) for (let y = 0; y < 15; y++) for (let z = 0; z < 16; z++) {
    if (x > 0 && x < 15 && y > 0 && y < 14 && z > 0 && z < 15) continue;
    const edge = (x < 2 || x > 13 ? 1 : 0) + (y < 2 || y > 12 ? 1 : 0) + (z < 2 || z > 13 ? 1 : 0);
    let c = edge >= 2 ? W2 : mod(y, 4) === 0 ? sh(W3, 0.8) : W3;
    if (edge < 2 && (Math.abs(x - y) < 1 || Math.abs(z - y) < 1) && (x === 0 || x === 15 || z === 0 || z === 15)) c = W2;
    if (edge === 3) c = 0x3a3836;
    cr.set(x, y, z, c);
  }
  cr.box(5, 15, 4, 10, 15, 11, 0xcbb58c); cr.box(6, 16, 6, 9, 16, 9, 0xb8a078);
  P.crate = cr.geometry({ s: 0.05, o: [8, 0, 8] });
  // boulder (10 cm)
  const rock = new Vox();
  const rockC = (x, y, z) => { const h = hash3(x >> 1, y, z >> 1); return y > 4 && hash3(x, 9, z) < 0.35 ? 0x6a7048 : h < 0.3 ? 0x6e6a64 : h < 0.7 ? 0x86827a : 0x9a958a; };
  rock.ell(0, 2.5, 0, 6.5, 4.5, 5.5, rockC, (x, y) => y >= 0); rock.ell(3, 4, 2, 4, 4.5, 3.5, rockC, (x, y) => y >= 0); rock.ell(-3.5, 2, -2, 3.5, 3, 3.5, rockC, (x, y) => y >= 0);
  P.rock = rock.geometry({ s: 0.1, o: [0, 0, 0] });
  // round army tent (12.5 cm)
  const tent = new Vox();
  const canvas = (x, y, z) => { const a = Math.round(Math.atan2(z + 0.5, x + 0.5) * 7); return y === 9 || y === 10 || y === 22 ? 0xa8322a : mod(a, 2) ? 0xe6dcc8 : 0xd8ccb4; };
  for (let y = 0; y <= 30; y++) { const r = y < 10 ? 15 : 15 * Math.pow(1 - (y - 10) / 21, 0.85) + 0.6; tent.layer(y, 0, 0, r, r, canvas, 2, (x, yy, z) => Math.hypot(x + 0.5, z + 0.5) > r - 1.6); }
  for (let y = 0; y <= 8; y++) for (let x = -3; x <= 2; x++) { const z = tent.surf(x, y); if (z !== null) tent.set(x, y, z, Math.abs(x + 0.5) > 2 ? 0xa8322a : 0x2a1f18); }
  tent.box(0, 31, 0, 0, 38, 0, W2); tent.box(1, 35, 0, 4, 37, 0, 0xb8281c); tent.set(5, 36, 0, 0xb8281c);
  P.tent = tent.down().geometry({ s: 0.25, o: [0, 0, 0] });
  // supply cart (5 cm), drawbar toward +X
  const cart = new Vox();
  for (let x = -20; x <= 19; x++) for (let z = -9; z <= 8; z++) cart.set(x, 14, z, mod(z, 3) === 0 ? W2 : W3).set(x, 15, z, mod(z, 3) === 0 ? W2 : W);
  for (let x = -20; x <= 19; x++) { for (const z of [-10, 9]) { cart.set(x, 16, z, W2); cart.set(x, 21, z, W); if (mod(x, 6) === 0) cart.box(x, 14, z, x, 22, z, W2); } }
  cart.box(-21, 14, -10, -21, 21, 9, W); cart.box(20, 14, -10, 20, 21, 9, W);
  for (const z of [-12, 11]) {
    for (let a = 0; a < 64; a++) { const cx = Math.cos(a / 64 * 6.283), cy = Math.sin(a / 64 * 6.283); cart.set(Math.round(cx * 9.5 - 0.5), Math.round(10 + cy * 9.5 - 0.5), z, a % 8 === 0 ? IRON : W2); cart.set(Math.round(cx * 8.5 - 0.5), Math.round(10 + cy * 8.5 - 0.5), z, W2); }
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI; for (let r = -8; r <= 8; r++) cart.set(Math.round(Math.cos(a) * r - 0.5), Math.round(10 + Math.sin(a) * r - 0.5), z, W); }
    cart.box(-2, 8, z, 1, 11, z + (z < 0 ? -1 : 1), IRON);
  }
  cart.box(-1, 9, -11, 0, 10, 10, W2);                                              // axle
  for (const z of [-7, 6]) cart.box(20, 13, z, 40, 14, z, W2);                      // shafts
  cart.box(38, 13, -7, 39, 14, 6, W);
  cart.ell(-11, 19, -3, 6, 4, 5, 0xc4ae82); cart.ell(-10, 19.5, 4, 5, 3.5, 4, 0xb49c70); cart.ell(-12, 24, 0, 5, 3, 5, 0xd0bc92);   // grain sacks
  cart.box(2, 16, -7, 11, 24, 2, W3); cart.box(2, 20, -7, 11, 20, 2, W2); cart.box(6, 16, -7, 7, 24, 2, W2);                       // crate
  for (let k = 0; k < 3; k++) { cart.box(-18, 22 + k, 5 - k, 16, 22 + k, 5 - k, 0x3a2c24); cart.box(17, 22 + k, 5 - k, 21, 22 + k, 5 - k, 0xc8ccd2); }  // spears
  P.cart = cart.geometry({ s: 0.05, o: [0, 0, 0] });
  // weapon rack (5 cm)
  const rack = new Vox();
  for (const x of [-16, 15]) { rack.box(x, 0, -3, x, 26, -3, W2); rack.box(x, 0, 3, x, 26, 3, W2); for (let z = -3; z <= 3; z++) rack.set(x, 26, z, W2); rack.box(x, 0, -4, x, 1, 4, W2); }
  rack.box(-16, 24, 0, 15, 25, 0, W); rack.box(-16, 8, 0, 15, 9, 0, W);
  for (let i = 0; i < 7; i++) {
    const x = -13 + i * 4.3 | 0, top = 40 + (i % 3) * 3;
    rack.box(x, 2, 1, x, top, 1, i % 2 ? 0x3a2c24 : 0x4a3a2c);
    if (i % 3 === 1) { rack.box(x - 2, top - 5, 1, x + 2, top - 3, 1, 0xc0c4ca); rack.box(x, top + 1, 1, x, top + 4, 1, 0xd8dce4); rack.set(x - 2, top - 2, 1, 0xd8dce4).set(x + 2, top - 2, 1, 0xd8dce4); }   // halberd
    else { rack.box(x - 1, top + 1, 1, x + 1, top + 3, 1, 0xc0c4ca); rack.box(x, top + 4, 1, x, top + 6, 1, 0xe0e4ea); rack.box(x - 1, top - 3, 1, x + 1, top - 2, 2, 0xb8281c); }
  }
  P.rack = rack.geometry({ s: 0.05, o: [0, 0, 0] });
  return P;
}

// Wei city wall, 25 cm voxels. Runs along X with the gate at x=0; front face at z=0, origin at the base.
export function wallGeometry(len = 150) {
  const v = new Vox();
  const S = 0.25, H = 32, D = 14, half = Math.min(300, Math.floor(len / S / 2));
  const tones = [0x7f7466, 0x8a7e6e, 0x968a78, 0x74695c, 0x9c907e];
  const brick = (x, y, z) => {
    const course = y >> 1, u = x + z + (course & 1) * 2;
    let c = tones[(hash3(Math.floor(u / 4), course, 7) * tones.length) | 0];
    if (mod(u, 4) === 0) c = sh(c, 0.8); else if ((y & 1) === 0) c = sh(c, 0.9);
    if (y < 4) c = sh(c, 0.82);
    return c;
  };
  const gateW = (y) => (y < 13 ? 10 : y < 19 ? 10 * Math.sqrt(Math.max(0, 1 - ((y - 13) / 6.2) ** 2)) : 0);
  const open = (x, y) => Math.abs(x + 0.5) < gateW(y);
  for (let x = -half; x < half; x++) {
    for (let y = 0; y < H; y++) { if (!open(x, y)) v.set(x, y, 0, brick(x, y, 0)); if (y < 4 && !open(x, y)) v.set(x, y, -1, brick(x, y, -1)); }
    for (let z = 0; z < D; z++) v.set(x, H - 1, z, mod(x + z, 5) === 0 ? 0x6a6054 : 0x7a7062);                 // walkway
    const m = mod(x, 6) < 4;                                                                                   // merlons
    for (let y = H; y <= H + (m ? 4 : 1); y++) v.set(x, y, 0, brick(x, y, 0));
    if (m) v.set(x, H + 4, -1, 0x9c907e), v.set(x, H + 3, -1, brick(x, H + 3, -1));
  }
  // gate: voussoirs, tunnel lining, doors
  for (let x = -13; x <= 12; x++) for (let y = 0; y < 23; y++) {
    if (open(x, y)) continue;
    const near = open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x - 2, y) || open(x + 2, y) || open(x, y - 2);
    if (!near) continue;
    v.set(x, y, -1, mod(x + y, 3) === 0 ? 0xb4a68e : 0xa2947e); v.set(x, y, 0, 0xa2947e);
    if (open(x - 1, y) || open(x + 1, y) || open(x, y - 1)) for (let z = 1; z < D; z++) v.set(x, y, z, sh(brick(x, y, z), 0.6));
  }
  for (let y = 0; y < 19; y++) for (let x = -10; x <= 9; x++) {
    if (!open(x, y) || (x >= -4 && x <= 3)) continue;                                                           // doors stand ajar
    v.set(x, y, 4, mod(x, 3) === 0 && mod(y, 3) === 1 ? 0xd8b04a : mod(x, 5) === 0 ? 0x5a1e16 : 0x7a2a1e);
  }
  for (let x = -10; x <= 9; x++) for (let y = 0; y < 19; y++) if (open(x, y)) v.set(x, y, D - 1, 0x17120e);                     // dark far end of the tunnel
  for (let x = -6; x <= 5; x++) for (let y = 19; y <= 22; y++) v.set(x, y, -1, y === 19 || y === 22 || x === -6 || x === 5 ? 0x3a2a1e : 0x1e3a5a);   // name board
  // bastions every 24 m
  for (let bx = -half + 20; bx < half - 20; bx += 96) {
    if (Math.abs(bx + 8) < 40) continue;
    for (let x = bx; x < bx + 16; x++) for (let y = 0; y < H + 3; y++) for (let z = -6; z < 0; z++) {
      if (x > bx && x < bx + 15 && z > -6 && y < H + 2) continue;
      v.set(x, y, z, brick(x, y, z));
    }
    for (let x = bx; x < bx + 16; x++) if (mod(x, 6) < 4) for (let y = H + 3; y <= H + 6; y++) v.set(x, y, -6, brick(x, y, -6));
    for (let z = -6; z < 0; z++) if (mod(z, 6) < 4) for (let y = H + 3; y <= H + 6; y++) { v.set(bx, y, z, brick(bx, y, z)); v.set(bx + 15, y, z, brick(bx + 15, y, z)); }
  }
  // gate tower (城樓): red columns, timber walls, tiled hip roof with upturned eaves
  const X0 = -30, X1 = 29, Y0 = H + 5, RED = 0x8a2a20, TIM = 0x5a3a26, TILE = 0x3c4148, TILE2 = 0x545a62;
  for (let x = X0 - 2; x <= X1 + 2; x++) for (let z = -2; z <= D + 1; z++) for (let y = H; y < Y0; y++) if (y === Y0 - 1 || x === X0 - 2 || x === X1 + 2 || z === -2 || z === D + 1) v.set(x, y, z, y === Y0 - 1 ? 0x8c8070 : brick(x, y, z));
  for (let x = X0; x <= X1; x++) for (let y = Y0; y <= Y0 + 13; y++) {
    const col = mod(x - X0, 10) < 2 || x >= X1 - 1;
    if (col) { v.set(x, y, 0, RED); v.set(x, y, 1, RED); continue; }
    let c = TIM;
    if (y >= Y0 + 5 && y <= Y0 + 10) c = mod(x + y, 2) === 0 ? 0xd8b46a : 0x3a2618;        // lattice windows
    if (y === Y0 + 4 || y === Y0 + 11) c = RED;
    if (y >= Y0 + 12) c = mod(x, 3) === 0 ? 0x2a6a5a : 0x1e4a8a;                           // painted frieze
    v.set(x, y, 2, c);
  }
  for (let z = 0; z <= D - 1; z++) for (let y = Y0; y <= Y0 + 13; y++) { v.set(X0, y, z, z % 5 < 2 ? RED : TIM); v.set(X1, y, z, z % 5 < 2 ? RED : TIM); }
  const RY = Y0 + 14;
  for (let k = 0; k <= 9; k++) {
    const ex = 36 - k * 2.6, z0 = Math.round(-7 + k * 1.15), z1 = Math.round(D + 6 - k * 1.15);
    for (let x = Math.round(-ex); x <= Math.round(ex) - 1; x++) for (let z = z0; z <= z1; z++) {
      if (k < 9 && x > Math.round(-ex) + 1 && x < Math.round(ex) - 3 && z > z0 + 1 && z < z1 - 1) continue;
      const corner = Math.min(x - Math.round(-ex), Math.round(ex) - 1 - x);
      const lift = k === 0 ? Math.max(0, 3 - corner) : k === 1 ? Math.max(0, 2 - corner) : 0;
      v.set(x, RY + k + lift, z, k === 0 && (z === z0 || z === z1) ? RED : mod(x, 2) === 0 ? TILE : TILE2);
    }
  }
  for (let x = -12; x <= 11; x++) { v.set(x, RY + 10, 6, 0x2a2e34); v.set(x, RY + 10, 7, 0x2a2e34); }
  for (const x of [-13, 12]) { v.box(x, RY + 10, 6, x, RY + 12, 7, 0xd8b04a); v.set(x + (x < 0 ? -1 : 1), RY + 12, 6, 0xd8b04a); }
  return v.geometry({ s: S, o: [0, 0, 0], jit: 0.05 });
}

// 長坂橋 wooden bridge along Z, 12.5 cm voxels; deck top follows world.bridgeDeck()
export function bridgeGeometry() {
  const v = new Vox();
  const L = 88, Wd = 14, P1 = 0x7a5a3a, P2 = 0x6a4a30, P3 = 0x8a6a46, DK = 0x4a3220;
  for (let z = -L / 2; z < L / 2; z++) {
    const arch = Math.round(6.4 * Math.cos((z + 0.5) / (L / 2) * Math.PI / 2));
    for (let x = -Wd; x < Wd; x++) {
      const c = mod(z, 3) === 0 ? DK : [P1, P2, P3][(hash3(x >> 2, 3, Math.floor(z / 3)) * 3) | 0];
      v.set(x, arch + 1, z, c); v.set(x, arch, z, Math.abs(x + 0.5) > Wd - 2 ? DK : P2);
    }
    for (const x of [-Wd - 1, Wd]) { v.set(x, arch, z, DK); v.set(x, arch + 1, z, DK); v.set(x, arch + 2, z, DK); v.set(x, arch + 5, z, P2); v.set(x, arch + 8, z, P1); }
    if (mod(z, 8) === 0) for (const x of [-Wd - 1, Wd]) {
      v.box(x, arch + 2, z, x, arch + 10, z, DK); v.box(x, arch + 2, z + 1, x, arch + 9, z + 1, P2); v.set(x, arch + 11, z, 0xb8281c);
      for (let y = -12; y < arch; y++) { v.set(x + (x < 0 ? 1 : -1), y, z, 0x3a2a1e); v.set(x + (x < 0 ? 2 : -2), y, z, 0x3a2a1e); }
      for (let xx = -Wd; xx < Wd; xx++) v.set(xx, arch - 1, z, DK);
    }
  }
  return v.geometry({ s: 0.125, o: [0, 0, 0], jit: 0.05 });
}

// banner cloth texture: 魏 / 蜀 / 張 characters on a coloured field
export function bannerTexture(ch, bg = '#d6a632', fg = '#221a12', edge = '#8a2a1e') {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 64, 128);
  x.fillStyle = edge; x.fillRect(0, 0, 64, 10); x.fillRect(0, 118, 64, 10); x.fillRect(0, 0, 6, 128); x.fillRect(58, 0, 6, 128);
  for (let i = 0; i < 6; i++) { x.fillStyle = edge; x.beginPath(); x.moveTo(i * 11, 128); x.lineTo(i * 11 + 5, 128); x.lineTo(i * 11 + 2, 120); x.fill(); }
  x.fillStyle = fg; x.font = 'bold 44px "LXGW WenKai TC", "Kaiti TC", "KaiTi", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(ch, 32, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter;
  return t;
}
