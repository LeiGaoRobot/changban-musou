// Horses (4 cm voxels): Zhao Yun's white charger, the Tiger-Leopard cavalry mount with its rider, gait animation, and the pickup models.
import * as THREE from 'three';
import { Vox, hash3 } from './voxel.js';

export const HS = 0.04;
const sh = (c, k) => { const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k)); return (r << 16) | (g << 8) | b; };
const mod = (a, n) => ((a % n) + n) % n;

export const HORSE_PAL = {
  white: { coat: 0xf3f0ea, coat2: 0xe2ddd2, mane: 0xcfd6dc, hoof: 0x3a3632, tack: 0x1fa39a, tack2: 0xe6c664, saddle: 0x7a4a2a, tassel: 0x3d7fd6, sock: 0xf3f0ea },
  black: { coat: 0x2e2622, coat2: 0x3a302a, mane: 0x121010, hoof: 0x141210, tack: 0x7a1e18, tack2: 0xc9a040, saddle: 0x3a2a1e, tassel: 0xc42c1e, sock: 0x2e2622 },
};

function horseVox(p) {
  const coat = (x, y, z) => (hash3(x >> 1, y >> 1, z >> 1) < 0.28 ? p.coat2 : p.coat);
  const body = new Vox();
  body.ell(0, 0, 0, 6.6, 6.6, 15, coat);
  body.ell(0, 1.0, 11, 6.2, 7.4, 7.5, coat);
  body.ell(0, 1.2, -11, 6.9, 7.2, 8.5, coat);
  body.recolor((x, y, z) => (z >= -8 && z <= 6 && y >= -2 ? (z === -8 || z === 6 || y === -2 ? p.tack2 : mod(x + z, 4) === 0 ? sh(p.tack, 0.82) : p.tack) : undefined));   // saddle cloth
  body.recolor((x, y, z) => (z >= 14 && y >= 0 && y <= 2 ? p.tack2 : z <= -15 && y >= 2 && y <= 3 ? p.tack2 : undefined));                             // breast strap, crupper
  body.ell(0, 7.2, -1, 4.6, 1.9, 6.5, p.saddle); body.ell(0, 8.8, -7, 3.6, 1.7, 1.5, sh(p.saddle, 0.75)); body.ell(0, 8.6, 5, 2.6, 1.5, 1.4, sh(p.saddle, 0.75));
  body.ell(0, -3.4, 18.6, 1.5, 2.4, 1.3, p.tassel);
  for (const s of [-7, 6]) { body.box(s, -8, 0, s, -2, 0, 0x2a2420); body.box(s + (s < 0 ? -1 : 1), -9, -1, s + (s < 0 ? -1 : 1), -9, 1, p.tack2); }                 // stirrups

  const neck = new Vox();                                                                                                                              // pivot at the base of the neck
  for (let k = 0; k <= 12; k++) { const t = k / 12; neck.ell(0, t * 15, t * 8 + Math.sin(t * 2) * 1.5, 4.6 - t * 1.6, 4.2 - t * 1.0, 4.8 - t * 1.6, coat); }
  neck.ell(0, 17, 11, 3.0, 3.4, 4.2, coat);
  neck.ell(0, 14.6, 16.5, 2.4, 2.5, 4.2, coat);
  neck.ell(0, 13.6, 19.8, 2.0, 1.9, 1.5, sh(p.coat, 0.78));
  neck.box(-3, 20, 8, -2, 22, 9, p.coat).box(1, 20, 8, 2, 22, 9, p.coat).set(-3, 23, 8, p.coat2).set(2, 23, 8, p.coat2);
  neck.set(-3, 18, 12, 0x15100c).set(2, 18, 12, 0x15100c).set(-3, 18, 13, 0x15100c).set(2, 18, 13, 0x15100c);
  neck.set(-2, 13, 20, 0x2a2018).set(1, 13, 20, 0x2a2018);
  neck.recolor((x, y, z, c) => (z >= 15 && z <= 16 && y >= 12 && y <= 17 ? p.tack2 : (y === 19 && z >= 9 && z <= 14) ? p.tack : undefined));          // bridle
  for (let k = 0; k <= 13; k++) { const t = k / 13; neck.ell(0, t * 15 + 3.6, t * 8 - 3.0 + Math.sin(t * 2) * 1.5, 1.2, 2.6, 2.2, (x, y, z) => (hash3(x, y, z) < 0.3 ? sh(p.mane, 0.85) : p.mane)); }
  neck.ell(0, 20.4, 12.5, 1.4, 1.5, 2.2, p.mane);

  const up = new Vox(); up.cylY(0, 0, -12, 0, 1.9, 2.2, 2.7, 3.5, coat);
  const lo = new Vox(); lo.cylY(0, 0, -11, 0, 1.4, 1.5, 1.8, 2.0, (x, y, z) => (y < -6 ? p.sock : coat(x, y, z)));
  lo.ell(0, -11.4, 0.2, 1.9, 1.5, 2.0, p.sock); lo.cylY(0, 0.3, -14, -13, 2.2, 2.4, 2.0, 2.2, p.hoof);
  const tail = new Vox();
  for (let k = 0; k <= 16; k++) { const t = k / 16; tail.ell(0, -t * 15, -t * 5 - Math.sin(t * 3) * 1.2, 1.5 + Math.sin(t * 3.1) * 0.9, 1.7, 1.5 + Math.sin(t * 3.1) * 0.9, (x, y, z) => (hash3(x, y, z) < 0.3 ? sh(p.mane, 0.85) : p.mane)); }
  return { body, neck, up, lo, tail };
}

