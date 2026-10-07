// Zhao Yun: moveset data, state machine (60 Hz sim) and rig view.
import * as THREE from 'three';
import { P, BASE, sampleClip, approach, runPose, idlePose, applyPose, clonePose, weaponPoint } from './anim.js';
import { buildWarrior, PAL } from './voxel.js';
import { groundY } from './world.js';
import { buildHorse, poseHorse } from './horse.js';

const TAU = Math.PI * 2;
const W = (x, y, z, rx, ry, rz = 0) => [x, y, z, rx, ry, rz];
// ---------------------------------------------------------------- moves (frames @60 Hz)
// hit: { f:[a,b], shape:'arc'|'circle'|'line', range, ang, dir, len, width, dmg, kb, force, lift, stop, every, yMax }
const chamberThrust = P({ ty: 0.75, tx: 0.05, w: W(-0.24, 0.12, -0.02, -0.08, -0.72), gL: 0.45, thL: 0.2, thR: -0.35, rootY: -0.1 });
const thrust = P({ ty: 0.05, tx: 0.3, hx: -0.2, hy: 0, w: W(-0.08, 0.2, 0.5, -0.04, -0.12), gL: 0.3, thL: 0.75, shL: -0.3, thR: -0.6, shR: -0.1, rootY: -0.15, lzL: 0.05, lzR: -0.05 });
export const MOVES = {
  n1: { dur: 24, cancel: 11, lunge: [[4, 10, 0.9]], next: 'n2', charge: 'c2',
    keys: [[0, BASE], [5, chamberThrust], [9, thrust, 'snap'], [14, thrust], [24, BASE]],
    hits: [{ f: [8, 11], shape: 'arc', range: 3.2, ang: 60, dmg: 10, kb: 'flinch', force: 1.6, stop: 3 }] },
  n2: { dur: 26, cancel: 12, lunge: [[3, 9, 0.6]], next: 'n3', charge: 'c3',
    keys: [[0, thrust], [5, P({ ty: -0.7, tx: 0.15, w: W(-0.3, 0.0, 0.3, 0.3, -1.2), gL: 0.45, thL: 0.5, thR: -0.3, rootY: -0.12 })],
      [11, P({ ty: 0.75, tx: 0.05, hx: 0.1, w: W(-0.1, 0.32, 0.36, -0.45, 1.05), gL: 0.4, thL: 0.2, thR: -0.5, rootY: -0.04 }), 'snap'],
      [16, P({ ty: 0.85, tx: 0.05, w: W(-0.1, 0.34, 0.3, -0.55, 1.2), gL: 0.4 })], [26, BASE]],
    hits: [{ f: [8, 12], shape: 'arc', range: 3.2, ang: 160, dir: 10, dmg: 11, kb: 'flinch', force: 2, stop: 3 }] },
  n3: { dur: 28, cancel: 14, lunge: [[3, 10, 0.7]], next: 'n4', charge: 'c4',
    keys: [[0, BASE], [5, P({ ty: 1.0, hipY: 0.4, w: W(-0.15, -0.05, 0.25, 0.3, 1.4), gL: 0.4, thL: 0.5, shL: -0.6, thR: -0.4, shR: -0.5, rootY: -0.2, lzL: 0.35, lzR: -0.35 })],
      [11, P({ ty: -0.9, hipY: -0.4, tx: 0.25, w: W(-0.3, -0.05, 0.25, 0.25, -1.45), gL: 0.4, thL: 0.5, shL: -0.6, thR: -0.4, shR: -0.5, rootY: -0.22, lzL: 0.35, lzR: -0.35 }), 'snap'],
      [17, P({ ty: -1.0, hipY: -0.4, tx: 0.2, w: W(-0.3, -0.02, 0.22, 0.2, -1.55), gL: 0.4, rootY: -0.18, lzL: 0.3, lzR: -0.3 })], [28, BASE]],
    hits: [{ f: [7, 12], shape: 'arc', range: 3.4, ang: 210, dmg: 11, kb: 'push', force: 3, stop: 3 }] },
  n4: { dur: 28, cancel: 16, lunge: [[3, 8, 0.6], [11, 15, 0.6]], next: 'n5', charge: 'c5',
    keys: [[0, BASE], [4, chamberThrust], [7, thrust, 'snap'], [10, chamberThrust], [13, thrust, 'snap'], [18, thrust], [28, BASE]],
    hits: [{ f: [6, 8], shape: 'line', len: 3.6, width: 1.5, dmg: 8, kb: 'flinch', force: 1.5, stop: 2 },
      { f: [12, 14], shape: 'line', len: 3.6, width: 1.5, dmg: 9, kb: 'flinch', force: 2, stop: 3 }] },
  n5: { dur: 30, cancel: 17, lunge: [[4, 11, 0.8]], next: 'n6', charge: 'c6',
    keys: [[0, BASE], [7, P({ ty: 0.2, tx: -0.35, hx: 0.2, w: W(-0.15, 0.5, 0.05, -1.5, -0.3), gL: 0.35, thL: 0.3, thR: -0.2, rootY: 0 })],
      [11, P({ ty: 0.1, tx: 0.55, hx: -0.4, w: W(-0.12, 0.05, 0.42, 0.45, -0.25), gL: 0.3, thL: 0.8, shL: -0.5, thR: -0.7, rootY: -0.28 }), 'snap'],
      [18, P({ ty: 0.1, tx: 0.5, hx: -0.35, w: W(-0.12, 0.02, 0.42, 0.5, -0.25), gL: 0.3, thL: 0.8, shL: -0.5, thR: -0.7, rootY: -0.28 })], [30, BASE]],
    hits: [{ f: [10, 13], shape: 'arc', range: 3.4, ang: 80, dmg: 13, kb: 'push', force: 3.5, stop: 4 }] },
  n6: { dur: 42, cancel: 32, lunge: [[3, 16, 1.4]],
    keys: [[0, BASE], [4, P({ ty: 0.9, rootY: -0.15, w: W(-0.2, 0.2, 0.2, -0.05, 1.2), gL: 0.3 })],
      [16, P({ yawAdd: -TAU, ty: -0.2, rootY: 0.05, tx: 0.1, w: W(-0.15, 0.3, 0.3, 0.05, -1.5), gL: 0.25, thL: 0.5, shL: -1.0, thR: -0.2, shR: -0.8 }), 'out'],
      [24, P({ yawAdd: -TAU, ty: -0.5, rootY: -0.25, tx: 0.35, w: W(-0.25, 0.1, 0.3, 0.15, -1.55), gL: 0.3, thL: 0.7, shL: -0.6, thR: -0.6, lzL: 0.3, lzR: -0.3 })],
      [42, P({ yawAdd: -TAU })]],
    hits: [{ f: [7, 17], shape: 'circle', range: 3.5, dmg: 16, kb: 'blow', force: 8, lift: 4, stop: 6, sweep: true }] },
  // ---- charge attacks
  c1: { dur: 38, cancel: 30, armor: true, lunge: [[4, 10, 0.6]],
    keys: [[0, BASE], [7, P({ ty: -0.5, tx: 0.4, rootY: -0.3, w: W(-0.3, -0.1, 0.35, 0.55, -0.9), gL: 0.4, thL: 0.7, shL: -0.8, thR: -0.5, shR: -0.4 })],
      [13, P({ ty: 0.5, tx: -0.3, hx: 0.25, rootY: 0.05, w: W(-0.1, 0.55, 0.2, -1.2, 0.3), gL: 0.3 }), 'snap'], [22, P({ ty: 0.5, tx: -0.3, w: W(-0.1, 0.55, 0.2, -1.3, 0.3), gL: 0.3 })], [38, BASE]],
    hits: [{ f: [10, 14], shape: 'arc', range: 3.3, ang: 130, dmg: 14, kb: 'launch', force: 1.5, lift: 8.5, stop: 5 }] },
  c2: { dur: 44, cancel: 34, armor: true,
    keys: [[0, thrust], [6, P({ ty: -0.6, rootY: -0.25, w: W(-0.3, 0.0, 0.3, 0.4, -1.3), gL: 0.4, thL: 0.6, shL: -0.8 })],
      [14, P({ yawAdd: TAU, ty: 0.2, tx: -0.3, rootY: 0.1, w: W(-0.1, 0.6, 0.1, -1.4, 0.2), gL: 0.25, thL: 0.2, shL: -0.9, thR: 0.1, shR: -0.9 }), 'out'],
      [22, P({ yawAdd: TAU, ty: 0.2, tx: -0.4, w: W(-0.12, 0.7, 0.05, -1.55, 0), gL: 0.2 })],
      [28, P({ yawAdd: TAU, ty: 0.1, tx: 0.1, w: W(-0.1, 0.5, 0.2, -1.1, -0.2), gL: 0.25 }), 'snap'], [44, P({ yawAdd: TAU })]],
    hits: [{ f: [8, 15], shape: 'circle', range: 3.1, dmg: 13, kb: 'launch', force: 1, lift: 9.5, stop: 4 },
      { f: [26, 29], shape: 'arc', range: 3.6, ang: 90, dmg: 12, kb: 'launch', force: 3, lift: 4, stop: 4, yMax: 4 }] },
  c3: { dur: 62, cancel: 54, armor: true, lunge: [[6, 46, 1.6, 'lin'], [48, 52, 0.7]],
    keys: [[0, BASE], [8, chamberThrust], [10, thrust, 'snap'], [12, chamberThrust], [14, thrust, 'snap'], [16, chamberThrust], [18, thrust, 'snap'],
      [20, chamberThrust], [22, thrust, 'snap'], [24, chamberThrust], [26, thrust, 'snap'], [28, chamberThrust], [30, thrust, 'snap'],
      [32, chamberThrust], [34, thrust, 'snap'], [36, chamberThrust], [38, thrust, 'snap'], [40, chamberThrust], [42, thrust, 'snap'],
      [46, P({ ty: 0.9, tx: -0.05, w: W(-0.26, 0.15, -0.08, -0.05, -0.8), gL: 0.5, rootY: -0.1, thL: 0.3, thR: -0.4 })],
      [50, P({ ty: -0.05, tx: 0.35, hx: -0.2, w: W(-0.05, 0.22, 0.55, -0.02, -0.05), gL: 0.3, thL: 0.9, shL: -0.3, thR: -0.8, rootY: -0.22 }), 'snap'],
      [56, P({ ty: -0.05, tx: 0.35, w: W(-0.05, 0.22, 0.55, -0.02, -0.05), gL: 0.3, thL: 0.9, shL: -0.3, thR: -0.8, rootY: -0.22 })], [62, BASE]],
    hits: [{ f: [9, 43], every: 4, shape: 'line', len: 3.8, width: 2.0, dmg: 5, kb: 'flinch', force: 0.4, stop: 1 },
      { f: [49, 52], shape: 'line', len: 4.4, width: 2.4, dmg: 22, kb: 'blow', force: 9, lift: 3, stop: 7 }] },
  c4: { dur: 58, cancel: 50, armor: true, lunge: [[6, 44, 1.2, 'lin']],
    keys: [[0, BASE], [6, P({ ty: 0.9, rootY: -0.15, w: W(-0.2, 0.2, 0.2, 0, 1.3), gL: 0.3 })],
      [44, P({ yawAdd: -3 * TAU, ty: -0.3, rootY: -0.05, tx: 0.15, w: W(-0.15, 0.25, 0.3, 0.05, -1.5), gL: 0.25, thL: 0.4, shL: -0.8, thR: -0.3, shR: -0.7, lzL: 0.3, lzR: -0.3 }), 'lin'],
      [49, P({ yawAdd: -3 * TAU - 0.8, ty: -0.6, rootY: -0.28, tx: 0.4, w: W(-0.25, 0.1, 0.3, 0.2, -1.5), gL: 0.3, thL: 0.7, shL: -0.6, thR: -0.6 }), 'snap'],
      [58, P({ yawAdd: -3 * TAU })]],
    hits: [{ f: [8, 43], every: 6, shape: 'circle', range: 3.3, dmg: 6, kb: 'launch', force: -1.2, lift: 3.2, stop: 1 },
      { f: [46, 49], shape: 'circle', range: 4.0, dmg: 18, kb: 'blow', force: 9, lift: 4, stop: 7 }] },
  c5: { dur: 46, cancel: 38, armor: true, lunge: [[8, 26, 7.5, 'lin']],
    keys: [[0, BASE], [7, P({ ty: 0.9, tx: 0.05, rootY: -0.25, w: W(-0.26, 0.1, -0.1, -0.05, -0.85), gL: 0.5, thL: 0.5, shL: -0.8, thR: -0.6, shR: -0.5 })],
      [10, P({ ty: 0.0, tx: 0.45, hx: -0.3, rootY: -0.2, w: W(-0.06, 0.2, 0.55, 0, -0.05), gL: 0.3, thL: 0.9, shL: -0.4, thR: -0.9, shR: -0.2, cape: 1 }), 'snap'],
      [26, P({ ty: 0.0, tx: 0.45, hx: -0.3, rootY: -0.2, w: W(-0.06, 0.2, 0.55, 0, -0.05), gL: 0.3, thL: 0.9, shL: -0.4, thR: -0.9, shR: -0.2, cape: 1 })],
      [30, P({ ty: 1.0, rootY: -0.3, w: W(-0.2, 0.3, 0.2, -0.2, 1.3), gL: 0.3, thL: 0.6, shL: -0.8 }), 'snap'], [46, BASE]],
    hits: [{ f: [9, 26], every: 3, shape: 'line', len: 3.2, width: 2.4, dmg: 8, kb: 'launch', force: 4, lift: 6, stop: 1 },
      { f: [28, 31], shape: 'circle', range: 3.8, dmg: 16, kb: 'blow', force: 8, lift: 5, stop: 6 }] },
  c6: { dur: 60, cancel: 52, armor: true, leap: [8, 8.5], plunge: [20, -20], land: 30,
    keys: [[0, BASE], [7, P({ rootY: -0.3, tx: 0.3, w: W(-0.2, 0.1, 0.2, -0.6, -0.4), gL: 0.4, thL: 0.8, shL: -1.2, thR: 0.4, shR: -1.1 })],
      [14, P({ tx: -0.4, hx: 0.3, w: W(-0.1, 0.62, 0.0, -1.5, -0.1), gL: 0.3, thL: 0.9, shL: -1.5, thR: 0.2, shR: -1.2, cape: 1 })],
      [22, P({ tx: 0.6, hx: -0.4, w: W(-0.05, 0.2, 0.35, 1.1, -0.05), gL: 0.3, thL: 0.5, shL: -0.9, thR: -0.2, shR: -0.8, cape: 1 }), 'snap'],
      [29, P({ tx: 0.6, hx: -0.4, w: W(-0.05, 0.2, 0.35, 1.1, -0.05), gL: 0.3, thL: 0.5, shL: -0.9, thR: -0.2, shR: -0.8, cape: 1 })],
      [32, P({ tx: 0.7, rootY: -0.4, w: W(-0.05, 0.05, 0.4, 1.2, -0.05), gL: 0.25, thL: 1.1, shL: -1.6, thR: -0.5, shR: -1.2 }), 'snap'],
      [44, P({ tx: 0.6, rootY: -0.38, w: W(-0.05, 0.05, 0.4, 1.2, -0.05), gL: 0.25, thL: 1.1, shL: -1.6, thR: -0.5, shR: -1.2 })], [60, BASE]],
    hits: [{ f: [30, 33], shape: 'circle', range: 5.6, dmg: 28, kb: 'blow', force: 9, lift: 7, stop: 9, heavy: true }] },
  // ---- air
  aj: { dur: 24, cancel: 14, air: true, hover: 2.5,
    keys: [[0, P({ tx: -0.2, w: W(-0.1, 0.5, 0.1, -1.2, 0.8), gL: 0.3, thL: 0.8, shL: -1.3, thR: 0.3, shR: -1.2 })],
      [7, P({ tx: 0.4, w: W(-0.15, 0.0, 0.35, 0.8, -0.8), gL: 0.3, thL: 0.8, shL: -1.3, thR: 0.3, shR: -1.2 }), 'snap'], [24, P({ thL: 0.8, shL: -1.3, thR: 0.3, shR: -1.2 })]],
    hits: [{ f: [5, 9], shape: 'arc', range: 3.2, ang: 180, dmg: 9, kb: 'flinch', force: 2, stop: 2, yMax: 4 }] },
  ak: { dur: 40, cancel: 30, air: true, armor: true, plunge: [4, -20], land: 14,
    keys: [[0, P({ tx: -0.3, w: W(-0.1, 0.6, 0.0, -1.5, 0), gL: 0.3, thL: 0.8, shL: -1.3, thR: 0.3, shR: -1.2 })],
      [6, P({ tx: 0.6, w: W(-0.05, 0.1, 0.3, 1.3, 0), gL: 0.25, thL: 0.5, shL: -0.9, thR: 0.1, shR: -0.8, cape: 1 }), 'snap'],
      [13, P({ tx: 0.6, w: W(-0.05, 0.1, 0.3, 1.3, 0), gL: 0.25, thL: 0.5, shL: -0.9, cape: 1 })],
      [16, P({ tx: 0.7, rootY: -0.4, w: W(-0.05, 0.05, 0.4, 1.2, 0), gL: 0.25, thL: 1.1, shL: -1.6, thR: -0.5, shR: -1.2 }), 'snap'], [40, BASE]],
    hits: [{ f: [14, 17], shape: 'circle', range: 4.0, dmg: 14, kb: 'launch', force: 3, lift: 6, stop: 5 }] },
};
// flags the state machine reads instead of move ids: steer = may turn during the lunge, fx = [[frame, event, radius]]
Object.assign(MOVES.c3, { steer: true }); Object.assign(MOVES.c5, { steer: true, fx: [[28, 'burst', 1.2]] });
Object.assign(MOVES.c6, { fx: [[30, 'slam', 5.6]] }); Object.assign(MOVES.ak, { fx: [[14, 'slam', 4]] });

