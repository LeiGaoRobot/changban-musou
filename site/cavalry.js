// 虎豹騎: a line of lancers telegraphs a lane, then charges straight across the field.
// They knock Zhao Yun down unless he clears the lane; a launching blow (or enough damage) unseats a rider.
import { buildHorse, poseHorse } from './horse.js';
import { shapeHit } from './crowd.js';
import { ARENA, groundY } from './world.js';

export const CAV = { tele: 95, speed: 21, dmg: 26, hp: 60, lane: 130, gap: 2.4 };

export function createCavalry(game, scene) {
  const cav = { riders: [], lanes: [], tele: 0, waves: 0, unseated: 0 };
  for (let i = 0; i < 6; i++) {
    const rig = buildHorse({ pal: 'black', rider: true }); rig.root.visible = false; scene.add(rig.root);
    cav.riders.push({ rig, on: false, rider: false, x: 0, z: 0, yaw: 0, spd: 0, ph: i * 1.3, hp: 0, lastKey: 0, t: 0 });
  }
  cav.reset = () => { for (const r of cav.riders) { r.on = false; r.rig.root.visible = false; } cav.lanes.length = 0; cav.tele = 0; cav.waves = 0; cav.unseated = 0; };
  cav.busy = () => cav.riders.some((r) => r.on);

  // n riders abreast, coming from the side of the field the hero is farther from
  cav.launch = (n = 5) => {
    if (cav.busy()) return false;
    const h = game.hero, sign = h.x > 0 ? -1 : 1;
    const sx = sign * (ARENA.x1 + 12), sz = Math.max(ARENA.z0 + 8, Math.min(ARENA.z1 - 10, h.z + (Math.random() - 0.5) * 30));
    const yaw = Math.atan2(h.x - sx, h.z - sz), px = Math.cos(yaw), pz = -Math.sin(yaw);
    cav.lanes.length = 0;
    for (let i = 0; i < n; i++) {
      const r = cav.riders[i], off = (i - (n - 1) / 2) * CAV.gap;
      Object.assign(r, { on: true, rider: true, x: sx + px * off, z: sz + pz * off, yaw, spd: 0, hp: CAV.hp * game.diff.hp, lastKey: 0, t: 0 });
      r.rig.root.visible = true; r.rig.rider.visible = true;
      cav.lanes.push({ x: r.x, z: r.z, yaw, len: CAV.lane });
    }
    cav.tele = CAV.tele; cav.waves++;
    game.emit('cavalry', { n, x: sx, z: sz, yaw });
    return true;
  };

  cav.step = () => {
    const h = game.hero, dt = 1 / 60;
    if (cav.tele > 0) cav.tele--;
    for (const r of cav.riders) {
      if (!r.on) continue;
      r.t++;
      if (cav.tele > 0) continue;
      r.spd += (CAV.speed - r.spd) * 0.09;
      const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw);
      r.x += fx * r.spd * dt; r.z += fz * r.spd * dt; r.ph += r.spd * dt * 0.8;
      if (r.rider && Math.hypot(h.x - r.x, h.z - r.z) < 1.3 && h.y - groundY(h.x, h.z) < 1.3) h.hurt(CAV.dmg, r.x - fx * 2, r.z - fz * 2, true, 'cavalry');
      if (r.t > CAV.tele + 90 && (Math.abs(r.x) > ARENA.x1 + 14 || r.z > ARENA.z1 + 4 || r.z < ARENA.z0 - 10)) { r.on = false; r.rig.root.visible = false; }
    }
    if (!cav.busy()) cav.lanes.length = 0;
  };

  // the hero's blow against the riders; returns how many it touched
  cav.heroHit = (h, hd, key, mul) => {
    let n = 0;
    for (const r of cav.riders) {
      if (!r.on || !r.rider || r.lastKey === key) continue;
      if (!shapeHit(hd, h.x, h.z, h.yaw, r.x, r.z, 0.95)) continue;
      r.lastKey = key; n++;
      r.hp -= hd.dmg * mul;
      const dx = r.x - h.x, dz = r.z - h.z, d = Math.hypot(dx, dz) || 1;
      game.emit('hit', { i: -1, x: r.x, y: 1.9, z: r.z, dmg: hd.dmg * mul, off: false, kb: hd.kb, ux: dx / d, uz: dz / d });
      if (r.hp <= 0 || hd.kb === 'launch' || hd.kb === 'blow') {
        r.rider = false; r.rig.rider.visible = false; cav.unseated++; game.crowd.ko++;
        game.emit('cavKo', { x: r.x, z: r.z, ux: dx / d, uz: dz / d });
      }
    }
    return n;
  };

  cav.render = (t) => {
    for (const r of cav.riders) {
      if (!r.on) continue;
      const rear = cav.tele > 0 ? Math.max(0, Math.sin((CAV.tele - cav.tele) * 0.07 + r.ph)) * 0.8 : 0;
      r.rig.root.position.set(r.x, groundY(r.x, r.z), r.z); r.rig.root.rotation.y = r.yaw;
      poseHorse(r.rig, r.ph, Math.min(1, r.spd / 13), t, rear);
    }
  };
  return cav;
}
