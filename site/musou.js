// 無雙亂舞: sim timeline for the hero + the voxel azure dragon view.
import * as THREE from 'three';
import { MOVES, HERO, turn } from './hero.js';
import { P, BASE, sampleClip } from './anim.js';
import { dragonParts } from './voxel.js';
import { ST } from './crowd.js';
import { radialTexture } from './world.js';

export const MU = { raise: 40, rush: 150, leap: 150, slam: 172, end: 204, rushSpeed: 8.5 };
const TAU = Math.PI * 2;
const raisePose = [[0, BASE], [14, P({ yawAdd: TAU, ty: 0.2, tx: -0.3, hx: 0.3, rootY: 0.02, w: [-0.1, 0.62, 0.05, -1.5, 0.2, 0], gL: 0.25, thL: 0.2, thR: -0.2 }), 'out'],
  [30, P({ yawAdd: TAU * 2, ty: 0.3, tx: -0.35, hx: 0.3, w: [-0.1, 0.7, 0.0, -1.55, 0.0, 0], gL: 0.25 }), 'lin'],
  [40, P({ yawAdd: TAU * 2, ty: 0.9, tx: 0.1, rootY: -0.2, w: [-0.26, 0.1, -0.1, -0.05, -0.85, 0], gL: 0.5, thL: 0.5, shL: -0.8, thR: -0.6, shR: -0.5 })]];
const leapPose = [[0, P({ tx: -0.4, hx: 0.3, w: [-0.1, 0.62, 0.0, -1.5, -0.1, 0], gL: 0.3, thL: 0.9, shL: -1.5, thR: 0.2, shR: -1.2, cape: 1 })],
  [20, P({ tx: 0.7, rootY: -0.4, w: [-0.05, 0.05, 0.4, 1.2, -0.05, 0], gL: 0.25, thL: 1.1, shL: -1.6, thR: -0.5, shR: -1.2 }), 'snap']];

export function createMusou(game) {
  const mu = { active: false, t: 0, true: false, serial: 0, dragon: [] };
  mu.start = (h) => {
    mu.active = true; mu.t = 0; mu.true = h.hp < h.hpMax * 0.25; mu.serial++;
    h.state = 'musou'; h.t = 0; h.musou = 0; h.move = null; h.inv = 999;
    game.crowd.freeze = 1;
    // aura shock: clear the stage around him
    const c = game.crowd;
    c.query(h.x, h.z, 6, (i) => { if (!c.isAlive(i)) return; const dx = c.x[i] - h.x, dz = c.z[i] - h.z, d = Math.hypot(dx, dz) || 1; if (d < 5) { const k = (5 - d) * 0.6; c.x[i] += dx / d * k; c.z[i] += dz / d * k; } });
    game.emit('musouStart', { true: mu.true });
  };
  mu.heroStep = (h, inp) => {
    const t = ++mu.t; h.t = t;
    const mul = mu.true ? 1.6 : 1;
    if (t === MU.raise) { game.crowd.freeze = 0; game.emit('musouRush'); }
    if (t > MU.raise && t < MU.rush) {
      if (inp.mag > 0.2) h.yaw = turn(h.yaw, Math.atan2(inp.mx, inp.mz), 0.07);
      h.x += Math.sin(h.yaw) * MU.rushSpeed / 60; h.z += Math.cos(h.yaw) * MU.rushSpeed / 60;
      if ((t - MU.raise) % 5 === 0) {
        const k = (t - MU.raise) / 5;
        game.crowd.heroHit(h, { shape: 'circle', range: 3.4, dmg: 11, kb: 'launch', force: 3.5, lift: 5.5, stop: 0, yMax: 5 }, 900000 + mu.serial * 1000 + k, 0, 0, { musou: true, mul });
        game.crowd.heroHit(h, { shape: 'line', len: 5, width: 2.6, dmg: 8, kb: 'blow', force: 7, lift: 6, stop: 0, yMax: 5 }, 950000 + mu.serial * 1000 + k, 0, 0, { musou: true, mul });
      }
    }
    if (t === MU.leap) { h.vy = 9; h.grounded = false; }
    if (t > MU.leap && t < MU.slam - 6) h.vy = Math.max(h.vy, 0.5);
    if (t === MU.slam - 6) h.vy = -24;
    if (t === MU.slam) {
      game.crowd.heroHit(h, { shape: 'circle', range: 9.5, dmg: 48, kb: 'blow', force: 9, lift: 10, stop: 10, yMax: 8, heavy: true }, 990000 + mu.serial, 0, 0, { musou: true, mul });
      game.emit('musouSlam', { x: h.x, z: h.z });
    }
    if (t >= MU.end) { mu.active = false; h.state = 'idle'; h.t = 0; h.inv = 30; game.emit('musouEnd'); }
  };
  mu.pose = (h, out) => {
    const t = mu.t;
    if (t < MU.raise) return sampleClip(raisePose, t, out);
    if (t < MU.rush) {
      const k = (t - MU.raise) % 36, clip = ((t - MU.raise) / 36 | 0) % 2 ? MOVES.c4 : MOVES.c3;
      return sampleClip(clip.keys, clip === MOVES.c4 ? 8 + k : 8 + k, out);
    }
    return sampleClip(leapPose, t - MU.leap, out);
  };
  return mu;
}