// ---- 張飛: heavier, wider swings with the serpent spear (five normals, five charges)
const fSwingR = P({ ty: -0.85, tx: 0.2, rootY: -0.18, w: W(-0.32, 0.12, 0.25, 0.1, -1.5), gL: 0.5, thL: 0.55, shL: -0.6, thR: -0.4, shR: -0.4, lzL: 0.3, lzR: -0.3 });
const fSwingL = P({ ty: 0.9, tx: 0.2, rootY: -0.2, w: W(-0.05, 0.14, 0.3, 0.08, 1.45), gL: 0.45, thL: 0.5, shL: -0.6, thR: -0.45, shR: -0.45, lzL: 0.32, lzR: -0.32 });
const fRaise = P({ ty: 0.15, tx: -0.4, hx: 0.25, rootY: 0.02, w: W(-0.12, 0.55, 0.02, -1.55, -0.2), gL: 0.4, thL: 0.35, thR: -0.25 });
const fSmash = P({ ty: 0.1, tx: 0.62, hx: -0.45, rootY: -0.32, w: W(-0.1, 0.02, 0.45, 0.5, -0.2), gL: 0.35, thL: 0.85, shL: -0.6, thR: -0.7, shR: -0.2 });
const fRam = P({ ty: -0.7, tx: 0.6, hx: -0.3, hy: 0.5, rootY: -0.25, w: W(-0.3, 0.02, -0.02, -0.1, Math.PI - 0.4), ikL: 0, aL: [0.5, 0, 0.9], thL: 0.9, shL: -0.5, thR: -0.8, shR: -0.2, cape: 1 });
const fStompUp = P({ ty: 0.1, tx: -0.2, hx: 0.2, rootY: 0.03, w: W(-0.14, 0.62, 0.18, -1.57, 0), gL: 0.35, thL: 1.3, shL: -1.5, thR: -0.1 });
const fStompDown = P({ ty: 0.1, tx: 0.35, hx: -0.25, rootY: -0.3, w: W(-0.14, 0.3, 0.2, -1.57, 0), gL: 0.35, thL: 0.7, shL: -0.9, thR: -0.5, shR: -0.5, lzL: 0.35, lzR: -0.35 });
Object.assign(MOVES, {
  fn1: { dur: 32, cancel: 16, lunge: [[5, 13, 0.7]], next: 'fn2', charge: 'fc2',                    // right-to-left sweep
    keys: [[0, BASE], [8, fSwingR], [14, fSwingL, 'snap'], [20, fSwingL], [32, BASE]],
    hits: [{ f: [11, 15], shape: 'arc', range: 3.6, ang: 200, dmg: 14, kb: 'push', force: 3.5, stop: 4 }] },
  fn2: { dur: 32, cancel: 16, lunge: [[4, 12, 0.7]], next: 'fn3', charge: 'fc3',                    // and back
    keys: [[0, fSwingL], [5, fSwingL], [11, fSwingR, 'snap'], [18, fSwingR], [32, BASE]],
    hits: [{ f: [8, 12], shape: 'arc', range: 3.6, ang: 210, dmg: 15, kb: 'push', force: 4, stop: 4 }] },
  fn3: { dur: 38, cancel: 20, lunge: [[6, 14, 0.8]], next: 'fn4', charge: 'fc4', fx: [[14, 'slam', 2.6]],   // overhead smash
    keys: [[0, BASE], [9, fRaise], [14, fSmash, 'snap'], [23, fSmash], [38, BASE]],
    hits: [{ f: [13, 16], shape: 'arc', range: 3.8, ang: 90, dmg: 20, kb: 'down', force: 3, stop: 6 }] },
  fn4: { dur: 32, cancel: 18, armor: true, lunge: [[4, 14, 2.4]], next: 'fn5', charge: 'fc5',       // shoulder ram
    keys: [[0, BASE], [4, fRam, 'snap'], [15, fRam], [32, BASE]],
    hits: [{ f: [5, 14], every: 3, shape: 'line', len: 2.0, width: 2.4, dmg: 8, kb: 'blow', force: 6, lift: 3.5, stop: 1 }] },
  fn5: { dur: 50, cancel: 38, lunge: [[4, 22, 1.2]],                                                  // full turn
    keys: [[0, BASE], [7, fSwingL], [23, P({ yawAdd: -TAU, ty: -0.85, tx: 0.2, rootY: -0.1, w: W(-0.32, 0.2, 0.25, 0.05, -1.5), gL: 0.5, thL: 0.5, shL: -0.9, thR: -0.3, shR: -0.7 }), 'out'],
      [32, P({ yawAdd: -TAU, ty: -0.9, tx: 0.3, rootY: -0.28, w: W(-0.32, 0.1, 0.25, 0.15, -1.55), gL: 0.5, thL: 0.7, shL: -0.6, thR: -0.6, lzL: 0.32, lzR: -0.32 })], [50, P({ yawAdd: -TAU })]],
    hits: [{ f: [10, 23], shape: 'circle', range: 4.0, dmg: 20, kb: 'blow', force: 9, lift: 5, stop: 7 }] },
  fc1: { dur: 42, cancel: 34, armor: true, fx: [[15, 'slam', 3.8]],                                   // stamp the spear butt down
    keys: [[0, BASE], [10, fStompUp], [15, fStompDown, 'snap'], [28, fStompDown], [42, BASE]],
    hits: [{ f: [15, 18], shape: 'circle', range: 3.8, dmg: 14, kb: 'launch', force: 1, lift: 8.5, stop: 6 }] },
  fc2: { dur: 38, cancel: 30, armor: true, lunge: [[4, 10, 0.6]], keys: MOVES.c1.keys,                // rip upward
    hits: [{ f: [10, 14], shape: 'arc', range: 3.6, ang: 150, dmg: 17, kb: 'launch', force: 2, lift: 9.5, stop: 6 }] },
  fc3: { dur: 58, cancel: 50, armor: true, steer: true, lunge: [[6, 44, 2.2, 'lin']], keys: MOVES.c4.keys,   // whirl forward
    hits: [{ f: [8, 43], every: 7, shape: 'circle', range: 3.7, dmg: 8, kb: 'launch', force: -1, lift: 3.2, stop: 1 },
      { f: [46, 49], shape: 'circle', range: 4.4, dmg: 22, kb: 'blow', force: 10, lift: 5, stop: 8 }] },
  fc4: { dur: 60, cancel: 52, armor: true, leap: [8, 8.5], plunge: [20, -20], land: 30, fx: [[30, 'slam', 6.4]], keys: MOVES.c6.keys,   // leap and crush
    hits: [{ f: [30, 33], shape: 'circle', range: 6.4, dmg: 34, kb: 'blow', force: 10, lift: 8, stop: 10, heavy: true }] },
  fc5: { dur: 46, cancel: 38, armor: true, steer: true, lunge: [[6, 26, 8.5, 'lin']], fx: [[28, 'burst', 1.2]],   // bull rush
    keys: [[0, BASE], [5, fRam, 'snap'], [26, fRam], [30, fSwingL, 'snap'], [46, BASE]],
    hits: [{ f: [7, 26], every: 3, shape: 'line', len: 2.6, width: 3.0, dmg: 9, kb: 'blow', force: 7, lift: 5, stop: 1 },
      { f: [28, 31], shape: 'circle', range: 4.2, dmg: 18, kb: 'blow', force: 9, lift: 5, stop: 6 }] },
});
const GUARD = P({ ty: 0.45, tx: 0.08, rootY: -0.16, w: W(-0.3, 0.32, 0.4, -0.12, 1.5), gL: 0.55, thL: 0.5, shL: -0.5, thR: -0.4, shR: -0.4, lzL: 0.28, lzR: -0.28 });
for (const [k, m] of Object.entries(MOVES)) m.id = k;

