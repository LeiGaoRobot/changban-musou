// Wei army: struct-of-arrays sim for the grunts (instanced render), rigged officers, archers' arrows, hit reactions.
import * as THREE from 'three';
import { soldierParts, buildWarrior, PAL, bannerTexture, Vox } from './voxel.js';
const VS = 0.06;   // soldier joint offsets are written in 6 cm units
import { GATE, ARENA, groundY, flagMaterial } from './world.js';
import { MOVES } from './hero.js';
import { BASE, P, clonePose, sampleClip, approach, runPose, idlePose, applyPose, weaponPoint } from './anim.js';

export const ST = { OFF: 0, FORM: 1, MARCH: 2, ENGAGE: 3, WIND: 4, STRIKE: 5, RECOVER: 6, HURT: 7, KNOCK: 8, AIR: 9, DOWN: 10, GETUP: 11, DEAD: 12, AIM: 13, SHOOT: 14 };
export const KIND = { SPEAR: 0, SWORD: 1, ARCHER: 2, CAPTAIN: 3, BEARER: 4, OFFICER: 5 };
const TAU = Math.PI * 2;
export const CROWD = {
  maxGrunts: 420, engaged: 30, tokens: 2, windup: 38, strike: 12, recover: 22, cd: [100, 240], dmg: 5, archerDmg: 3,
  walk: 2.6, run: 4.6, march: 3.2, radius: 0.42, g: 22, reinforceBelow: 140, squad: 22,
};
export const OFFICERS = [
  { key: 'xiahou', zh: '夏侯恩', en: 'XIAHOU EN', pal: PAL.xiahou, weapon: 'sword', opts: { helm: true, cape: true }, hp: 1300, speed: 5.0, atk: ['combo', 'dash'], dmg: 1 },
  { key: 'yan', zh: '晏明', en: 'YAN MING', pal: PAL.yan, weapon: 'halberd', opts: { helm: true, beard: true, mirror: true, scale: 1.1 }, hp: 1600, speed: 4.6, atk: ['combo', 'spin'], dmg: 1.1 },
  { key: 'chunyu', zh: '淳于導', en: 'CHUNYU DAO', pal: PAL.chunyu, weapon: 'glaive', opts: { helm: true, beard: true, mirror: true, scale: 1.12 }, hp: 1600, speed: 4.6, atk: ['combo', 'dash'], dmg: 1.1 },
  { key: 'zhang', zh: '張郃', en: 'ZHANG HE', pal: PAL.zhang, weapon: 'claw', opts: { helm: true, horns: true, mirror: true, offhand: 'claw', dual: true, cape: true, scale: 1.08 }, hp: 2400, speed: 6.0, atk: ['combo', 'dash', 'spin', 'leap'], dmg: 1.2 },
  // 據水斷橋
  { key: 'wenpin', zh: '文聘', en: 'WEN PIN', pal: PAL.wenpin, weapon: 'halberd', opts: { helm: true, cape: true, scale: 1.06 }, hp: 1700, speed: 5.2, atk: ['combo', 'dash'], dmg: 1.1 },
  { key: 'xuchu', zh: '許褚', en: 'XU CHU', pal: PAL.xuchu, weapon: 'hammer', opts: { helm: true, beard: true, scale: 1.26 }, hp: 3000, speed: 4.8, atk: ['combo', 'spin', 'leap'], dmg: 1.35 },
];
// officer attacks: segments of hero clips with a telegraph hold on the chamber frame
const OATK = {
  combo: [{ clip: 'n1', tele: 26, hit: { shape: 'arc', range: 3.0, ang: 90, dmg: 14 } }, { clip: 'n2', tele: 4, hit: { shape: 'arc', range: 3.0, ang: 150, dmg: 14 } },
    { clip: 'n5', tele: 8, hit: { shape: 'arc', range: 3.2, ang: 90, dmg: 18, heavy: true } }],
  dash: [{ clip: 'c5', tele: 42, hit: { shape: 'line', len: 2.2, width: 2.0, dmg: 22, heavy: true } }],
  spin: [{ clip: 'n6', tele: 48, hit: { shape: 'circle', range: 3.8, dmg: 20, heavy: true } }],
  leap: [{ clip: 'c6', tele: 30, hit: { shape: 'circle', range: 4.6, dmg: 26, heavy: true }, leap: true }],
};

// does a hit shape cast from (hx, hz) facing yaw reach a target of radius r at (x, z)?
export function shapeHit(hd, hx, hz, yaw, x, z, r) {
  const dx = x - hx, dz = z - hz, d = Math.hypot(dx, dz);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  if (hd.shape === 'circle') return d < hd.range + r;
  if (hd.shape === 'arc') {
    if (d > hd.range + r) return false;
    if (d < 0.9) return true;
    const dir = (hd.dir || 0) * Math.PI / 180, a = Math.atan2(dx, dz) - (yaw + dir);
    const w = Math.atan2(Math.sin(a), Math.cos(a));
    return Math.abs(w) <= (hd.ang * Math.PI / 360) + r / d;
  }
  if (hd.shape === 'line') {
    const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    return along > -0.6 && along < hd.len + r && side < hd.width / 2 + r;
  }
  return false;
}

