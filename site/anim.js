// Pose system shared by the hero and the officers: numeric poses, keyframed clips, arm IK to the weapon grips.
import * as THREE from 'three';
import { VS, RIG } from './voxel.js';

// Pose fields. w = weapon pose in torso space [x, y, z (m), rx (pitch, − = tip up), ry (yaw, + = to the left), rz].
// gR / gL = grip distance along the weapon (m) for the right / left hand; ikL = 0 lets the left arm use aL instead.
export const BASE = {
  rootY: -0.05, yawAdd: 0, pitch: 0, roll: 0, hipY: 0, tx: 0.12, ty: 0.4, tz: 0, hx: -0.05, hy: -0.35,
  thL: 0.35, shL: -0.35, thR: -0.3, shR: -0.25, lzL: 0.12, lzR: -0.12,
  w: [-0.2, 0.1, 0.24, -0.28, -0.42, 0], gR: 0, gL: 0.5, ikL: 1, aL: [0.2, 0, 0.3],
  cape: 0,
};
const KEYS = Object.keys(BASE);
export const P = (o = {}) => {
  const p = { ...BASE, ...o };
  p.w = (o.w || BASE.w).slice(); p.aL = (o.aL || BASE.aL).slice();
  return p;
};
export const clonePose = (p) => ({ ...p, w: p.w.slice(), aL: p.aL.slice() });

const ease = {
  lin: (u) => u,
  io: (u) => u * u * (3 - 2 * u),
  out: (u) => 1 - (1 - u) ** 3,
  in: (u) => u * u,
  snap: (u) => 1 - (1 - u) ** 4,
};
export function lerpPose(a, b, u, out) {
  for (const k of KEYS) {
    if (k === 'w' || k === 'aL') { for (let i = 0; i < a[k].length; i++) out[k][i] = a[k][i] + (b[k][i] - a[k][i]) * u; }
    else out[k] = a[k] + (b[k] - a[k]) * u;
  }
  return out;
}
// keys: [[frame, pose, easeName?], ...]; returns pose at frame t (into out)
export function sampleClip(keys, t, out) {
  if (t <= keys[0][0]) return lerpPose(keys[0][1], keys[0][1], 0, out);
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, p0] = keys[i], [f1, p1, e] = keys[i + 1];
    if (t <= f1) return lerpPose(p0, p1, (ease[e || 'io'])((t - f0) / Math.max(1e-6, f1 - f0)), out);
  }
  const last = keys[keys.length - 1][1];
  return lerpPose(last, last, 0, out);
}
// exponential approach of the displayed pose to a target (k per sim frame)
export function approach(cur, tgt, k) {
  let d = tgt.yawAdd - cur.yawAdd;
  if (Math.abs(d) > Math.PI) cur.yawAdd += Math.round(d / (Math.PI * 2)) * Math.PI * 2;
  return lerpPose(cur, tgt, k, cur);
}

// ---- locomotion poses (procedural)
export function runPose(ph, speed, out, style = 'spear') {
  const s = Math.sin(ph), c = Math.cos(ph), amp = Math.min(1, speed / 6);
  const p = out || P();
  Object.assign(p, BASE);
  p.w = [-0.3, 0.02, -0.02, -0.12, Math.PI - 0.3, 0]; p.aL = [-s * 0.9 * amp, 0, 0.25];
  if (style === 'hold') p.w = [-0.22, 0.08, 0.2, -0.35, -0.4, 0];
  p.gL = 0.5; p.ikL = style === 'hold' ? 1 : 0;
  p.rootY = -0.06 + Math.abs(c) * 0.07 * amp;
  p.tx = 0.12 + 0.3 * amp; p.hx = -0.25 * amp; p.ty = s * 0.18 * amp; p.hy = -p.ty; p.tz = 0; p.hipY = -s * 0.15 * amp;
  p.thL = s * 0.95 * amp; p.thR = -s * 0.95 * amp;
  p.shL = -(Math.max(0, -Math.sin(ph - 0.9)) * 1.4 + 0.15) * amp - 0.05;
  p.shR = -(Math.max(0, Math.sin(ph - 0.9)) * 1.4 + 0.15) * amp - 0.05;
  p.lzL = 0.04; p.lzR = -0.04; p.cape = 0.9 * amp;
  return p;
}
export function idlePose(t, out) {
  const p = out || P();
  Object.assign(p, BASE); p.w = BASE.w.slice(); p.aL = BASE.aL.slice();
  const b = Math.sin(t * 2.2);
  p.rootY += b * 0.012; p.tx += b * 0.02; p.w[1] += b * 0.01;
  return p;
}