export const HERO = { run: 7.4, accel: 60, turn: 16, jumpV: 8.2, g: 26, dodge: 22, hpMax: 500, musouMax: 100, ride: 11.5, rideAccel: 12, rideTurn: 3.4, buffTime: 30 * 60 };

// playable officers. reach scales hit shapes, tough = ordinary blows never stagger him
export const CHARS = {
  zhao: { key: 'zhao', zh: '趙雲', en: 'ZHAO YUN', seal: '常山', pal: 'zhao', opts: { cape: true, adou: true, headband: true, topknot: true, scarf: true, weapon: 'spear' },
    horse: 'white', hp: 500, run: 7.4, atk: 1, reach: 1, tough: false, musou: 'dragon', tip: 2.15, stage: 'changban' },
  fei: { key: 'fei', zh: '張飛', en: 'ZHANG FEI', seal: '燕人', pal: 'zhangfei', opts: { beard: true, headband: true, topknot: true, weapon: 'serpent', scale: 1.16 },
    horse: 'black', hp: 700, run: 6.6, atk: 1.35, reach: 1.06, tough: true, musou: 'roar', tip: 2.6, stage: 'bridge', mv: { n1: 'fn1', c1: 'fc1' } },
};
const reachHit = (hd, r) => (r === 1 ? hd : hd['_r' + r] || (hd['_r' + r] = { ...hd, range: hd.range && hd.range * r, len: hd.len && hd.len * r, width: hd.width && hd.width * (1 + (r - 1) * 0.5) }));