// ---------------------------------------------------------------- view: dragon, aura, grade
export function createMusouView(scene, game) {
  const parts = dragonParts();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x1040b0, emissiveIntensity: 0.4, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0 });
  const NS = 30;
  const head = new THREE.Mesh(parts.head, mat), tail = new THREE.Mesh(parts.tail, mat);
  const segs = [];
  for (let k = 0; k < NS; k++) { const m = new THREE.Mesh(parts.seg, mat); scene.add(m); segs.push(m); }
  const claws = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(parts.claw, mat); scene.add(m); return m; });
  scene.add(head, tail);
  const glowTex = radialTexture();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x5ab0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  const glows = []; for (let k = 0; k < 12; k++) { const s = new THREE.Sprite(glowMat); scene.add(s); glows.push(s); }
  const auraMat = new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const aura = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 2.4, 16, 1, true), auraMat); aura.position.y = 1.3; scene.add(aura);
  const hist = []; const HL = 320;
  const all = [head, tail, ...segs, ...claws];
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  const v = { strength: 0 };
  let op = 0;
  v.update = () => {
    const mu = game.musou, h = game.hero, t = mu.t;
    const on = mu.active && t > 20;
    op += ((on ? 1 : 0) - op) * 0.2;
    mat.opacity = op; mat.transparent = op < 0.97; mat.depthWrite = op > 0.5; glowMat.opacity = op * 0.16;
    all.forEach((m) => { m.visible = op > 0.02; }); glows.forEach((g) => { g.visible = op > 0.02; });
    auraMat.opacity = mu.active ? (t < MU.raise ? 0.05 * Math.min(1, t / 10) : 0.0) * (0.8 + Math.sin(t * 0.5) * 0.2) : Math.max(0, auraMat.opacity - 0.03);
    aura.position.set(h.x, h.y + 1.3, h.z); aura.rotation.y += 0.1; aura.scale.setScalar(1 + Math.sin(t * 0.3) * 0.08);
    v.strength = mu.active ? Math.min(1, t / 8) * (t > MU.end - 20 ? (MU.end - t) / 20 : 1) : Math.max(0, v.strength - 0.05);
    if (!mu.active && op < 0.02) return;
    place();
  };
  // once per sim frame: advance the head path and record it
  v.step = () => {
    const mu = game.musou, h = game.hero, t = mu.t;
    if (!mu.active && op < 0.02) { hist.length = 0; return; }
    // head path: spiral around the hero, surge ahead, dive for the slam
    const s = t / 60;
    let hx, hy, hz;
    const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
    if (t < MU.raise) { const a = s * 7; hx = h.x + Math.cos(a) * 1.6; hz = h.z + Math.sin(a) * 1.6; hy = 0.5 + s * 5; }
    else if (t < MU.rush) { const a = s * 5.5, r = 2.6 + Math.sin(s * 3) * 0.8; hx = h.x + Math.cos(a) * r + fx * 1.5; hz = h.z + Math.sin(a) * r + fz * 1.5; hy = 1.2 + Math.sin(s * 4) * 0.8; }
    else if (t < MU.slam) { const u = (t - MU.leap) / (MU.slam - MU.leap); hx = h.x + fx * (4 - u * 4); hz = h.z + fz * (4 - u * 4); hy = 9 - u * u * 8.5 + (u < 0.4 ? u * 6 : 0); }
    else { const u = (t - MU.slam) / 30, a = u * 9; hx = h.x + Math.cos(a) * (1.2 + u * 2); hz = h.z + Math.sin(a) * (1.2 + u * 2); hy = 0.5 + u * 16; }
    if (!mu.active) { const last = hist[0]; if (last) { hx = last.x; hy = last.y + 0.3; hz = last.z; } }
    hist.unshift({ x: hx, y: hy, z: hz }); if (hist.length > HL) hist.pop();
  };
  // lay the body along the recorded head path at a fixed arc-length spacing (no gaps at any speed)
  const SPACING = 0.46, _pt = new THREE.Vector3(), _prev = new THREE.Vector3();
  function place() {
    const t = game.musou.t;
    if (hist.length < 2) return;
    const p0 = hist[0], p1 = hist[Math.min(2, hist.length - 1)];
    head.position.set(p0.x, p0.y, p0.z); head.scale.setScalar(1.5);
    _v.set(p0.x + (p0.x - p1.x) * 4, p0.y + (p0.y - p1.y) * 4, p0.z + (p0.z - p1.z) * 4);
    if (_v.distanceToSquared(head.position) > 1e-4) head.lookAt(_v);
    let i = 0, acc = 0, segLen = Math.hypot(hist[1].x - p0.x, hist[1].y - p0.y, hist[1].z - p0.z);
    const at = (d) => {   // d is monotonic across calls
      while (i < hist.length - 2 && acc + segLen < d) { acc += segLen; i++; segLen = Math.hypot(hist[i + 1].x - hist[i].x, hist[i + 1].y - hist[i].y, hist[i + 1].z - hist[i].z); }
      const u = segLen > 1e-6 ? Math.min(1, (d - acc) / segLen) : 0, a = hist[i], b = hist[i + 1];
      return _pt.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
    };
    _prev.copy(head.position);
    let dist = 0.75;
    segs.forEach((m, k) => {
      const sc = 1.3 - k / NS * 0.75;
      const q = at(dist); dist += SPACING * sc * 0.82;
      m.position.set(q.x, q.y + Math.sin(t * 0.3 + k * 0.6) * 0.06, q.z);
      if (_prev.distanceToSquared(m.position) > 1e-5) m.lookAt(_prev);
      _prev.copy(m.position);
      m.scale.setScalar(sc);
    });
    const q = at(dist); tail.position.copy(q); if (_prev.distanceToSquared(tail.position) > 1e-5) tail.lookAt(_prev); tail.scale.setScalar(0.8);
    claws.forEach((m, k) => { const sidx = [3, 5, 16, 18][k]; m.position.copy(segs[sidx].position); m.quaternion.copy(segs[sidx].quaternion); m.rotateZ(k % 2 ? 1.1 : -1.1); m.scale.setScalar(1.15 - sidx / NS * 0.5); });
    glows.forEach((g, k) => { const sg = segs[Math.min(NS - 1, k * 3)]; g.position.copy(sg.position); g.scale.setScalar(1.8 - k * 0.08); });
  }
  return v;
}