export function createCrowd(game, scene) {
  const N = CROWD.maxGrunts + OFFICERS.length;
  const F = () => new Float32Array(N), I = () => new Int32Array(N);
  const c = { N, x: F(), z: F(), y: F(), vx: F(), vz: F(), vy: F(), yaw: F(), hp: F(), hpMax: F(), st: I(), stT: I(), kind: I(), squad: I(),
    lastKey: I(), flash: F(), spin: F(), spinV: F(), pitch: F(), cd: I(), ph: F(), pref: F(), kod: I(), strafe: F(), tele: F(), ox: F(), oz: F(),
    squads: [], officers: [], arrows: [], ko: 0, alive: 0, spawned: 0, tokensUsed: 0, freeze: 0, lastHitBy: I(), lx: F(), lz: F(), det: I(), detN: I() };
  const offBase = CROWD.maxGrunts;
  let rngS = 99;
  const rnd = () => ((rngS = Math.imul(rngS ^ (rngS >>> 15), 2246822519) + 0x6D2B79F5 | 0) >>> 0) / 4294967296;
  const rr = (a, b) => a + rnd() * (b - a);

  // ------------------------------------------------ grid
  const CELL = 2, GN = 72, HALF = GN * CELL / 2;
  const head = new Int32Array(GN * GN).fill(-1), next = new Int32Array(N).fill(-1);
  const cellOf = (x, z) => { const gx = Math.floor((x + HALF) / CELL), gz = Math.floor((z + HALF) / CELL); return gx < 0 || gz < 0 || gx >= GN || gz >= GN ? -1 : gx + gz * GN; };
  function buildGrid() {
    head.fill(-1);
    for (let i = 0; i < N; i++) { if (c.st[i] === ST.OFF || c.st[i] === ST.DEAD) continue; const k = cellOf(c.x[i], c.z[i]); if (k < 0) continue; next[i] = head[k]; head[k] = i; }
  }
  function query(x, z, r, fn) {
    const g0x = Math.max(0, Math.floor((x - r + HALF) / CELL)), g1x = Math.min(GN - 1, Math.floor((x + r + HALF) / CELL));
    const g0z = Math.max(0, Math.floor((z - r + HALF) / CELL)), g1z = Math.min(GN - 1, Math.floor((z + r + HALF) / CELL));
    for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) for (let i = head[gx + gz * GN]; i >= 0; i = next[i]) fn(i);
  }
  c.query = query;
  const alive = (i) => c.st[i] !== ST.OFF && c.st[i] !== ST.DEAD && !c.kod[i];
  const grounded = (i) => c.y[i] <= groundY(c.x[i], c.z[i]) + 0.02;
  c.isAlive = alive;

  // ------------------------------------------------ spawning
  function freeSlot() { for (let i = 0; i < CROWD.maxGrunts; i++) if (c.st[i] === ST.OFF || (c.st[i] === ST.DEAD && c.stT[i] > 240)) return i; return -1; }
  function spawnSoldier(kind, x, z, yaw, sq, st = ST.FORM) {
    const i = freeSlot(); if (i < 0) return -1;
    c.x[i] = x; c.z[i] = z; c.y[i] = 0; c.vx[i] = c.vz[i] = c.vy[i] = 0; c.yaw[i] = yaw; c.kind[i] = kind; c.squad[i] = sq;
    c.hpMax[i] = c.hp[i] = (kind === KIND.CAPTAIN ? 110 : kind === KIND.BEARER ? 60 : 40 + rnd() * 16) * game.diff.hp;
    c.st[i] = st; c.stT[i] = 0; c.lastKey[i] = 0; c.flash[i] = 0; c.spin[i] = 0; c.pitch[i] = 0; c.cd[i] = 60 + (rnd() * 120) | 0; c.ph[i] = rnd() * TAU;
    c.pref[i] = rnd(); c.kod[i] = 0; c.strafe[i] = rnd() < 0.5 ? -1 : 1; c.tele[i] = 0; c.det[i] = 0; c.detN[i] = 0;
    c.spawned++;
    return i;
  }
  // a squad: rows × cols block facing yaw; archers stand in two loose rows
  c.spawnSquad = (cx, cz, yaw, n = CROWD.squad, type = 'mixed', state = 'hold', goal = null) => {
    const sq = { id: c.squads.length, cx, cz, yaw, state, members: [], type, t: 0, bearer: -1, goal };
    const cols = type === 'archer' ? 6 : 6, sp = 1.25;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    for (let k = 0; k < n; k++) {
      const row = Math.floor(k / cols), col = k % cols;
      const ox = (col - (cols - 1) / 2) * sp, oz = -row * sp;
      const kind = type === 'archer' ? KIND.ARCHER : (k % 3 === 2 ? KIND.SWORD : KIND.SPEAR);
      const i = spawnSoldier(kind, cx + rx * ox + fx * oz, cz + rz * ox + fz * oz, yaw, sq.id, state === 'march' ? ST.MARCH : ST.FORM);
      if (i >= 0) { c.ox[i] = ox; c.oz[i] = oz; sq.members.push(i); }
    }
    const cap = spawnSoldier(KIND.CAPTAIN, cx + fx * 1.4, cz + fz * 1.4, yaw, sq.id, state === 'march' ? ST.MARCH : ST.FORM);
    if (cap >= 0) { c.ox[cap] = 0; c.oz[cap] = 1.4; sq.members.push(cap); }
    const b = spawnSoldier(KIND.BEARER, cx - rx * 4.6 - fx * 1, cz - rz * 4.6 - fz * 1, yaw, sq.id, state === 'march' ? ST.MARCH : ST.FORM);
    if (b >= 0) { c.ox[b] = -4.6; c.oz[b] = -1; sq.members.push(b); sq.bearer = b; }
    c.squads.push(sq);
    return sq;
  };

  c.reset = () => {
    c.st.fill(0); c.squads.length = 0; c.arrows.length = 0; c.ko = 0; c.spawned = 0; rngS = 99; c.freeze = 0;
    for (const o of c.officers) { o.active = false; o.dead = false; o.rig.root.visible = false; c.st[o.idx] = ST.OFF; }
  };
  c.spawnArmy = () => {
    const blocks = [[-24, 14], [-8, 20], [9, 16], [25, 12], [-34, 30], [-16, 36], [4, 34], [22, 38], [38, 28], [-40, 4], [42, 2], [0, 46], [-26, -18], [30, -22]];
    blocks.forEach(([x, z], k) => {
      const yaw = Math.atan2(0 - x, -12 - z) + rr(-0.2, 0.2);
      const arch = k === 3 || k === 9;
      c.spawnSquad(x, z, yaw, arch ? 12 : CROWD.squad, arch ? 'archer' : 'mixed');
    });
  };
  c.reinforce = () => {   // column marches out of the gate
    const arch = rnd() < 0.1;
    const sq = c.spawnSquad(GATE.x + rr(-2, 2), GATE.z - 3, Math.PI, arch ? 12 : CROWD.squad, arch ? 'archer' : 'mixed', 'march');
    game.emit('wave', { sq });
  };

  // ------------------------------------------------ officers
  for (let k = 0; k < OFFICERS.length; k++) {
    const d = OFFICERS[k];
    const rig = buildWarrior(d.pal, { ...d.opts, weapon: d.weapon });
    rig.dual = !!d.opts.dual;
    rig.root.visible = false; scene.add(rig.root);
    const o = { k, def: d, rig, idx: offBase + k, active: false, dead: false, cur: clonePose(BASE), tgt: clonePose(BASE), atk: null, seg: 0, segT: 0,
      think: 0, poise: 0, ph: 0, spd: 0, glow: 0, mt: 0, danger: null };
    c.officers.push(o);
  }
  c.spawnOfficer = (k, x, z) => {
    const o = c.officers[k], i = o.idx, d = o.def;
    c.x[i] = x; c.z[i] = z; c.y[i] = 0; c.vx[i] = c.vz[i] = c.vy[i] = 0; c.yaw[i] = Math.PI; c.kind[i] = KIND.OFFICER;
    c.hpMax[i] = c.hp[i] = d.hp * game.diff.hp; c.st[i] = ST.ENGAGE; c.stT[i] = 0; c.lastKey[i] = 0; c.kod[i] = 0; c.flash[i] = 0; c.spin[i] = 0; c.pitch[i] = 0; c.cd[i] = 90;
    o.active = true; o.dead = false; o.atk = null; o.think = 60; o.poise = 0; o.rig.root.visible = true;
    game.emit('officer', { o });
    return o;
  };

  // ------------------------------------------------ hero-facing API
  c.nearest = (x, z, r, fx, fz, cosMin) => {
    let best = null, bd = r * r;
    query(x, z, r, (i) => { if (!alive(i)) return; const dx = c.x[i] - x, dz = c.z[i] - z, d2 = dx * dx + dz * dz; if (d2 > bd) return; const d = Math.sqrt(d2) || 1; if ((dx * fx + dz * fz) / d < cosMin) return; bd = d2; best = { i, x: c.x[i], z: c.z[i] }; });
    return best;
  };
  c.blockedAhead = (x, z, fx, fz) => {
    let n = 0; query(x + fx * 0.8, z + fz * 0.8, 0.9, (i) => { if (alive(i) && grounded(i) && Math.hypot(c.x[i] - x - fx * 0.8, c.z[i] - z - fz * 0.8) < 0.75) n++; });
    return n >= 2;
  };
  c.pushHero = (h) => {
    if (h.y > 0.8) return;
    query(h.x, h.z, 1.2, (i) => {
      if (!alive(i) || c.y[i] > 0.5) return;
      const dx = c.x[i] - h.x, dz = c.z[i] - h.z, d = Math.hypot(dx, dz), R = CROWD.radius + 0.42 + (c.kind[i] === KIND.OFFICER ? 0.1 : 0);
      if (d < R && d > 1e-4) { const k = (R - d) / d; const off = c.kind[i] === KIND.OFFICER; c.x[i] += dx * k * (off ? 0.5 : 0.85); c.z[i] += dz * k * (off ? 0.5 : 0.85); h.x -= dx * k * (off ? 0.5 : 0.15); h.z -= dz * k * (off ? 0.5 : 0.15); }
    });
  };

  // shape test in the hero's frame
  const inShape = (hd, hx, hz, yaw, i) => shapeHit(hd, hx, hz, yaw, c.x[i], c.z[i], CROWD.radius);
  c.inShape = inShape;

  // the hero's blow lands on everyone in shape; returns the number hit
  c.heroHit = (h, hd, key, u, span, opts = {}) => {
    let n = 0, stop = 0;
    const R = (hd.range || hd.len || 4) + 1.5, yMax = hd.yMax ?? 2.4;
    const mul = h.atkMul * (opts.mul || 1);
    const list = [];
    query(h.x, h.z, R, (i) => { if (!alive(i) || c.lastKey[i] === key) return; if (c.y[i] - h.y > yMax) return; if (!inShape(hd, h.x, h.z, h.yaw, i, u)) return; list.push(i); });
    for (const i of list) {
      c.lastKey[i] = key; n++;
      const dx = c.x[i] - h.x, dz = c.z[i] - h.z, d = Math.hypot(dx, dz) || 1;
      let ux = dx / d, uz = dz / d;
      if (hd.shape === 'line') { ux = ux * 0.4 + Math.sin(h.yaw) * 0.6; uz = uz * 0.4 + Math.cos(h.yaw) * 0.6; }
      react(i, hd, ux, uz, mul, opts.musou);
    }
    if (game.extraHit) n += game.extraHit(h, hd, key, mul);
    if (n) { stop = hd.stop || 0; game.hitstop = Math.max(game.hitstop, stop); game.emit('heroHit', { n, hd, key, list, musou: !!opts.musou }); }
    return n;
  };

  // a parried attacker is thrown off balance (officers lose their attack and their poise)
  c.stagger = (i, ux, uz) => {
    if (!alive(i)) return;
    c.st[i] = ST.HURT; c.stT[i] = -18; c.vx[i] = ux * 5; c.vz[i] = uz * 5; c.flash[i] = 1; c.cd[i] = Math.max(c.cd[i], 120);
    if (c.kind[i] === KIND.OFFICER) { const o = c.officers[i - offBase]; o.atk = null; o.danger = null; o.poise = 100; o.think = 70; c.stT[i] = -30; }
  };
  c.shock = (x, z, r, force, lift) => {
    for (let i = 0; i < N; i++) {
      if (!alive(i)) continue;
      const dx = c.x[i] - x, dz = c.z[i] - z, d = Math.hypot(dx, dz) || 1;
      if (d > r) continue;
      const k = 1 - d / r * 0.6, off = c.kind[i] === KIND.OFFICER;
      c.st[i] = ST.AIR; c.stT[i] = 0; c.y[i] += 0.02; c.vy[i] = lift * k * rr(0.7, 1.2) * (off ? 0.6 : 1);
      c.vx[i] = dx / d * force * k * rr(0.7, 1.3); c.vz[i] = dz / d * force * k * rr(0.7, 1.3); c.spinV[i] = rr(4, 10) * (rnd() < 0.5 ? -1 : 1); c.flash[i] = 0.6;
      if (off) { const o = c.officers[i - offBase]; o.atk = null; o.danger = null; }
    }
  };
  function react(i, hd, ux, uz, mul, musou) {
    const off = c.kind[i] === KIND.OFFICER, o = off ? c.officers[i - offBase] : null;
    const dmg = hd.dmg * mul * (off ? (musou ? 0.7 : 1) : 1);
    c.hp[i] -= dmg; c.flash[i] = 1;
    const air = !grounded(i);
    let kb = hd.kb, force = hd.force || 0, lift = hd.lift || 0;
    if (off) {
      o.poise += dmg;
      const armored = (c.st[i] === ST.WIND || c.st[i] === ST.STRIKE) && !musou && !hd.heavy;
      if (armored && o.poise < 90) { game.emit('hit', { i, x: c.x[i], y: c.y[i] + 1.3, z: c.z[i], dmg, off, kb: 'armor', ux, uz }); checkKO(i, ux, uz); return; }
      if ((kb === 'launch' || kb === 'blow') && !musou && o.poise < 60) { kb = 'push'; force *= 0.4; }
      lift *= 0.75; force *= 0.6;
      if (kb === 'launch' || kb === 'blow') o.poise = 0;
      if (o.poise > 120) o.poise = 0;
      o.atk = null; o.danger = null;
    }
    if (c.kind[i] === KIND.ARCHER || c.kind[i] === KIND.BEARER) { force *= 1.2; }
    if (air) {
      c.vy[i] = Math.max(c.vy[i] * 0.3, kb === 'launch' || kb === 'blow' ? lift * 0.7 + 1.5 : 3.2);
      c.vx[i] = ux * Math.max(0.6, force * (kb === 'blow' ? 1 : 0.35)); c.vz[i] = uz * Math.max(0.6, force * (kb === 'blow' ? 1 : 0.35));
      c.st[i] = ST.AIR; c.stT[i] = 0; c.spinV[i] = (kb === 'blow' ? 10 : 5) * (rnd() < 0.5 ? -1 : 1);
    } else if (kb === 'launch' || kb === 'blow') {
      c.vy[i] = lift * rr(0.85, 1.1); c.vx[i] = ux * force * rr(0.8, 1.2); c.vz[i] = uz * force * rr(0.8, 1.2); c.y[i] += 0.02;
      c.st[i] = ST.AIR; c.stT[i] = 0; c.spinV[i] = (kb === 'blow' ? rr(7, 12) : rr(3, 7)) * (rnd() < 0.5 ? -1 : 1);
    } else if (kb === 'down') {
      c.vx[i] = ux * force; c.vz[i] = uz * force; c.st[i] = ST.KNOCK; c.stT[i] = 0;
    } else {
      c.vx[i] = ux * (force + 0.6); c.vz[i] = uz * (force + 0.6); c.st[i] = ST.HURT; c.stT[i] = 0;
    }
    if (c.st[i] !== ST.AIR) c.yaw[i] = Math.atan2(-ux, -uz);
    game.emit('hit', { i, x: c.x[i], y: c.y[i] + 1.2, z: c.z[i], dmg, off, kb, ux, uz });
    checkKO(i, ux, uz);
  }
  function checkKO(i, ux, uz) {
    if (c.hp[i] > 0 || c.kod[i]) return;
    c.kod[i] = 1;
    if (c.st[i] !== ST.AIR) {   // KOs always pop
      c.st[i] = ST.AIR; c.stT[i] = 0; c.vy[i] = rr(3.5, 5.5); c.vx[i] = ux * rr(3, 5); c.vz[i] = uz * rr(3, 5); c.spinV[i] = rr(5, 9) * (rnd() < 0.5 ? -1 : 1);
    }
    c.ko++;
    const off = c.kind[i] === KIND.OFFICER;
    game.emit('ko', { i, x: c.x[i], z: c.z[i], kind: c.kind[i], off, o: off ? c.officers[i - offBase] : null });
    if (off) { const o = c.officers[i - offBase]; o.dead = true; o.atk = null; o.danger = null; }
  }

  // ------------------------------------------------ sim step
  c.step = () => {
    const h = game.hero, dt = 1 / 60;
    buildGrid();
    // director: keep ~CROWD.engaged soldiers on the hero
    let engaged = 0, tokens = 0, aliveN = 0, nearN = 0;
    for (let i = 0; i < CROWD.maxGrunts; i++) {
      const s = c.st[i]; if (s === ST.OFF || s === ST.DEAD || c.kod[i]) continue; aliveN++;
      if (s >= ST.ENGAGE && s <= ST.GETUP) { engaged++; if ((c.x[i] - h.x) ** 2 + (c.z[i] - h.z) ** 2 < 81) nearN++; }
      if (s === ST.WIND || s === ST.STRIKE) tokens++;
    }
    c.alive = aliveN; c.tokensUsed = tokens; c.nearN = nearN;
    if (!c.freeze) {
      for (const sq of c.squads) {
        sq.t++;
        if (sq.state === 'hold' || sq.state === 'march') {
          const live = sq.members.filter((i) => alive(i));
          if (!live.length) { sq.state = 'gone'; continue; }
          const d = Math.hypot(sq.cx - h.x, sq.cz - h.z);
          if (sq.state === 'hold' && (d < 11 || (engaged < CROWD.engaged && d < 70 && sq === nearestHolding()))) { sq.state = 'march'; engaged += live.length * 0.5; }
          if (sq.state === 'march' && sq.goal && !(sq.type === 'archer' && d < 19)) {   // heading for the bridge: only individuals peel off to fight
            const gx = sq.goal.x - sq.cx, gz = sq.goal.z - sq.cz, gd = Math.hypot(gx, gz);
            if (gd < 2.2) {
              for (const i of live) if (c.st[i] === ST.FORM || c.st[i] === ST.MARCH) { c.st[i] = ST.ENGAGE; c.stT[i] = 0; }
              sq.state = 'gone'; continue;
            }
            let dy = Math.atan2(gx, gz) - sq.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); sq.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 0.05);
            sq.cx += Math.sin(sq.yaw) * CROWD.march * 1.1 * dt; sq.cz += Math.cos(sq.yaw) * CROWD.march * 1.1 * dt;
          } else if (sq.state === 'march') {
            const stopAt = sq.type === 'archer' ? 16 : 7;
            if (d > stopAt) {
              const a = Math.atan2(h.x - sq.cx, h.z - sq.cz);
              let dy = a - sq.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); sq.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 0.03);
              sq.cx += Math.sin(sq.yaw) * CROWD.march * dt; sq.cz += Math.cos(sq.yaw) * CROWD.march * dt;
            } else { sq.state = 'engaged'; for (const i of live) if (c.st[i] === ST.FORM || c.st[i] === ST.MARCH) { c.st[i] = c.kind[i] === KIND.ARCHER ? ST.ENGAGE : ST.ENGAGE; c.stT[i] = 0; } }
          }
        }
      }
      if (aliveN < CROWD.reinforceBelow && game.frame % 150 === 0 && game.reinforceOK) c.reinforce();
    }
    for (let i = 0; i < N; i++) {
      if (c.st[i] === ST.OFF) continue;
      if (c.kind[i] === KIND.OFFICER) { officerStep(c.officers[i - offBase], i, h, dt); continue; }
      stepSoldier(i, h, dt);
    }
    // separation
    for (let i = 0; i < N; i++) {
      const s = c.st[i]; if (s === ST.OFF || s === ST.DEAD || s === ST.AIR || s === ST.DOWN) continue;
      const xi = c.x[i], zi = c.z[i];
      query(xi, zi, 1.0, (j) => {
        if (j <= i) return; const sj = c.st[j]; if (sj === ST.AIR || sj === ST.DOWN || sj === ST.DEAD) return;
        const dx = c.x[j] - xi, dz = c.z[j] - zi, d2 = dx * dx + dz * dz, R = CROWD.radius * 2;
        if (d2 < R * R && d2 > 1e-6) { const d = Math.sqrt(d2), k = (R - d) / d * 0.5; c.x[i] -= dx * k; c.z[i] -= dz * k; c.x[j] += dx * k; c.z[j] += dz * k; }
      });
      game.world.resolve({ get x() { return c.x[i]; }, set x(v) { c.x[i] = v; }, get z() { return c.z[i]; }, set z(v) { c.z[i] = v; } }, CROWD.radius, false);
    }
    // arrows
    for (let k = c.arrows.length - 1; k >= 0; k--) {
      const a = c.arrows[k];
      if (!c.freeze) { a.vy -= 9.8 * dt; a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt; a.t++; }
      if (a.stuck) { if (a.t > 240) c.arrows.splice(k, 1); continue; }
      const dh = Math.hypot(a.x - h.x, a.z - h.z);
      if (dh < 0.55 && a.y > h.y + 0.1 && a.y < h.y + 1.9) { if (h.hurt(CROWD.archerDmg, a.x - a.vx, a.z - a.vz, false, 'arrow')) game.emit('arrowHit', a); c.arrows.splice(k, 1); continue; }
      if (a.y <= groundY(a.x, a.z)) { a.stuck = true; a.t = 0; a.y = 0.02; }
    }
  };
  function nearestHolding() {
    let best = null, bd = 1e9; const h = game.hero;
    for (const sq of c.squads) if (sq.state === 'hold') { const d = Math.hypot(sq.cx - h.x, sq.cz - h.z); if (d < bd) { bd = d; best = sq; } }
    return best;
  }

  // slide round props instead of walking into them (a row of 拒馬 used to hold men for good)
  function avoid(i, vx, vz) {
    const sp = Math.hypot(vx, vz); if (sp < 0.1) return [vx, vz];
    const x = c.x[i], z = c.z[i], ux = vx / sp, uz = vz / sp;
    for (const k of game.world.colliders) {
      const dx = k.x - x, dz = k.z - z, d = Math.hypot(dx, dz) || 1;
      if (d > k.r + CROWD.radius + 0.5 || (dx * ux + dz * uz) / d < 0.3) continue;
      const sg = c.strafe[i] >= 0 ? 1 : -1;
      return [-dz / d * sg * sp, dx / d * sg * sp];
    }
    return [vx, vz];
  }
  // men walking somewhere (in formation or to the bridge) who make no headway sidestep until they do:
  // overlapping props (a row of 拒馬) form pockets that plain sliding never leaves
  function travel(i, vx, vz) {
    if (game.frame % 40 === i % 40) {
      const m = Math.hypot(c.x[i] - c.lx[i], c.z[i] - c.lz[i]); c.lx[i] = c.x[i]; c.lz[i] = c.z[i];
      if (m < 0.35) { c.det[i] = 70; if (++c.detN[i] % 3 === 0) c.strafe[i] *= -1; } else if (c.det[i] <= 0) c.detN[i] = 0;
    }
    if (c.det[i] > 0) {
      c.det[i]--; const sp = Math.hypot(vx, vz) || 1, sg = c.strafe[i] >= 0 ? 1 : -1;
      return [(-vz * sg * 0.95 - vx * 0.3) / sp * 3.4, (vx * sg * 0.95 - vz * 0.3) / sp * 3.4];
    }
    return avoid(i, vx, vz);
  }
  function stepSoldier(i, h, dt) {
    c.stT[i]++;
    if (c.flash[i] > 0) c.flash[i] = Math.max(0, c.flash[i] - 0.12);
    const s = c.st[i];
    if (s === ST.DEAD) { return; }
    if (c.freeze && s !== ST.AIR && s !== ST.KNOCK) return;
    const dx = h.x - c.x[i], dz = h.z - c.z[i], d = Math.hypot(dx, dz) || 1;
    const toHero = Math.atan2(dx, dz);
    const faceTo = (a, k = 0.12) => { let q = a - c.yaw[i]; q = Math.atan2(Math.sin(q), Math.cos(q)); c.yaw[i] += Math.sign(q) * Math.min(Math.abs(q), k); };
    const move = (vx, vz) => { c.x[i] += vx * dt; c.z[i] += vz * dt; c.ph[i] += Math.hypot(vx, vz) * dt * 2.2; };
    const sq = c.squads[c.squad[i]];
    switch (s) {
      case ST.FORM: {
        c.ph[i] *= 0.9;
        if (sq && d < 7) { c.st[i] = ST.ENGAGE; c.stT[i] = 0; }
        faceTo(sq ? sq.yaw : toHero, 0.05);
        break;
      }
      case ST.MARCH: {
        if (!sq) { c.st[i] = ST.ENGAGE; break; }
        const fx = Math.sin(sq.yaw), fz = Math.cos(sq.yaw), rx = -fz, rz = fx;
        const tx = sq.cx + rx * c.ox[i] + fx * c.oz[i], tz = sq.cz + rz * c.ox[i] + fz * c.oz[i];
        const ex = tx - c.x[i], ez = tz - c.z[i], ed = Math.hypot(ex, ez);
        const sp = Math.min(CROWD.run, ed * 3 + (sq.state === 'march' ? CROWD.march : 0));
        if (ed > 1.5) { const [ax, az] = travel(i, ex / ed * sp, ez / ed * sp); move(ax, az); } else if (ed > 0.05) move(ex / ed * sp, ez / ed * sp);
        faceTo(sq.yaw, 0.08);
        if (sq.state === 'hold') { c.st[i] = ST.FORM; }
        if (sq.state === 'engaged' || (sq.goal ? d < 4.4 && c.nearN < 30 : d < 5)) { c.st[i] = ST.ENGAGE; c.stT[i] = 0; }
        break;
      }
      case ST.ENGAGE: {
        const kind = c.kind[i];
        if (game.goal && (d > (kind === KIND.ARCHER ? 27 : 12) || (c.nearN > 38 && d > 5.5 && c.pref[i] > 0.5 && kind !== KIND.ARCHER) || (game.rush && (kind === KIND.ARCHER || kind === KIND.BEARER)))) {   // nobody to fight here (or no room at him): make for the bridge
          const gx = game.goal.x - c.x[i], gz = game.goal.z - c.z[i], gd = Math.hypot(gx, gz) || 1;
          if (gd < 1.6) { c.st[i] = ST.OFF; game.emit('cross', { n: 1 }); break; }
          const [ax, az] = travel(i, gx / gd * 3.4, gz / gd * 3.4); move(ax, az); faceTo(Math.atan2(ax, az)); break;
        }
        if (kind === KIND.ARCHER) {
          const want = 15 + c.pref[i] * 4;
          if (d > want + 2) move(dx / d * CROWD.walk, dz / d * CROWD.walk);
          else if (d < want - 4) move(-dx / d * CROWD.walk, -dz / d * CROWD.walk);
          faceTo(toHero);
          if (--c.cd[i] <= 0 && d < 30 && !h.dead) { c.st[i] = ST.AIM; c.stT[i] = 0; }
          break;
        }
        if (kind === KIND.BEARER) {
          const want = 8 + c.pref[i] * 3;
          if (d > want + 1) move(dx / d * CROWD.walk, dz / d * CROWD.walk); else if (d < want - 1) move(-dx / d * CROWD.walk, -dz / d * CROWD.walk);
          faceTo(toHero); break;
        }
        const want = 2.3 + c.pref[i] * 2.4;
        let vx = 0, vz = 0;
        if (d > want + 0.3) { const sp = d > 8 ? CROWD.run : CROWD.walk; [vx, vz] = avoid(i, dx / d * sp, dz / d * sp); }
        else if (d < want - 0.5) { vx = -dx / d * 1.2; vz = -dz / d * 1.2; }
        // slow strafe around the ring
        if (d < want + 2) { vx += -dz / d * c.strafe[i] * 0.45; vz += dx / d * c.strafe[i] * 0.45; if (c.stT[i] % 240 === 0) c.strafe[i] *= -1; }
        move(vx, vz); faceTo(toHero);
        c.cd[i]--;
        if (c.cd[i] <= 0 && d < 3.2 && c.tokensUsed < game.diff.tokens && !h.dead && h.state !== 'musou') {
          c.st[i] = ST.WIND; c.stT[i] = 0; c.tokensUsed++;
        }
        break;
      }
      case ST.WIND: {
        faceTo(toHero, 0.08);
        if (d > 1.6) move(dx / d * 1.2, dz / d * 1.2);
        if (c.stT[i] >= CROWD.windup) { c.st[i] = ST.STRIKE; c.stT[i] = 0; game.emit('gruntStrike', { i }); }
        break;
      }
      case ST.STRIKE: {
        if (c.stT[i] < 6) move(Math.sin(c.yaw[i]) * 3, Math.cos(c.yaw[i]) * 3);
        if (c.stT[i] === 4) {
          const reach = c.kind[i] === KIND.SWORD ? 2.0 : 2.5;
          const a = Math.atan2(Math.sin(toHero - c.yaw[i]), Math.cos(toHero - c.yaw[i]));
          if (d < reach && Math.abs(a) < 0.9 && h.y < 1.2) h.hurt(CROWD.dmg * (c.kind[i] === KIND.CAPTAIN ? 1.6 : 1), c.x[i], c.z[i], false, 'grunt', { i });
        }
        if (c.stT[i] >= CROWD.strike) { c.st[i] = ST.RECOVER; c.stT[i] = 0; }
        break;
      }
      case ST.RECOVER: if (c.stT[i] >= CROWD.recover) { c.st[i] = ST.ENGAGE; c.stT[i] = 0; c.cd[i] = (CROWD.cd[0] + rnd() * (CROWD.cd[1] - CROWD.cd[0])) | 0; } break;
      case ST.AIM: {
        faceTo(toHero, 0.1);
        if (c.stT[i] >= 60) {
          // lob at the hero's predicted spot
          const T = Math.max(0.6, d / 16), px = h.x + (h.spd || 0) * Math.sin(h.yaw) * T * 0.5, pz = h.z + (h.spd || 0) * Math.cos(h.yaw) * T * 0.5;
          const sx = c.x[i], sy = 1.5, sz = c.z[i];
          const vx = (px - sx) / T, vz = (pz - sz) / T, vy = (1.0 - sy + 0.5 * 9.8 * T * T) / T;
          c.arrows.push({ x: sx, y: sy, z: sz, vx: vx + rr(-0.6, 0.6), vy, vz: vz + rr(-0.6, 0.6), t: 0 });
          game.emit('arrow', { i });
          c.st[i] = ST.SHOOT; c.stT[i] = 0;
        }
        break;
      }
      case ST.SHOOT: if (c.stT[i] >= 20) { c.st[i] = ST.ENGAGE; c.stT[i] = 0; c.cd[i] = (260 + rnd() * 200) | 0; } break;
      case ST.HURT: {
        move(c.vx[i], c.vz[i]); c.vx[i] *= 0.85; c.vz[i] *= 0.85;
        if (c.stT[i] >= 22) { c.st[i] = ST.ENGAGE; c.stT[i] = 0; c.cd[i] = Math.max(c.cd[i], 30); }
        break;
      }
      case ST.KNOCK: {
        move(c.vx[i], c.vz[i]); c.vx[i] *= 0.9; c.vz[i] *= 0.9;
        if (c.stT[i] >= 16) { c.st[i] = ST.DOWN; c.stT[i] = 0; }
        break;
      }
      case ST.AIR: {
        c.vy[i] -= CROWD.g * dt * (c.vy[i] < 0 ? 0.8 : 1);
        c.x[i] += c.vx[i] * dt; c.z[i] += c.vz[i] * dt; c.y[i] += c.vy[i] * dt;
        c.spin[i] += c.spinV[i] * dt;
        const gy = groundY(c.x[i], c.z[i]);
        if (c.y[i] <= gy && c.vy[i] <= 0) {
          c.y[i] = gy;
          const hard = c.vy[i] < -6 && !c.kod[i];
          c.vy[i] = 0; c.vx[i] *= 0.4; c.vz[i] *= 0.4;
          game.emit('thud', { x: c.x[i], z: c.z[i], hard: -c.vy[i] });
          if (hard && rnd() < 0.3) { c.vy[i] = 2.5; c.stT[i] = 0; break; }   // bounce
          c.st[i] = c.kod[i] ? ST.DEAD : ST.DOWN; c.stT[i] = 0; c.spin[i] = 0;
          if (c.kod[i]) { c.yaw[i] += rr(-0.4, 0.4); }
        }
        break;
      }
      case ST.DOWN: {
        c.x[i] += c.vx[i] * dt; c.z[i] += c.vz[i] * dt; c.vx[i] *= 0.85; c.vz[i] *= 0.85;
        if (c.kod[i]) { c.st[i] = ST.DEAD; c.stT[i] = 0; break; }
        if (c.stT[i] >= 70) { c.st[i] = ST.GETUP; c.stT[i] = 0; }
        break;
      }
      case ST.GETUP: if (c.stT[i] >= 28) { c.st[i] = ST.ENGAGE; c.stT[i] = 0; c.cd[i] = Math.max(c.cd[i], 40); } break;
    }
  }

  // ------------------------------------------------ officer AI
  function officerStep(o, i, h, dt) {
    c.stT[i]++;
    if (c.flash[i] > 0) c.flash[i] = Math.max(0, c.flash[i] - 0.1);
    const s = c.st[i];
    if (s === ST.DEAD) { if (c.stT[i] > 200) { o.rig.root.visible = false; c.st[i] = ST.OFF; } return; }
    if (c.freeze && s !== ST.AIR) return;
    o.mt++;   // after the freeze check: the attack clock must not run while the world is held
    const dx = h.x - c.x[i], dz = h.z - c.z[i], d = Math.hypot(dx, dz) || 1, toHero = Math.atan2(dx, dz);
    const faceTo = (a, k = 0.12) => { let q = a - c.yaw[i]; q = Math.atan2(Math.sin(q), Math.cos(q)); c.yaw[i] += Math.sign(q) * Math.min(Math.abs(q), k); };
    o.poise = Math.max(0, o.poise - 0.25);
    const d0 = o.def;
    if (s === ST.AIR) {
      c.vy[i] -= CROWD.g * dt; c.x[i] += c.vx[i] * dt; c.z[i] += c.vz[i] * dt; c.y[i] += c.vy[i] * dt; c.spin[i] += c.spinV[i] * dt * 0.3;
      if (c.y[i] <= 0 && c.vy[i] <= 0) { c.y[i] = 0; c.vy[i] = 0; c.st[i] = c.kod[i] ? ST.DEAD : ST.DOWN; c.stT[i] = 0; c.spin[i] = 0; game.emit('thud', { x: c.x[i], z: c.z[i], hard: 8 }); }
      return;
    }
    if (s === ST.HURT) { c.x[i] += c.vx[i] * dt; c.z[i] += c.vz[i] * dt; c.vx[i] *= 0.85; c.vz[i] *= 0.85; if (c.stT[i] > 18) { c.st[i] = ST.ENGAGE; c.stT[i] = 0; o.think = 20; } return; }
    if (s === ST.KNOCK || s === ST.DOWN) { c.x[i] += c.vx[i] * dt; c.z[i] += c.vz[i] * dt; c.vx[i] *= 0.88; c.vz[i] *= 0.88; if (c.kod[i]) { c.st[i] = ST.DEAD; c.stT[i] = 0; return; } if (c.stT[i] > 60) { c.st[i] = ST.GETUP; c.stT[i] = 0; } return; }
    if (s === ST.GETUP) { if (c.stT[i] > 26) { c.st[i] = ST.ENGAGE; c.stT[i] = 0; o.think = 10; } return; }
    if (s === ST.ENGAGE) {
      o.atk = null;
      const want = 2.6;
      let vx = 0, vz = 0;
      if (d > want) { const sp = d > 7 ? d0.speed : d0.speed * 0.5; vx = dx / d * sp; vz = dz / d * sp; }
      else { vx = -dz / d * 1.2 * (o.k % 2 ? 1 : -1); vz = dx / d * 1.2 * (o.k % 2 ? 1 : -1); }
      c.x[i] += vx * dt; c.z[i] += vz * dt; o.spd = Math.hypot(vx, vz); o.ph += o.spd * dt * 1.55;
      faceTo(toHero);
      if (--o.think <= 0 && !h.dead && h.state !== 'musou') {
        let pick = null;
        const opts = d0.atk;
        if (d < 3.4) pick = rnd() < 0.6 ? 'combo' : opts[(rnd() * opts.length) | 0];
        else if (d < 9 && opts.includes('dash') && rnd() < 0.5) pick = 'dash';
        else if (d < 10 && opts.includes('leap') && rnd() < 0.35) pick = 'leap';
        if (pick) { o.atk = OATK[pick]; o.atkName = pick; o.seg = 0; o.mt = 0; c.st[i] = ST.WIND; c.stT[i] = 0; o.hitDone = false; game.emit('officerTell', { o, pick }); }
        o.think = pick ? 0 : 20;
      }
      return;
    }
    if (s === ST.WIND || s === ST.STRIKE) {
      const seg = o.atk[o.seg], m = MOVES[seg.clip];
      const t = o.mt - seg.tele;                                  // clip frame (negative = telegraph hold)
      if (t < 0) { faceTo(toHero, 0.1); c.st[i] = ST.WIND; if (seg.leap && t === -seg.tele + 1) o.leapTo = null; }
      else c.st[i] = ST.STRIKE;
      if (seg.hit.shape === 'circle' && t < 0) o.danger = { x: c.x[i], z: c.z[i], r: seg.hit.range, k: (o.mt / seg.tele) };
      else if (seg.hit.shape === 'line' && t < 0) o.danger = { x: c.x[i], z: c.z[i], line: true, yaw: c.yaw[i], len: 9, k: o.mt / seg.tele };
      else if (seg.hit.shape === 'arc' && t < 0 && o.seg === 0) o.danger = { x: c.x[i], z: c.z[i], r: seg.hit.range, k: o.mt / seg.tele };
      else if (seg.leap && t < 20) o.danger = { x: h.x, z: h.z, r: seg.hit.range, k: Math.max(0, (o.mt) / (seg.tele + 20)) };
      if (t >= 0) {
        if (m.lunge) for (const [a, b, dd, e] of m.lunge) if (t > a && t <= b) { const u0 = (t - 1 - a) / (b - a), u1 = (t - a) / (b - a); const f = e === 'lin' ? (x) => x : (x) => 1 - (1 - x) ** 2; const adv = (f(u1) - f(u0)) * dd * (seg.clip === 'c5' ? 1.1 : 1); c.x[i] += Math.sin(c.yaw[i]) * adv; c.z[i] += Math.cos(c.yaw[i]) * adv; }
        if (seg.leap) {
          if (t === 8 || (t > 8 && !o.leapTo)) { o.leapTo = { x: h.x, z: h.z }; c.vy[i] = 9; }
          if (t > 8 && t < 30) { const u = 0.08; c.x[i] += (o.leapTo.x - c.x[i]) * u; c.z[i] += (o.leapTo.z - c.z[i]) * u; o.danger = { x: o.leapTo.x, z: o.leapTo.z, r: seg.hit.range, k: t / 30 }; }
          c.vy[i] -= CROWD.g * dt; c.y[i] = Math.max(0, c.y[i] + c.vy[i] * dt); if (c.y[i] === 0) c.vy[i] = 0;
          if (t > 8 && t < 29 && c.y[i] <= 0.01 && t > 14) o.mt = seg.tele + 29;
        }
        const hf = seg.leap ? [30, 33] : m.hits[m.hits.length - 1].f;
        if (t >= hf[0] && t <= hf[1] && !o.hitDone) {
          if (heroInShape(seg.hit, c.x[i], c.z[i], c.yaw[i], h)) { o.hitDone = true; h.hurt(seg.hit.dmg * d0.dmg, c.x[i], c.z[i], !!seg.hit.heavy, o.def.key + ':' + o.atkName, { i }); }
          if (t === hf[0]) { game.emit('officerStrike', { o, heavy: seg.hit.heavy, x: c.x[i], z: c.z[i], shape: seg.hit.shape, r: seg.hit.range }); o.danger = null; }
        }
        const end = Math.min(m.dur, m.cancel + 8);
        if (t >= end) {
          o.seg++; o.mt = 0; o.hitDone = false;
          if (o.seg >= o.atk.length || d > 5.5 && o.atkName === 'combo') { o.atk = null; o.danger = null; c.st[i] = ST.ENGAGE; c.stT[i] = 0; o.think = (40 + rnd() * 50 / (o.k === 3 ? 2 : 1)) | 0; }
          else faceTo(toHero, 0.8);
        }
      }
    }
  }
  function heroInShape(hd, x, z, yaw, h) {
    const dx = h.x - x, dz = h.z - z, d = Math.hypot(dx, dz);
    if (h.y > 1.5) return false;
    if (hd.shape === 'circle') return d < hd.range + 0.4;
    if (hd.shape === 'arc') { if (d > hd.range + 0.4) return false; const a = Math.atan2(dx, dz) - yaw; return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < hd.ang * Math.PI / 360 + 0.3; }
    if (hd.shape === 'line') { const fx = Math.sin(yaw), fz = Math.cos(yaw), al = dx * fx + dz * fz, sd = Math.abs(dx * fz - dz * fx); return al > -0.5 && al < hd.len + 0.5 && sd < hd.width / 2 + 0.4; }
    return false;
  }

  // ================================================ view
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
  const mk = (geo, n) => { const im = new THREE.InstancedMesh(geo, mat, n); im.castShadow = true; im.receiveShadow = false; im.frustumCulled = false; im.count = 0;
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3); scene.add(im); return im; };
  const G = CROWD.maxGrunts;
  // three levels of detail: 3 cm voxels near the camera, 6 cm in the mid field, 12 cm far away
  const LOD_DIST = 10, LOD_FAR = 30;
  const VL = [0, 1, 2].map((lod) => { const parts = soldierParts(lod); const n = lod === 0 ? 64 : lod === 1 ? 260 : G;
    return { body: mk(parts.body, n), head: mk(parts.head, n), cap: mk(parts.cap, 40), arm: mk(parts.arm, n * 2), leg: mk(parts.leg, n * 2),
      spear: mk(parts.spear, n), sword: mk(parts.sword, n), shield: mk(parts.shield, n), bow: mk(parts.bow, n), pole: mk(parts.pole, 60) }; });
  for (const k in VL[2]) VL[2][k].castShadow = false;
  const CAP = (im) => im.instanceMatrix.count;
  const flagMat = flagMaterial(bannerTexture('魏'), game.world.windU);
  const flagGeo = new THREE.PlaneGeometry(1.1, 2.0, 8, 1); flagGeo.translate(0.55, 0, 0);
  const flags = new THREE.InstancedMesh(flagGeo, flagMat, 60); flags.count = 0; flags.frustumCulled = false; scene.add(flags);
  const arrowGeo = (() => { const v = new Vox();   // 3 cm voxels, flies along +Z, origin at the middle
    v.box(0, 0, -14, 0, 0, 12, 0xcaa878); v.box(0, 0, 13, 0, 0, 15, 0x4a4e58); v.set(-1, 0, 13, 0x4a4e58).set(1, 0, 13, 0x4a4e58);
    for (let z = -14; z <= -9; z++) v.set(-1, 0, z, 0xf4f0e6).set(1, 0, z, 0xf4f0e6).set(0, 1, z, 0xc42c1e).set(0, -1, z, 0xf4f0e6);
    return v.geometry({ s: 0.03, jit: 0.03 }); })();
  const arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x5a4020, emissiveIntensity: 0.5 }), 200); arrows.count = 0; arrows.frustumCulled = false; scene.add(arrows);

  const M = new THREE.Matrix4(), R = new THREE.Matrix4(), T = new THREE.Matrix4(), X = new THREE.Matrix4(), B = new THREE.Matrix4(), tmp = new THREE.Matrix4();
  const e = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), col = new THREE.Color();
  const HIP = 16 * VS;
  const push = (im, m, fl) => { if (im.count >= CAP(im)) return; im.setMatrixAt(im.count, m); if (fl !== undefined) { col.setScalar(fl); im.setColorAt(im.count, col); } im.count++; };
  const rot = (x, y, z) => { e.set(x, y, z, 'YXZ'); return R.makeRotationFromEuler(e); };

  c.render = (t) => {
    for (const V of VL) for (const k in V) V[k].count = 0; flags.count = 0; let hiN = 0, midN = 0; const cf = game.camFwd;
    for (let i = 0; i < CROWD.maxGrunts; i++) {
      const s = c.st[i]; if (s === ST.OFF) continue;
      if (s === ST.DEAD && c.stT[i] > 240) continue;
      const kind = c.kind[i];
      const cp = game.camPos;
      if (cp) { const dx = c.x[i] - cp.x, dz = c.z[i] - cp.z, hx = game.hero.x - cp.x, hz = game.hero.z - cp.z, hd = Math.hypot(hx, hz) || 1;
        const along = (dx * hx + dz * hz) / hd, side = Math.abs(dx * hz - dz * hx) / hd;
        if (Math.hypot(dx, dz) < 1.6 || (along > 0 && along < hd - 1.0 && side < 0.9 && c.y[i] < 2)) continue; }
      let V = VL[2];
      if (cp) {
        const dxc = c.x[i] - cp.x, dzc = c.z[i] - cp.z, dc = Math.hypot(dxc, dzc);
        if (cf && dxc * cf.x + dzc * cf.z < -3) continue;                                  // behind the camera
        const lying = s === ST.DEAD || s === ST.DOWN;
        const Q = game.q;
        if (dc < (Q ? Q.lod : LOD_DIST) && !lying && hiN < (Q ? Q.hi : 40)) { V = VL[0]; hiN++; }
        else if (dc < (Q ? Q.far : LOD_FAR) && midN < (Q ? Q.mid : 240)) { V = VL[1]; midN++; }
      }
      // pose params
      let lean = 0, pitch = 0, roll = 0, rootY = 0, aR = 0.15, aL = 0.05, lL = 0, lR = 0, wp = -1.35, head = 0, sink = 0, aRz = 0, aLz = 0;
      const walk = c.ph[i], sw = Math.sin(walk);
      const moving = s === ST.MARCH || s === ST.ENGAGE || s === ST.FORM;
      if (moving) { lL = sw * 0.6; lR = -sw * 0.6; aL = -sw * 0.35; rootY = Math.abs(Math.cos(walk)) * 0.04; }
      if (s === ST.ENGAGE || s === ST.RECOVER || s === ST.HURT) { aR = 0.95; wp = 0.95 - 0.1; if (kind === KIND.SWORD) { aR = 0.7; wp = -0.5; aL = 0.8; } }
      if (s === ST.MARCH || s === ST.FORM) { aR = 0.15; wp = -1.4; if (kind === KIND.SWORD) { aR = 0.2; wp = 0.4; aL = 0.6; } }
      if (s === ST.WIND) {
        const u = Math.min(1, c.stT[i] / 14);
        if (kind === KIND.SWORD) { aR = 0.7 + u * 2.2; wp = -0.5 - u * 0.4; lean = -0.15 * u; }
        else { aR = 0.95 - u * 1.2; wp = 0.85 - u * 1.25; lean = -0.1 * u; lL = 0.35 * u; lR = -0.3 * u; }
      }
      if (s === ST.STRIKE) {
        const u = Math.min(1, c.stT[i] / 4);
        if (kind === KIND.SWORD) { aR = 2.9 - u * 2.3; wp = -0.9 + u * 1.2; lean = 0.3 * u; }
        else { aR = -0.25 + u * 1.75; wp = -0.4 + u * 1.9; lean = 0.3 * u; }
        lL = 0.5; lR = -0.4;
      }
      if (s === ST.HURT) { const u = Math.max(0, 1 - c.stT[i] / 22); lean = -0.45 * u; aL = 0.9 * u; head = 0.4 * u; aR = 0.2; wp = 0; }
      if (s === ST.AIM || s === ST.SHOOT) { aR = 1.45; aL = 1.55; aLz = 0.2; aRz = -0.2; wp = 0; }
      if (kind === KIND.ARCHER && moving) { aL = 0.25 - sw * 0.2; aR = 0.1; }
      if (s === ST.AIR) { pitch = c.spin[i]; aR = 2.2; aL = 2.4; lL = 0.6; lR = -0.2; wp = 0; }
      if (s === ST.KNOCK) { const u = Math.min(1, c.stT[i] / 12); pitch = -1.5 * u; rootY = 0.1 * u; aR = 2.4; aL = 2.4; }
      if (s === ST.DOWN || s === ST.DEAD) { pitch = -Math.PI / 2; rootY = 0.12; aR = 2.8; aL = 2.6; lL = 0.2; lR = -0.1; wp = 0.4; head = -0.2; }
      if (s === ST.DEAD) sink = Math.max(0, (c.stT[i] - 150) / 90) * 0.6;
      if (s === ST.GETUP) { const u = Math.min(1, c.stT[i] / 26); pitch = -Math.PI / 2 * (1 - u); rootY = 0.12 * (1 - u); lL = 1.2 * Math.sin(u * Math.PI); }
      if (kind === KIND.BEARER) { aR = 0.4; aL = 0.4; wp = 0; }
      const fl = 1 + c.flash[i] * 3.5 + (s === ST.WIND && kind !== KIND.ARCHER ? (Math.sin(c.stT[i] * 0.9) * 0.5 + 0.5) * 0.9 : 0);
      // root
      p.set(c.x[i], c.y[i] + rootY - sink, c.z[i]);
      e.set(pitch, c.yaw[i], roll, 'YXZ'); q.setFromEuler(e); M.compose(p, q, one);
      // legs
      for (const [sx, a] of [[2, lL], [-2, lR]]) { T.makeTranslation(sx * VS, HIP, 0); tmp.multiplyMatrices(M, T).multiply(rot(-a, 0, 0)); push(V.leg, tmp, fl); }
      // body
      T.makeTranslation(0, HIP, 0); B.multiplyMatrices(M, T).multiply(rot(lean, 0, 0)); push(V.body, B, fl);
      T.makeTranslation(0, 12 * VS, 0); tmp.multiplyMatrices(B, T).multiply(rot(head - lean * 0.5, 0, 0));
      if (kind === KIND.CAPTAIN) push(V.cap, tmp, fl); else push(V.head, tmp, fl);
      // arms: left
      T.makeTranslation(5 * VS, 10.5 * VS, 0); X.multiplyMatrices(B, T).multiply(rot(-aL, 0, aLz)); push(V.arm, X, fl);
      if (kind === KIND.SWORD) { T.makeTranslation(1.5 * VS, -8 * VS, 0.1); tmp.multiplyMatrices(X, T).multiply(rot(aL - 0.2, 0, 0)); push(V.shield, tmp, fl); }
      if (kind === KIND.ARCHER) { T.makeTranslation(0, -10.5 * VS, 0); tmp.multiplyMatrices(X, T).multiply(rot(aL - 1.57, 0, 0.2)); push(V.bow, tmp, 1); }
      // right
      T.makeTranslation(-5 * VS, 10.5 * VS, 0); X.multiplyMatrices(B, T).multiply(rot(-aR, 0, aRz)); push(V.arm, X, fl);
      T.makeTranslation(0, -10.5 * VS, 0);
      if (kind === KIND.SPEAR || kind === KIND.CAPTAIN) { tmp.multiplyMatrices(X, T).multiply(rot(wp, 0, 0)); push(V.spear, tmp, 1); }
      else if (kind === KIND.SWORD) { tmp.multiplyMatrices(X, T).multiply(rot(wp, 0, 0)); push(V.sword, tmp, 1); }
      else if (kind === KIND.BEARER && s !== ST.AIR && s !== ST.DOWN && s !== ST.DEAD && s !== ST.KNOCK && s !== ST.GETUP) {
        e.set(0, c.yaw[i], 0); q.setFromEuler(e);
        p.set(c.x[i] - Math.cos(c.yaw[i]) * 0.36, c.y[i] + 0.55, c.z[i] + Math.sin(c.yaw[i]) * 0.36);
        tmp.compose(p, q, one); push(V.pole, tmp, 1);
        e.set(0, c.yaw[i] + Math.PI / 2, 0); q.setFromEuler(e); p.y += 2.4 + 0.5;
        tmp.compose(p, q, one); flags.setMatrixAt(flags.count++, tmp);
      }
    }
    for (const V of VL) for (const k in V) { V[k].instanceMatrix.needsUpdate = true; if (V[k].instanceColor) V[k].instanceColor.needsUpdate = true; }
    flags.instanceMatrix.needsUpdate = true;
    // arrows
    arrows.count = 0;
    for (const a of c.arrows) { if (arrows.count >= 200) break; p.set(a.x, a.y, a.z); tmp.lookAt(p.clone().add(new THREE.Vector3(a.vx, a.stuck ? -8 : a.vy, a.vz)), p, THREE.Object3D.DEFAULT_UP); q.setFromRotationMatrix(tmp); M.compose(p, q, one); arrows.setMatrixAt(arrows.count++, M); }
    arrows.instanceMatrix.needsUpdate = true;
    // officers
    for (const o of c.officers) if (o.rig.root.visible) officerView(o);
  };

  function officerView(o) {
    const i = o.idx, s = c.st[i], tgt = o.tgt;
    let k = 0.3;
    if ((s === ST.WIND || s === ST.STRIKE) && o.atk) {
      const seg = o.atk[o.seg]; const m = MOVES[seg.clip]; const t = o.mt - seg.tele;
      sampleClip(m.keys, t < 0 ? (m.keys[1][0]) * Math.min(1, o.mt / 10) : t, tgt); k = 0.6;
    } else if (s === ST.ENGAGE && o.spd > 0.5) { runPose(o.ph, o.spd, tgt, 'hold'); }
    else if (s === ST.HURT) { Object.assign(tgt, clonePose(BASE), { tx: -0.45, hx: 0.4, rootY: -0.1 }); k = 0.5; }
    else if (s === ST.DOWN || s === ST.DEAD || s === ST.KNOCK) { Object.assign(tgt, clonePose(BASE), { pitch: -1.45, rootY: 0.25, thL: 0.3, shL: -0.4, w: [-0.35, 0.0, 0.1, 0, 0.3, 0], ikL: 0, aL: [-0.3, 0, 1.2] }); k = 0.25; }
    else if (s === ST.AIR) { Object.assign(tgt, clonePose(BASE), { pitch: -0.8 + c.spin[i] * 0.2, tx: -0.4, thL: 0.6, shL: -0.8, ikL: 0, aL: [-1.5, 0, 0.8] }); k = 0.3; }
    else if (s === ST.GETUP) { Object.assign(tgt, clonePose(BASE), { rootY: -0.35, tx: 0.5, thL: 1.0, shL: -1.6, thR: -0.2, shR: -1.4 }); k = 0.3; }
    else idlePose(game.frame / 60 + o.k, tgt);
    if (o.rig.dual) { tgt.gL = 0.05; }
    approach(o.cur, tgt, k);
    const r = o.rig;
    r.root.position.set(c.x[i], c.y[i], c.z[i]); r.root.rotation.y = c.yaw[i];
    applyPose(r, o.cur);
    if (r.dual) { const qR = r.j.upperR.quaternion, qF = r.j.foreR.quaternion; r.j.upperL.quaternion.set(qR.x, -qR.y, -qR.z, qR.w); r.j.foreL.quaternion.set(qF.x, -qF.y, -qF.z, qF.w);
      if (r.j.wep2) { r.j.wep2.position.set(-r.j.wep.position.x, r.j.wep.position.y, r.j.wep.position.z); const wq = r.j.wep.quaternion; r.j.wep2.quaternion.set(wq.x, -wq.y, -wq.z, wq.w); } }
    const glow = (s === ST.WIND ? 0.5 + 0.5 * Math.sin(o.mt * 0.6) : 0) * 0.45 + c.flash[i] * 0.35;
    r.mat.emissive.setRGB(glow * 1.0, glow * 0.25, glow * 0.1);
  }
  return c;
}