// ---- mounted: seat pose + two sweeps (J) and a couched charge (K)
const RIDE_O = { rootY: 0, tx: 0.15, ty: 0.05, hx: -0.1, hy: 0, thL: 1.2, shL: -1.35, thR: 1.2, shR: -1.35, lzL: 0.5, lzR: -0.5,
  w: W(-0.34, 0.18, 0.1, -0.55, -0.2), ikL: 0, aL: [0.85, 0, 0.15], cape: 0.3 };
const RP = (o = {}) => P({ ...RIDE_O, ...o });
const RIDE = RP();
const couch = RP({ tx: 0.55, hx: -0.4, ty: -0.1, w: W(-0.22, 0.15, 0.5, 0.02, -0.1), cape: 1 });
export const RIDE_ATK = {
  ra: { dur: 24, cancel: 13,      // sweep down the right flank
    keys: [[0, RIDE], [5, RP({ ty: 0.35, w: W(-0.28, 0.32, 0.28, -0.1, 0.5) })], [11, RP({ ty: -0.9, tx: 0.2, w: W(-0.36, 0.2, 0.08, 0.28, -2.3) }), 'snap'], [16, RP({ ty: -0.95, tx: 0.2, w: W(-0.36, 0.2, 0.08, 0.3, -2.45) })], [24, RIDE]],
    hits: [{ f: [7, 12], shape: 'circle', range: 3.4, dmg: 12, kb: 'push', force: 4, stop: 2 }] },
  rb: { dur: 24, cancel: 13,      // and back across the left
    keys: [[0, RIDE], [5, RP({ ty: -0.35, w: W(-0.3, 0.32, 0.25, -0.1, -0.9) })], [11, RP({ ty: 0.9, tx: 0.2, w: W(0.08, 0.2, 0.14, 0.28, 2.3) }), 'snap'], [16, RP({ ty: 0.95, tx: 0.2, w: W(0.08, 0.2, 0.14, 0.3, 2.45) })], [24, RIDE]],
    hits: [{ f: [7, 12], shape: 'circle', range: 3.4, dmg: 13, kb: 'blow', force: 7, lift: 4, stop: 3 }] },
  rc: { dur: 40, cancel: 35, armor: true,
    keys: [[0, RIDE], [5, RP({ tx: 0.4, hx: -0.3, ty: 0.55, w: W(-0.3, 0.12, 0.0, -0.05, -0.65) })], [9, couch, 'snap'], [34, couch], [40, RIDE]],
    hits: [{ f: [6, 34], every: 4, shape: 'line', len: 4.6, width: 2.8, dmg: 9, kb: 'launch', force: 5, lift: 6, stop: 1 }] },
};