// 虎豹騎 rider, seated; pivot = saddle seat. Static mesh (leans into the charge), lance couched on the right.
function riderVox() {
  const v = new Vox();
  const A = 0x23262e, PL = 0x444a56, G = 0xc9a040, SK = 0xdcb694, RED = 0x8a1e18;
  for (let y = 0; y <= 17; y++) { const t = Math.min(1, y / 10); v.layer(y, 0, y * 0.12, 4.6 + 1.3 * t - (y > 15 ? 1.2 : 0), 3.3 + 0.8 * t, (x, yy, z) => (yy % 3 === 0 ? sh(A, 0.7) : mod(x + z, 3) === 0 ? PL : A), 3); }
  v.recolor((x, y) => (y === 1 || y === 2 ? G : y === 15 ? G : undefined));
  for (let x = -2; x <= 1; x++) for (let y = 8; y <= 12; y++) v.face(x, y, Math.hypot(x + 0.5, y - 10) < 1.3 ? 0xf0d27a : G, 1);
  v.ell(0, 22, 2.6, 3.7, 4.1, 3.7, SK);                                                              // head
  v.face(-2, 21, 0x15100c).face(1, 21, 0x15100c); for (let x = -3; x <= 2; x++) v.face(x, 19, 0x1a1512, 1);
  v.ell(0, 23, 2.4, 4.6, 4.2, 4.6, (x, y, z) => (mod(Math.round(Math.atan2(z - 2, x + 0.5) * 4), 2) ? sh(A, 1.5) : PL), (x, y) => y >= 23);
  v.ell(0, 23, 2.4, 5.4, 0.9, 5.4, G, (x, y, z) => y === 22 && Math.hypot(x + 0.5, z - 2) > 4);
  v.ell(0, 20, 2, 5.0, 3, 5.0, (x, y) => (y % 2 ? A : PL), (x, y, z) => y >= 18 && y <= 22 && z < 2 && Math.hypot(x + 0.5, z - 2) > 3.8, true);
  for (let k = 0; k <= 6; k++) v.ell(0, 27.5 + Math.sin(k / 6 * 2.6) * 2.4, 2 - k * 1.1, 1.8 - k * 0.15, 1.6, 1.8, k % 2 ? 0xc42c1e : 0x9a1e16);          // plume
  for (const s of [-1, 1]) {
    v.ell(s * 6.4, 14.5, 1.5, 2.6, 2.8, 2.8, (x, y) => (y === 12 ? G : PL));                           // pauldron
    for (let k = 0; k <= 8; k++) v.ell(s * 6.2, 12.5 - k * 0.55, 2 + k * 0.9, 1.7, 1.7, 1.7, k > 6 ? SK : k > 3 ? PL : A);    // arm reaching forward
    v.ell(s * 6.6, -1.5, 3, 2.3, 2.7, 6.0, A); v.cylY(s * 7.2, 5.5, -12, -3, 1.7, 1.8, 2.1, 2.3, 0x1a1816); v.box(Math.round(s * 7.2 - 0.5), -13, 5, Math.round(s * 7.2 - 0.5), -12, 8, 0x1a1816);   // leg + boot
  }
  for (let y = 1; y <= 15; y++) for (let x = -4; x <= 3; x++) v.set(x, y, -5 - (y < 6 ? 1 : 0), Math.abs(x + 0.5) > 3 || y === 1 ? G : mod(x, 3) === 0 ? sh(RED, 0.8) : RED);        // cape
  v.box(-8, 8, -16, -8, 8, 48, 0x2a2420);                                                             // lance
  for (let z = 49; z <= 58; z++) { const hw = z < 52 ? z - 49 : 2.4 * (1 - (z - 52) / 6.5); for (let x = -2; x <= 2; x++) if (Math.abs(x) <= hw) v.set(-8 + x, 8, z, 0xd8dce4); }
  for (let z = 38; z <= 46; z++) for (let y = 9; y <= 13 - ((z - 38) >> 1); y++) v.set(-8, y, z, y === 9 || (z + y) % 4 === 0 ? G : 0xb8281c);                 // pennant
  return v;
}