// ---- apply a pose to a rig from voxel.buildWarrior
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _n = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
const A = RIG.upper * VS, B = (RIG.fore + 0.5) * VS;
const hipBase = (RIG.hipY + 1) * VS;

function ikArm(upper, fore, sh, target, pole) {
  _v.subVectors(target, sh);
  let d = _v.length(); const dir = _v.divideScalar(Math.max(d, 1e-5));
  d = Math.min(Math.max(d, 0.05), A + B - 1e-3);
  const cosA = (A * A + d * d - B * B) / (2 * A * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _n.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  const u = _v2.copy(dir).multiplyScalar(cosA).addScaledVector(_n, sinA);
  upper.quaternion.setFromUnitVectors(DOWN, u);
  const elbow = _v3.copy(sh).addScaledVector(u, A);
  const f = elbow.subVectors(sh.clone().addScaledVector(dir, d), elbow).normalize();
  _q2.copy(upper.quaternion).invert();
  f.applyQuaternion(_q2);
  fore.quaternion.setFromUnitVectors(DOWN, f);
}

const POLE_R = new THREE.Vector3(-1, -0.7, -0.5).normalize(), POLE_L = new THREE.Vector3(1, -0.7, -0.5).normalize();
const _grip = new THREE.Vector3(), _wq = new THREE.Quaternion(), _axis = new THREE.Vector3();
export function applyPose(rig, p) {
  const j = rig.j;
  rig.body.position.y = p.rootY;
  rig.body.rotation.set(p.pitch, p.yawAdd, p.roll, 'YXZ');
  j.hips.position.y = hipBase;
  j.hips.rotation.set(0, p.hipY, 0);
  j.torso.rotation.set(p.tx, p.ty - p.hipY, p.tz, 'YXZ');
  j.head.rotation.set(p.hx, p.hy, 0, 'YXZ');
  j.thighL.rotation.set(-p.thL, 0, p.lzL); j.shinL.rotation.set(-p.shL, 0, 0);
  j.thighR.rotation.set(-p.thR, 0, p.lzR); j.shinR.rotation.set(-p.shR, 0, 0);
  // weapon in torso space
  const w = p.w;
  j.wep.position.set(w[0], w[1], w[2]);
  _e.set(w[3], w[4], w[5], 'YXZ'); j.wep.quaternion.setFromEuler(_e);
  _axis.set(0, 0, 1).applyQuaternion(j.wep.quaternion);
  const shR = _v3.set(-(RIG.shX + 0.5) * VS, RIG.shY * VS, 0).clone();
  _grip.copy(j.wep.position).addScaledVector(_axis, p.gR);
  ikArm(j.upperR, j.foreR, shR, _grip, POLE_R);
  if (p.ikL > 0.5) {
    const shL = new THREE.Vector3((RIG.shX + 0.5) * VS, RIG.shY * VS, 0);
    _grip.copy(j.wep.position).addScaledVector(_axis, p.gL);
    ikArm(j.upperL, j.foreL, shL, _grip, POLE_L);
  } else {
    j.upperL.rotation.set(p.aL[0], p.aL[1], p.aL[2]); j.foreL.rotation.set(-0.5, 0, 0);
  }
  if (j.cape0) { j.cape0.rotation.x = 0.1 + p.cape * 0.6 + Math.max(0, p.tx) * 0.9; j.cape1.rotation.x = p.cape * 0.3; if (j.cape2) j.cape2.rotation.x = p.cape * 0.3; }
}

// weapon point in world space: along weapon local +Z by `z` metres
export function weaponPoint(rig, z, out) {
  return rig.j.wep.localToWorld(out.set(0, 0, z));
}