export function createHero(game) {
  const h = { x: 0, y: 0, z: -12, vy: 0, vx: 0, vz: 0, yaw: 0, hp: HERO.hpMax, hpMax: HERO.hpMax, musou: 0, state: 'idle', t: 0,
    move: null, mt: 0, serial: 1, buf: null, bufAge: 0, inv: 0, grounded: true, airChain: 0, spd: 0, ph: 0, landed: false,
    dodgeDir: [0, 1], atkMul: 1, sword: false, hitsThisMove: 0, dead: false, riding: false, ratk: null,
    horse: { x: 4.2, z: -11.5, yaw: -0.5, spd: 0, ph: 0, state: 'idle', t: 0 }, buff: { axe: 0, armor: 0, boots: 0 } };
  h.reset = () => Object.assign(h, { x: 0, y: 0, z: -14, vy: 0, vx: 0, vz: 0, yaw: 0, hp: game.char.hp, hpMax: game.char.hp, musou: 0, state: 'idle', t: 0, move: null, mt: 0, inv: 0,
    grounded: true, airChain: 0, spd: 0, sword: false, atkMul: 1, dead: false, buf: null, riding: false, ratk: null,
    horse: { x: 4.2, z: -11.5, yaw: -0.5, spd: 0, ph: 0, state: 'idle', t: 0 }, buff: { axe: 0, armor: 0, boots: 0 } });

  const setState = (s) => { h.state = s; h.t = 0; };
  const startMove = (id, inp) => {
    id = (game.char.mv && game.char.mv[id]) || id;
    const m = MOVES[id];
    h.move = m; h.mt = 0; h.serial++; h.hitsThisMove = 0; setState('move');
    h.lungeDone = 0;
    // face the stick, else soft-lock the nearest enemy in front
    if (inp && inp.mag > 0.2) h.yaw = Math.atan2(inp.mx, inp.mz);
    else { const lk = game.lockPos && game.lockPos(), e = lk && Math.hypot(lk.x - h.x, lk.z - h.z) < 9 ? lk : game.crowd.nearest(h.x, h.z, 5.5, Math.sin(h.yaw), Math.cos(h.yaw), -0.2); if (e) h.yaw = Math.atan2(e.x - h.x, e.z - h.z); }
    if (m.air) { h.airChain++; if (m.hover) h.vy = Math.max(h.vy, m.hover); }
    game.emit('move', { id, hero: h });
  };
  h.startMove = startMove;

  // from = who struck ({ i } crowd index, or { cav } rider) so a parry can answer it
  h.hurt = (dmg, fx, fz, heavy, src = '?', from = null) => {
    if (h.dead || h.inv > 0 || h.state === 'musou' || h.state === 'down' || h.state === 'getup') return false;
    if (h.state === 'guard' && Math.cos(Math.atan2(fx - h.x, fz - h.z) - h.yaw) > -0.2) {
      if (h.guardT <= 10) {                                   // just guard: no damage, the attacker reels
        h.musou = Math.min(HERO.musouMax, h.musou + 8); game.hitstop = Math.max(game.hitstop, 7); h.guardT = 0; h.parries = (h.parries || 0) + 1;
        game.emit('parry', { x: h.x + Math.sin(h.yaw) * 0.8, z: h.z + Math.cos(h.yaw) * 0.8, from });
        return false;
      }
      if (!heavy) {
        h.hp = Math.max(1, h.hp - dmg * game.diff.dmg * 0.12); h.kx = -Math.sin(h.yaw) * 1.6; h.kz = -Math.cos(h.yaw) * 1.6; h.blockT = 8;
        game.emit('block', { x: h.x + Math.sin(h.yaw) * 0.8, z: h.z + Math.cos(h.yaw) * 0.8 });
        return false;
      }
      dmg *= 0.5; heavy = false; game.emit('guardBreak', { x: h.x, z: h.z });      // a heavy blow smashes through, but only staggers
    }
    const armored = (h.state === 'move' && h.move.armor) || (h.riding && h.ratk && h.ratk.id === 'rc');
    dmg *= game.diff.dmg * (h.buff.armor > 0 ? 0.5 : 1) * (armored ? 0.5 : 1);
    h.hp -= dmg;
    h.musou = Math.min(HERO.musouMax, h.musou + dmg * 0.25);
    game.emit('heroHurt', { dmg, heavy, src });
    if (h.hp <= 0) { h.hp = 0; h.dead = true; unhorse(); setState('down'); h.move = null; game.emit('heroDead'); return true; }
    if ((armored || h.riding || game.char.tough) && !heavy) return true;
    h.move = null; h.yaw = Math.atan2(fx - h.x, fz - h.z);
    if (h.riding) unhorse();
    if (heavy) { setState('down'); h.vy = h.grounded ? 4 : h.vy; h.grounded = false; h.kx = -Math.sin(h.yaw) * 5; h.kz = -Math.cos(h.yaw) * 5; }
    else { setState('hurt'); h.kx = -Math.sin(h.yaw) * 2.5; h.kz = -Math.cos(h.yaw) * 2.5; }
    return true;
  };

  // ---- the white horse
  const mount = () => { const hz = h.horse; h.riding = true; h.ratk = null; h.move = null; setState('ride'); h.spd = Math.max(h.spd * 0.6, hz.spd * 0.6); h.ph = hz.ph; hz.state = 'idle'; game.emit('mount'); };
  const leaveHorse = () => { const hz = h.horse; h.riding = false; h.ratk = null; hz.x = h.x; hz.z = h.z; hz.yaw = h.yaw; hz.spd = h.spd * 0.6; hz.state = 'idle'; hz.t = 0; };
  const unhorse = () => { if (!h.riding) return; leaveHorse(); h.horse.state = 'flee'; h.horse.spd = 8; h.spd = 0; game.emit('unhorse'); };
  h.mount = mount; h.leaveHorse = leaveHorse;
  function horseStep(dt) {
    const hz = h.horse; hz.t++;
    if (h.riding) { hz.x = h.x; hz.z = h.z; hz.yaw = h.yaw; hz.spd = h.spd; hz.ph = h.ph; return; }
    if (hz.state === 'come') {
      const dx = h.x - hz.x, dz = h.z - hz.z, d = Math.hypot(dx, dz);
      hz.yaw = turn(hz.yaw, Math.atan2(dx, dz), 0.14);
      const want = d > 2.4 ? Math.min(16, 4 + d * 1.6) : 0;
      hz.spd += Math.sign(want - hz.spd) * Math.min(Math.abs(want - hz.spd), 34 * dt);
      if (d < 2.8 && (h.state === 'idle' || h.state === 'run')) { mount(); return; }
      if (hz.t > 600) hz.state = 'idle';
    } else if (hz.state === 'flee') { hz.spd += (7 - hz.spd) * 0.1; if (hz.t > 70) hz.state = 'idle'; }
    else hz.spd *= 0.9;
    hz.x += Math.sin(hz.yaw) * hz.spd * dt; hz.z += Math.cos(hz.yaw) * hz.spd * dt; hz.ph += hz.spd * dt * 0.8;
    game.world.resolve(hz, 0.7, false);
  }
  const startRide = (id, inp) => {
    h.ratk = { id, t: 0 }; h.serial++;
    if (id === 'rc' && inp && inp.mag > 0.2) h.yaw = turn(h.yaw, Math.atan2(inp.mx, inp.mz), 0.5);
    game.emit('move', { id, hero: h });
  };

  h.step = (inp) => {
    const dt = 1 / 60;
    h.t++; if (h.inv > 0) h.inv--;
    for (const k in h.buff) if (h.buff[k] > 0) h.buff[k]--;
    h.atkMul = game.char.atk * (h.sword ? 1.3 : 1) * (h.buff.axe > 0 ? 2 : 1);
    const runTop = game.char.run * (h.buff.boots > 0 ? 1.25 : 1), reach = game.char.reach;
    horseStep(dt);
    // buffer presses
    if (inp.attack) { h.buf = 'a'; h.bufAge = 0; } else if (inp.charge) { h.buf = 'c'; h.bufAge = 0; }
    if (inp.jump) { h.bufJ = 8; } if (inp.dodge) { h.bufD = 8; }
    if (h.buf && ++h.bufAge > 30) h.buf = null;
    if (h.bufJ > 0) h.bufJ--; if (h.bufD > 0) h.bufD--;
    const S = h.state;
    let mvx = 0, mvz = 0, want = 0;
    if (S === 'dead') return;
    if (S === 'musou') { game.musou.heroStep(h, inp); integrate(dt); return; }

    const canAct = S === 'idle' || S === 'run' || (S === 'land' && h.t > 4);
    if (inp.musou && h.musou >= HERO.musouMax && (canAct || S === 'move' || S === 'jump' || S === 'hurt' || S === 'ride')) { if (h.riding) leaveHorse(); h.move = null; game.musou.start(h); return; }
    if (inp.guard && canAct && h.grounded) { setState('guard'); h.guardT = 0; h.spd = 0; h.kx = h.kz = 0; return integrate(dt); }
    if (S === 'guard') {
      h.guardT++;
      const lk = game.lockPos && game.lockPos();
      if (lk) h.yaw = turn(h.yaw, Math.atan2(lk.x - h.x, lk.z - h.z), 0.2);
      if (h.blockT > 0) { h.blockT--; h.x += h.kx * dt; h.z += h.kz * dt; h.kx *= 0.85; h.kz *= 0.85; }
      else if (inp.mag > 0.1) { h.x += inp.mx * 1.8 * dt; h.z += inp.mz * 1.8 * dt; h.ph += 1.8 * dt * 1.55; }
      if (h.bufD > 0) { startDodge(inp); return integrate(dt); }
      if (h.buf) { const b = h.buf; h.buf = null; startMove(b === 'a' ? 'n1' : 'c1', inp); return integrate(dt); }
      if (!inp.guard && h.guardT > 6) setState('idle');
      return integrate(dt);
    }
    if (inp.mount && !h.riding && canAct) {
      const hz = h.horse;
      if (Math.hypot(hz.x - h.x, hz.z - h.z) < 3) { hz.yaw = h.yaw; mount(); return integrate(dt); }
      hz.state = 'come'; hz.t = 0; game.emit('whistle');
    }

    if (S === 'ride') {
      let top = HERO.ride * (h.buff.boots > 0 ? 1.2 : 1), wantR = inp.mag > 0.1 ? inp.mag : 0;
      const ra = h.ratk;
      if (ra) {
        const A = RIDE_ATK[ra.id]; ra.t++;
        if (ra.id === 'rc' && ra.t > 5 && ra.t < 34) { top = 16.5; wantR = 1; h.spd = Math.max(h.spd, 14); }
        A.hits.forEach((hd, i) => {
          if (ra.t < hd.f[0] || ra.t > hd.f[1]) return;
          if (hd.every && (ra.t - hd.f[0]) % hd.every !== 0) return;
          const key = h.serial * 64 + i * 8 + ((hd.every ? Math.floor((ra.t - hd.f[0]) / hd.every) : 0) % 8);
          game.crowd.heroHit(h, reachHit(hd, reach), key, 0, 0);
        });
        if (ra.id === 'rc' && ra.t === 34) game.emit('burst', { x: h.x + Math.sin(h.yaw) * 2, z: h.z + Math.cos(h.yaw) * 2 });
        if (ra.t >= A.cancel && h.buf) { const b = h.buf; h.buf = null; startRide(b === 'c' ? 'rc' : ra.id === 'ra' ? 'rb' : 'ra', inp); }
        else if (ra.t >= A.dur) h.ratk = null;
      } else if (h.buf) { const b = h.buf; h.buf = null; startRide(b === 'c' ? 'rc' : 'ra', inp); }
      if (h.bufJ > 0) { h.bufJ = 0; leaveHorse(); startJump(inp); return integrate(dt); }
      if (h.bufD > 0) { leaveHorse(); startDodge(inp); return integrate(dt); }
      if (inp.mount && h.t > 20) { leaveHorse(); h.spd = 0; setState('idle'); return integrate(dt); }
      const target = wantR * top;
      h.spd += Math.sign(target - h.spd) * Math.min(Math.abs(target - h.spd), (target > h.spd ? HERO.rideAccel : 22) * dt);
      if (inp.mag > 0.1) h.yaw = turn(h.yaw, Math.atan2(inp.mx, inp.mz), HERO.rideTurn * dt * (1.7 - Math.min(1, h.spd / 14) * 0.7));
      h.x += Math.sin(h.yaw) * h.spd * dt; h.z += Math.cos(h.yaw) * h.spd * dt;
      const ph0 = h.ph; h.ph += h.spd * dt * 0.8;
      if (h.spd > 2 && Math.floor(h.ph / 1.57) !== Math.floor(ph0 / 1.57)) game.emit('hoof');
      // trample whatever stands in front of the charger
      if (h.spd > 5 && game.frame % 3 === 0) {
        const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
        game.crowd.heroHit({ x: h.x + fx * 1.2, z: h.z + fz * 1.2, y: h.y, yaw: h.yaw, atkMul: h.atkMul }, { shape: 'circle', range: 1.3, dmg: 8 + h.spd * 0.9, kb: 'blow', force: h.spd * 0.5, lift: 4.5, stop: 0 }, 700000 + ((game.frame / 12) | 0), 0, 0);
      }
      integrate(dt);
      return;
    }

    if (S === 'move') {
      const m = h.move; h.mt++;
      // lunge
      let adv = 0;
      if (m.lunge) for (const [a, b, d, e] of m.lunge) if (h.mt > a && h.mt <= b) { const u0 = (h.mt - 1 - a) / (b - a), u1 = (h.mt - a) / (b - a); const f = e === 'lin' ? (x) => x : (x) => 1 - (1 - x) ** 2; adv += (f(u1) - f(u0)) * d; }
      if (adv) {
        if (inp.mag > 0.2 && m.steer) h.yaw = turn(h.yaw, Math.atan2(inp.mx, inp.mz), 0.06);
        const e = game.crowd.blockedAhead(h.x, h.z, Math.sin(h.yaw), Math.cos(h.yaw));
        const k = m.armor ? 1 : e ? 0.35 : 1;
        h.x += Math.sin(h.yaw) * adv * k; h.z += Math.cos(h.yaw) * adv * k;
      }
      if (m.leap && h.mt === m.leap[0]) { h.vy = m.leap[1]; h.grounded = false; }
      if (m.plunge && h.mt === m.plunge[0]) { h.vy = m.plunge[1]; }
      if (m.leap && h.mt > m.leap[0] && h.mt < m.plunge[0]) h.vy = Math.max(h.vy, h.mt > 14 ? 0 : h.vy);
      if (m.land) { if (!h.grounded && h.mt >= m.land - 1) h.mt = m.land - 1; }
      if (m.hover && h.mt < 10) h.vy = Math.max(h.vy, 0.5);
      // hits
      m.hits.forEach((hd, i) => {
        if (h.mt < hd.f[0] || h.mt > hd.f[1]) return;
        const rep = hd.every ? Math.floor((h.mt - hd.f[0]) / hd.every) : 0;
        if (hd.every && (h.mt - hd.f[0]) % hd.every !== 0) return;
        const key = h.serial * 64 + i * 8 + (rep % 8);
        const n = game.crowd.heroHit(h, reachHit(hd, reach), key, h.mt - hd.f[0], hd.f[1] - hd.f[0]);
        h.hitsThisMove += n;
      });
      if (m.fx) for (const [f, ev, r] of m.fx) if (h.mt === f) { if (ev === 'burst') game.emit('burst', { x: h.x + Math.sin(h.yaw) * r, z: h.z + Math.cos(h.yaw) * r }); else game.emit(ev, { x: h.x, z: h.z, r: r * reach }); }
      // chaining
      const canCancel = h.mt >= m.cancel;
      if (h.bufD > 0 && (h.mt < (m.hits[0]?.f[0] ?? 0) || canCancel) && !m.air && h.grounded) { startDodge(inp); return integrate(dt); }
      if (h.buf && canCancel) {
        if (m.air) { if (h.buf === 'a' && h.airChain < 3 && !h.grounded) { h.buf = null; startMove('aj', inp); } else if (h.buf === 'c' && !h.grounded && !m.plunge) { h.buf = null; startMove('ak', inp); } }
        else if (h.buf === 'a' && m.next) { h.buf = null; startMove(m.next, inp); }
        else if (h.buf === 'c' && m.charge) { h.buf = null; startMove(m.charge, inp); }
        else if (h.buf === 'a' && !m.next && h.mt >= m.dur - 6) { h.buf = null; startMove('n1', inp); }
      }
      if (h.bufJ > 0 && canCancel && h.grounded && !m.armor) { h.bufJ = 0; startJump(inp); return integrate(dt); }
      if (h.state === 'move' && h.move === m && h.mt >= m.dur) { h.move = null; setState(h.grounded ? 'idle' : 'jump'); }
      integrate(dt, m.air ? 0.5 : 0);
      if (m.air && h.grounded && !m.land && h.state === 'move') { h.move = null; setState('land'); }
      return;
    }
    if (S === 'hurt') { h.x += h.kx * dt; h.z += h.kz * dt; h.kx *= 0.88; h.kz *= 0.88; if (h.t > 20) setState('idle'); integrate(dt); return; }
    if (S === 'down') { h.x += h.kx * dt; h.z += h.kz * dt; h.kx *= 0.93; h.kz *= 0.93; integrate(dt); if (h.dead) return; if (h.t > 55 && h.grounded) { setState('getup'); h.inv = 40; } return; }
    if (S === 'getup') { if (h.t > 22) setState('idle'); return; }
    if (S === 'dodge') {
      const k = h.t < 14 ? 1 : Math.max(0, 1 - (h.t - 14) / 8);
      h.x += h.dodgeDir[0] * HERO.dodge * 0.5 * k * dt * (h.t < 4 ? 1.6 : 1); h.z += h.dodgeDir[1] * HERO.dodge * 0.5 * k * dt * (h.t < 4 ? 1.6 : 1);
      if (h.t > 14 && h.buf) { const b = h.buf; h.buf = null; startMove(b === 'a' ? 'n1' : 'c1', inp); return; }
      if (h.t >= 22) setState('idle');
      integrate(dt); return;
    }
    // free states: idle / run / jump / land
    if (inp.mag > 0.1) { mvx = inp.mx; mvz = inp.mz; want = inp.mag; }
    if (S === 'jump') {
      h.vx += (mvx * runTop * 0.85 - h.vx) * 0.08; h.vz += (mvz * runTop * 0.85 - h.vz) * 0.08;
      if (want > 0.1) h.yaw = turn(h.yaw, Math.atan2(mvx, mvz), 0.15);
      if (h.buf === 'a' && h.airChain < 3) { h.buf = null; startMove('aj', inp); return integrate(dt); }
      if (h.buf === 'c') { h.buf = null; startMove('ak', inp); return integrate(dt); }
      h.x += h.vx * dt; h.z += h.vz * dt;
      integrate(dt);
      if (h.grounded) setState('land');
      return;
    }
    if (h.bufD > 0) { startDodge(inp); return integrate(dt); }
    if (h.bufJ > 0) { h.bufJ = 0; startJump(inp); return integrate(dt); }
    if (h.buf) { const b = h.buf; h.buf = null; startMove(b === 'a' ? 'n1' : 'c1', inp); return integrate(dt); }
    const target = want * runTop;
    h.spd += Math.sign(target - h.spd) * Math.min(Math.abs(target - h.spd), HERO.accel * dt);
    if (want > 0.1) h.yaw = turn(h.yaw, Math.atan2(mvx, mvz), HERO.turn * dt);
    h.x += Math.sin(h.yaw) * h.spd * dt; h.z += Math.cos(h.yaw) * h.spd * dt;
    h.ph += h.spd * dt * 1.55;
    if (S === 'land' && h.t > 8) setState('idle');
    if (S !== 'land') setState_(h.spd > 0.6 ? 'run' : 'idle');
    integrate(dt);
  };
  const setState_ = (s) => { if (h.state !== s) setState(s); };
  const startJump = (inp) => { setState('jump'); h.vy = HERO.jumpV; h.grounded = false; h.airChain = 0; const s = inp.mag > 0.1 ? HERO.run * 0.9 : h.spd * 0.5; h.vx = Math.sin(inp.mag > 0.1 ? Math.atan2(inp.mx, inp.mz) : h.yaw) * s; h.vz = Math.cos(inp.mag > 0.1 ? Math.atan2(inp.mx, inp.mz) : h.yaw) * s; game.emit('jump'); };
  const startDodge = (inp) => {
    h.bufD = 0; h.move = null; setState('dodge'); h.inv = 16;
    const a = inp.mag > 0.1 ? Math.atan2(inp.mx, inp.mz) : h.yaw + Math.PI;
    h.dodgeDir = [Math.sin(a), Math.cos(a)];
    if (inp.mag > 0.1) h.yaw = a;
    game.emit('dodge');
  };
  function integrate(dt, hoverG = 0) {
    const gy = groundY(h.x, h.z);
    if (!h.grounded || h.y > gy + 0.01) {
      h.vy -= HERO.g * (1 - hoverG) * dt; h.y += h.vy * dt;
      if (h.y <= gy) { h.y = gy; h.vy = 0; if (!h.grounded) { h.grounded = true; h.airChain = 0; game.emit('land', { x: h.x, z: h.z }); } }
      else h.grounded = false;
    } else { h.y = gy; }
    game.world.resolve(h, h.riding ? 0.75 : 0.45, true);
    game.crowd.pushHero(h);
  }
  return h;
}