// A horse rig. o.pal = HORSE_PAL key, o.rider adds the cavalryman. Returns { root, j, mat, rider }.
export function buildHorse(o = {}) {
  const p = HORSE_PAL[o.pal || 'white'], V = horseVox(p);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.04 });
  const geo = (v) => v.geometry({ s: HS, jit: 0.04 });
  const mesh = (g) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.frustumCulled = false; return m; };
  const node = (parent, x, y, z, g) => { const n = new THREE.Group(); n.position.set(x * HS, y * HS, z * HS); if (g) n.add(mesh(g)); parent.add(n); return n; };
  const root = new THREE.Group(), j = {};
  j.body = node(root, 0, 30, 0, geo(V.body));
  j.neck = node(j.body, 0, 4, 15, geo(V.neck));
  j.tail = node(j.body, 0, 4.5, -19, geo(V.tail));
  const up = geo(V.up), lo = geo(V.lo);
  for (const [k, x, z] of [['FL', 3.6, 11], ['FR', -3.6, 11], ['HL', 4.0, -12], ['HR', -4.0, -12]]) { j['up' + k] = node(j.body, x, -4, z, up); j['lo' + k] = node(j['up' + k], 0, -12, 0, lo); }
  let rider = null;
  if (o.rider) { rider = node(j.body, 0, 8.2, -1, geo(riderVox())); rider.rotation.x = 0.16; }
  return { root, j, mat, rider };
}

// gait: ph = stride phase (rad), g = 0 (standing) .. 1 (full gallop), t = seconds (idle motion)
const LEG_OFF = { HL: 0, HR: 0.7, FL: Math.PI * 0.92, FR: Math.PI * 0.92 + 0.7 };
export function poseHorse(rig, ph, g, t, rear = 0) {
  const j = rig.j;
  j.body.position.y = 30 * HS + Math.sin(ph * 2 + 0.6) * 0.06 * g + rear * 0.25;
  j.body.rotation.x = Math.sin(ph * 2) * 0.06 * g - rear * 0.55;
  j.neck.rotation.x = 0.08 + Math.sin(ph * 2 + 1.2) * 0.1 * g + Math.sin(t * 1.3) * 0.03 * (1 - g) + g * 0.22 - rear * 0.3;
  j.tail.rotation.x = 0.15 + g * 1.0 + Math.sin(ph * 2 + 2) * 0.12 * g + Math.sin(t * 2) * 0.05;
  for (const k in LEG_OFF) {
    const a = ph + LEG_OFF[k], front = k[0] === 'F';
    const sw = Math.sin(a) * (0.12 + 0.8 * g), lift = Math.max(0, -Math.cos(a));
    j['up' + k].rotation.x = -sw + (front ? -rear * 1.2 : rear * 0.35);
    j['lo' + k].rotation.x = (front ? 1 : 0.8) * lift * 1.25 * g + (front ? rear * 1.5 : 0);
  }
}

// pickup models (5 cm voxels)
export function itemGeos() {
  const G = {};
  const axe = new Vox();
  axe.box(0, 0, 0, 0, 12, 0, 0x6a4a2a); axe.box(0, 0, 0, 0, 1, 0, 0xb8281c);
  for (let y = 7; y <= 12; y++) for (let x = 1; x <= 4; x++) if (Math.abs(y - 9.5) <= 1 + x * 0.6) axe.set(x, y, 0, x === 4 ? 0xf0f4f8 : 0xb8bec8);
  axe.set(-1, 9, 0, 0xb8bec8).set(-1, 10, 0, 0xb8bec8);
  G.axe = axe.geometry({ s: 0.05, o: [0.5, 0, 0.5] });
  const arm = new Vox();
  for (let y = 0; y <= 8; y++) arm.layer(y, 0, 0, 3.2 + Math.min(1.4, y * 0.25), 2.2, (x, yy) => (yy % 3 === 0 ? 0x8a6a22 : 0xd8b04a), 3);
  arm.ell(-4.6, 8, 0, 1.8, 1.5, 2, 0xc9a040); arm.ell(4.6, 8, 0, 1.8, 1.5, 2, 0xc9a040); arm.face(-1, 5, 0xb8281c, 1).face(0, 5, 0xb8281c, 1).face(-1, 4, 0xb8281c, 1).face(0, 4, 0xb8281c, 1);
  G.armor = arm.geometry({ s: 0.05, o: [0, 0, 0] });
  const boot = new Vox();
  for (const ox of [-3, 2]) { boot.cylY(ox + 0.5, 0, 2, 9, 1.6, 1.6, 1.9, 1.9, 0x2a6ad0); boot.box(ox - 1, 0, -1, ox + 1, 1, 4, 0x2a6ad0); boot.box(ox - 1, 9, -2, ox + 1, 9, 1, 0xe6c664); boot.set(ox, 5, -2, 0xf4f8ff).set(ox, 6, -3, 0xf4f8ff).set(ox, 7, -4, 0xf4f8ff); }
  G.boots = boot.geometry({ s: 0.05, o: [0, 0, 0] });
  return G;
}