function turn(a, b, k) {
  let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  return a + Math.sign(d) * Math.min(Math.abs(d), k);
}
export { turn };

// ---------------------------------------------------------------- view
export function createHeroView(scene, h) {
  const sets = {};
  for (const k in CHARS) {
    const ch = CHARS[k], r = buildWarrior(PAL[ch.pal], ch.opts), hs = buildHorse({ pal: ch.horse });
    r.root.visible = hs.root.visible = false; scene.add(r.root, hs.root); sets[k] = { rig: r, horse: hs };
  }
  let rig = sets.zhao.rig, horse = sets.zhao.horse;
  const cur = clonePose(BASE), tgt = clonePose(BASE), rideT = clonePose(RIDE);
  const tip = new THREE.Vector3(), mid = new THREE.Vector3();
  let t = 0;
  const v = { rig, horse, cur, tip, mid, trailOn: false, char: CHARS.zhao };
  v.setChar = (k) => {
    for (const q in sets) sets[q].rig.root.visible = sets[q].horse.root.visible = q === k;
    rig = sets[k].rig; horse = sets[k].horse; v.rig = rig; v.horse = horse; v.char = CHARS[k];
  };
  v.setBaby = (on) => { const a = sets.zhao.rig.j.adou; if (a) a.visible = on; };   // 尋主: 趙雲 starts without A Dou
  v.setChar('zhao');
  v.step = () => {   // once per sim frame
    t += 1 / 60;
    let k = 0.28;
    const S = h.state;
    if (S === 'move' || S === 'musou') {
      const m = h.state === 'musou' ? null : h.move;
      if (m) sampleClip(m.keys, h.mt, tgt); else h.musouPose(tgt);
      k = 0.6;
    } else if (S === 'ride') {
      const g = Math.min(1, h.spd / HERO.ride);
      if (h.ratk) { sampleClip(RIDE_ATK[h.ratk.id].keys, h.ratk.t, tgt); k = 0.6; }
      else { Object.assign(tgt, clonePose(RIDE)); tgt.tx = 0.12 + g * 0.3 + Math.sin(h.ph * 2) * 0.04 * g; tgt.hx = -0.1 - g * 0.25; tgt.cape = g; tgt.aL = [0.85 + Math.sin(h.ph * 2) * 0.08 * g, 0, 0.15]; k = 0.35; }
    } else if (S === 'run') { runPose(h.ph, h.spd, tgt); k = 0.3; }
    else if (S === 'jump') { Object.assign(tgt, clonePose(BASE), { tx: -0.1, thL: 0.9, shL: -1.4, thR: 0.2, shR: -1.0, rootY: 0, cape: 0.8, w: [-0.3, 0.1, 0.0, -0.3, Math.PI - 0.5, 0], ikL: 0, aL: [-0.8, 0, 0.6] }); k = 0.25; }
    else if (S === 'land') { Object.assign(tgt, clonePose(BASE), { rootY: -0.25, tx: 0.4, thL: 0.8, shL: -1.2, thR: -0.3, shR: -0.9 }); k = 0.4; }
    else if (S === 'dodge') { Object.assign(tgt, clonePose(BASE), { rootY: -0.3, tx: 0.7, hx: -0.4, thL: 1.0, shL: -1.4, thR: -0.6, shR: -0.8, cape: 1, w: [-0.3, 0.0, -0.05, -0.1, Math.PI - 0.3, 0], ikL: 0, aL: [0.9, 0, 0.3] }); k = 0.45; }
    else if (S === 'guard') { Object.assign(tgt, clonePose(GUARD)); if (h.blockT > 0) { tgt.tx = -0.12; tgt.rootY = -0.22; } k = 0.5; }
    else if (S === 'hurt') { Object.assign(tgt, clonePose(BASE), { tx: -0.45, hx: 0.4, rootY: -0.1, thL: 0.1, thR: -0.4, cape: 0.5 }); k = 0.5; }
    else if (S === 'down') { Object.assign(tgt, clonePose(BASE), { pitch: -1.45, rootY: 0.25, tx: -0.1, thL: 0.3, shL: -0.4, thR: 0.1, shR: -0.2, w: [-0.35, 0.0, 0.1, 0, 0.3, 0], ikL: 0, aL: [-0.3, 0, 1.2] }); k = 0.22; }
    else if (S === 'getup') { Object.assign(tgt, clonePose(BASE), { rootY: -0.35, tx: 0.5, thL: 1.0, shL: -1.6, thR: -0.2, shR: -1.4 }); k = 0.3; }
    else if (S === 'dead') { k = 0.1; }
    else idlePose(t, tgt);
    approach(cur, tgt, k);
    // secondary: cape follows speed
    cur.cape = Math.max(cur.cape, Math.min(1, h.spd / 7) * 0.8);
    v.trailOn = S === 'musou' || (S === 'move' && h.move.hits.some((hd) => h.mt >= hd.f[0] - 2 && h.mt <= hd.f[1] + 2))
      || (S === 'ride' && !!h.ratk && RIDE_ATK[h.ratk.id].hits.some((hd) => h.ratk.t >= hd.f[0] - 2 && h.ratk.t <= hd.f[1] + 2));
  };
  v.update = () => {
    const hz = h.horse, g = Math.min(1, hz.spd / HERO.ride);
    horse.root.position.set(hz.x, h.riding ? h.y : groundY(hz.x, hz.z), hz.z); horse.root.rotation.y = hz.yaw;
    poseHorse(horse, hz.ph, g, t);
    rig.root.position.set(h.x, h.y + (h.riding ? horse.j.body.position.y + 0.28 - 0.96 * rig.scale : 0), h.z);
    rig.root.rotation.y = h.yaw;
    applyPose(rig, cur);
    rig.root.updateMatrixWorld(true);
    weaponPoint(rig, v.char.tip, tip); weaponPoint(rig, 1.0, mid);
    rig.root.visible = true;
  };
  return v;
}
