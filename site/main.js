// Boot, fixed 60 Hz loop, input, camera, battle director, pickups, HUD, menus, test hooks.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld, BRIDGE, GATE, ARENA, RIVER, WELL, CLUE, bridgeDeck, radialTexture } from './world.js';
import { createHero, createHeroView, HERO, CHARS } from './hero.js';
import { createCrowd, OFFICERS, ST, KIND, CROWD, shapeHit } from './crowd.js';
import { createCavalry } from './cavalry.js';
import { itemGeos } from './horse.js';
import { createMusou, createMusouView, MU, ROAR } from './musou.js';
import { createVfx } from './vfx.js';
import { createAudio } from './audio.js';
import { buildWarrior, PAL, Vox } from './voxel.js';
import { applyPose, idlePose, P, approach, clonePose } from './anim.js';
import { TIERS, createGovernor } from './quality.js';
import { UPGRADES, ACHS, createProgress } from './progress.js';

const $ = (id) => document.getElementById(id);
const LS = { get(k, d) { try { const v = localStorage.getItem('vm.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('vm.' + k, JSON.stringify(v)); } catch {} } };

// ---------------------------------------------------------------- renderer / post
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
// quality: 'auto' lets the governor walk the tiers from measured frame times; the rest pin one tier
const coarse = matchMedia('(pointer: coarse)').matches;
let qMode = LS.get('q', null); if (!['auto', 'high', 'mid', 'low', 'min'].includes(qMode)) qMode = LS.get('lowq', false) === true ? 'low' : 'auto';
const gov = createGovernor(coarse ? 1 : TIERS.length - 1);
const qTier = () => qMode === 'auto' ? gov.tier : TIERS.findIndex((t) => t.key === qMode);
renderer.setPixelRatio(Math.min(devicePixelRatio, TIERS[qTier()].pr));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 900);
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.55, 0.82);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, flash: { value: 0 }, flashCol: { value: new THREE.Color(1, 1, 1) }, musou: { value: 0 }, time: { value: 0 }, hurt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float flash, musou, time, hurt; uniform vec3 flashCol; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= vec3(1.05, 1.0, 0.92);
      float g = dot(c.rgb, vec3(0.3,0.59,0.11)); c.rgb = mix(c.rgb, vec3(g) * vec3(1.3,1.05,0.68), musou * 0.55);
      vec2 d = vUv - 0.5; float v = dot(d, d); c.rgb *= 1.0 - v * (0.95 + musou * 0.8);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.4, 0.5, 0.45), hurt * smoothstep(0.08, 0.3, v));
      c.rgb = mix(c.rgb, flashCol * 1.4, flash * 0.55);
      c.rgb += (hash(vUv * 900.0 + time) - 0.5) * 0.02;
      gl_FragColor = c; }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());
function applyQuality() {
  const q = TIERS[qTier()], sun = game.world.sun; game.q = q;
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.pr));
  bloom.enabled = q.bloom;
  sun.castShadow = q.shadow > 0;
  if (q.shadow && sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.set(q.shadow, q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  onResize();
  for (const id of ['qbtn', 'qbtn2']) $(id).textContent = `畫質 ${qMode === 'auto' ? '自動 · ' + q.zh : q.zh}`;
}
const Q_ORDER = ['auto', 'high', 'mid', 'low', 'min'];
function cycleQuality() { qMode = Q_ORDER[(Q_ORDER.indexOf(qMode) + 1) % Q_ORDER.length]; LS.set('q', qMode); applyQuality(); }

// ---------------------------------------------------------------- game object + event bus
const game = { frame: 0, hitstop: 0, listeners: {}, reinforceOK: true };
game.on = (n, f) => { (game.listeners[n] ||= []).push(f); };
game.emit = (n, e) => { const l = game.listeners[n]; if (l) for (const f of l) { try { f(e); } catch (err) { console.error(n, err); } } };
// difficulty: damage taken, enemy health, how many grunts may strike at once, cavalry frequency
const DIFFS = {
  easy: { zh: '易', en: 'EASY', dmg: 0.6, hp: 0.8, tokens: 1, cav: 0.6, heal: 1.3 },
  normal: { zh: '普', en: 'NORMAL', dmg: 1, hp: 1, tokens: 2, cav: 1, heal: 1 },
  hard: { zh: '難', en: 'HARD', dmg: 1.5, hp: 1.3, tokens: 3, cav: 1.4, heal: 0.8 },
  chaos: { zh: '修羅', en: 'CHAOS', dmg: 2.2, hp: 1.6, tokens: 4, cav: 2, heal: 0.6 },
};
let diffKey = LS.get('diff', 'normal'); if (!DIFFS[diffKey]) diffKey = 'normal';
game.diff = { ...DIFFS[diffKey] }; game.slow = 0;
const meta = createProgress(LS); game.bonus = meta.bonus();   // 武勳, permanent upgrades, achievements   // a copy: 千人斬 scales it as the ranks climb
let charKey = LS.get('char', 'zhao'); if (!CHARS[charKey]) charKey = 'zhao';
game.char = CHARS[charKey]; game.stage = game.char.stage; game.goal = null;
game.world = createWorld(scene);
game.hero = createHero(game);
game.crowd = createCrowd(game, scene);
game.musou = createMusou(game);
game.cav = createCavalry(game, scene);
// blows also land on cavalry and smash crates
game.extraHit = (h, hd, key, mul) => {
  const W = game.world;
  W.crates.forEach((k, i) => { if (k.alive && shapeHit(hd, h.x, h.z, h.yaw, k.x, k.z, 0.5)) { W.breakCrate(i); game.emit('crate', { x: k.x, z: k.z }); crateDrop(k.x, k.z); } });
  return game.cav.heroHit(h, hd, key, mul);
};
game.hero.musouPose = (out) => game.musou.pose(game.hero, out);
const heroView = createHeroView(scene, game.hero);
const musouView = createMusouView(scene, game);
const vfx = createVfx(scene, game, camera);
const audio = createAudio(game);
audio.setVol(LS.get('vol', 0.8)); audio.setMusic(LS.get('mus', 0.55));

// 張飛 on the far bank + objective beacon
const feiRig = buildWarrior(PAL.zhangfei, { beard: true, weapon: 'serpent', scale: 1.18, mirror: true });
scene.add(feiRig.root);
feiRig.root.position.set(BRIDGE.x + 2.7, 0, RIVER.z0 - 2.2); feiRig.root.rotation.y = 0;
const FEI = {
  stand: P({ ty: 0.2, w: [-0.22, 0.2, 0.15, -1.25, -0.2, 0], gL: 0.35, thL: 0.3, shL: -0.2, thR: -0.25, lzL: 0.2, lzR: -0.2 }),
  raise: P({ ty: 0.1, tx: -0.3, hx: 0.35, w: [-0.1, 0.62, 0.05, -1.5, 0.1, 0], gL: 0.3, thL: 0.45, shL: -0.3, thR: -0.45, lzL: 0.3, lzR: -0.3 }),
  roar: P({ ty: -0.3, tx: 0.3, hx: -0.25, rootY: -0.2, w: [-0.25, 0.15, 0.4, 0.1, -0.9, 0], gL: 0.4, thL: 0.75, shL: -0.6, thR: -0.6, shR: -0.3, lzL: 0.35, lzR: -0.35 }),
};
const feiPose = clonePose(FEI.stand);
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x7ac8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
beacon.position.set(BRIDGE.x, 30, BRIDGE.z); scene.add(beacon);

// 尋主: 糜夫人 by the dry well with A Dou, 簡雍 wounded beside the cart
const miRig = buildWarrior(PAL.mi, { topknot: true, weapon: 'none', adou: true, skirt: true, scale: 0.93 });
const jianRig = buildWarrior(PAL.jian, { beard: true, topknot: true, weapon: 'none' });
scene.add(miRig.root, jianRig.root);
miRig.root.position.set(WELL.x + 1.75, 0, WELL.z + 1.0); miRig.root.rotation.y = 0.9;
jianRig.root.position.set(CLUE.x, 0, CLUE.z); jianRig.root.rotation.y = -1.9;
applyPose(miRig, P({ rootY: -0.02, ty: 0, tx: 0.12, hx: 0.3, hy: 0.2, thL: 0.04, shL: -0.04, thR: -0.04, shR: -0.04, lzL: 0.05, lzR: -0.05, w: [0, 0.2, 0.3, 0, -1.57, 0], gR: -0.13, gL: 0.13 }));
applyPose(jianRig, P({ rootY: -0.8, ty: 0, tx: -0.3, hx: 0.35, hy: 0.4, thL: 1.5, shL: -0.25, thR: 1.25, shR: -1.1, lzL: 0.14, lzR: -0.14, w: [0.05, 0.05, 0.28, 0, -1.57, 0], gR: -0.2, gL: 0.16 }));
miRig.root.visible = jianRig.root.visible = false;

// pickups
const itemGeo = {};
{
  const bun = new Vox(); for (let x = -3; x <= 3; x++) for (let y = 0; y <= 3; y++) for (let z = -3; z <= 3; z++) if (x * x + z * z + (y * 1.6) ** 2 < 13) bun.set(x, y, z, y > 2 ? 0xfff4e0 : 0xf2e2c4);
  bun.set(0, 4, 0, 0xd8b890); itemGeo.bun = bun.geometry({ s: 0.07, o: [0, 0, 0] });
  const jar = new Vox(); for (let y = 0; y <= 7; y++) { const r = y < 5 ? 3 - (y === 0 ? 1 : 0) : 1; jar.box(-r, y, -r, r - 1, y, r - 1, y === 6 ? 0xb8281e : 0x6a4a2a); } jar.box(-1, 8, -1, 0, 8, 0, 0xd8b04a);
  itemGeo.wine = jar.geometry({ s: 0.07, o: [0, 0, 0] });
}
Object.assign(itemGeo, itemGeos());
const itemMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x332200, roughness: 0.6 });
const items = [];
function dropItem(type, x, z) {
  const m = new THREE.Mesh(itemGeo[type === 'bigbun' ? 'bun' : type], itemMat); m.castShadow = true;
  if (type === 'bigbun') m.scale.setScalar(1.8);
  scene.add(m); items.push({ type, x, z, m, t: 0 });
}
const BUFFS = { axe: { zh: '攻', tip: '攻擊力 2 倍', col: '#ff8a5a', rgb: [1, 0.5, 0.3] }, armor: { zh: '防', tip: '防禦力 2 倍', col: '#ffd060', rgb: [1, 0.8, 0.3] }, boots: { zh: '速', tip: '移動速度上升', col: '#7ac8ff', rgb: [0.5, 0.8, 1] } };
function crateDrop(x, z) { const r = Math.random(); dropItem(r < 0.34 ? 'bun' : r < 0.5 ? 'wine' : r < 0.67 ? 'axe' : r < 0.84 ? 'armor' : 'boots', x, z); }

// ---------------------------------------------------------------- input
const keys = new Set(), pressed = new Set();
const KEYMAP = { attack: ['KeyJ'], charge: ['KeyK'], jump: ['Space'], dodge: ['KeyL', 'ShiftLeft', 'ShiftRight'], musou: ['KeyI'], mount: ['KeyF'], lock: ['KeyR'] };
const heldT = new Set();   // touch buttons that are held (guard)
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  audio.resume();
  if (e.code === 'Escape') { if (modalKind) closeModal(); else togglePause(); return; }
  if (modalKind) return;
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && ui.mode !== 'play') { if (ui.mode === 'title' || ui.mode === 'result') startGame(); else if (ui.mode === 'pause') togglePause(); return; }
  if (e.code === 'KeyH') { $('help').style.opacity = $('help').style.opacity === '0' ? '1' : '0'; }
  keys.add(e.code); pressed.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); if (ui.mode === 'play') togglePause(); });
let drag = null, camDX = 0;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  audio.resume(); if (ui.mode !== 'play') return;
  if (e.button === 0) pressed.add('Mouse0'); if (e.button === 2) pressed.add('Mouse2');
  drag = { x: e.clientX, moved: false }; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x; drag.x = e.clientX; camDX += dx; });
canvas.addEventListener('pointerup', () => { drag = null; });
let padPrev = [];
// ---- touch: left joystick, right buttons, drag elsewhere to turn the camera
const touch = { id: null, ox: 0, oy: 0, x: 0, y: 0, cam: null };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const padScale = () => document.documentElement.style.setProperty('--ts', Math.max(0.68, Math.min(1.25, (innerHeight - 172) / 194)).toFixed(3));
if (isTouch) {
  padScale(); addEventListener('resize', padScale);
  const tc = $('touch'); tc.classList.remove('hidden');
  const knob = $('knob'), base = $('stickBase');
  tc.addEventListener('touchstart', (e) => {
    audio.resume();
    for (const t of e.changedTouches) {
      const b = t.target.closest && t.target.closest('[data-k]');
      if (b) { const k = b.dataset.k; if (k === 'pause') togglePause(); else if (k === 'guard') { heldT.add(k); b.dataset.tid = t.identifier; } else pressed.add('T_' + k); b.classList.add('on'); continue; }
      if (t.clientX < innerWidth * 0.45 && touch.id === null) { touch.id = t.identifier; touch.ox = touch.x = t.clientX; touch.oy = touch.y = t.clientY; base.style.cssText = `left:${t.clientX}px;top:${t.clientY}px;opacity:1`; }
      else if (!touch.cam) touch.cam = { id: t.identifier, x: t.clientX };
    }
    e.preventDefault();
  }, { passive: false });
  tc.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.id) { touch.x = t.clientX; touch.y = t.clientY; const dx = touch.x - touch.ox, dy = touch.y - touch.oy, l = Math.min(1, Math.hypot(dx, dy) / 50) / (Math.hypot(dx, dy) || 1); knob.style.transform = `translate(${dx * l * 50}px, ${dy * l * 50}px)`; }
      if (touch.cam && t.identifier === touch.cam.id) { camDX += (t.clientX - touch.cam.x) * 1.2; touch.cam.x = t.clientX; }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) { const gb = tc.querySelector('[data-k=guard]'); if (gb && gb.dataset.tid === String(t.identifier)) { heldT.delete('guard'); gb.dataset.tid = ''; } if (t.identifier === touch.id) { touch.id = null; knob.style.transform = ''; base.style.opacity = '0.35'; } if (touch.cam && t.identifier === touch.cam.id) touch.cam = null; } tc.querySelectorAll('.on').forEach((b) => b.classList.remove('on')); };
  tc.addEventListener('touchend', end); tc.addEventListener('touchcancel', end);
}
const input = {
  sample(consume = true) {
    let fx = 0, sx = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fx += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) fx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) sx += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) sx -= 1;
    let camX = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
    const pr = (a) => KEYMAP[a].some((k) => pressed.has(k));
    const o = { attack: pr('attack') || pressed.has('Mouse0'), charge: pr('charge') || pressed.has('Mouse2'), jump: pr('jump'), dodge: pr('dodge'), musou: pr('musou'), mount: pr('mount'), lock: pr('lock') };
    let guard = keys.has('KeyU') || heldT.has('guard');
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (gp) {
      const ax = (i) => Math.abs(gp.axes[i] || 0) > 0.18 ? gp.axes[i] : 0;
      sx += ax(0); fx -= ax(1); camX += ax(2) * 1.2;
      const b = (i) => gp.buttons[i] && gp.buttons[i].pressed, was = (i) => padPrev[i];
      const edge = (i) => b(i) && !was(i);
      if (edge(2)) o.attack = true; if (edge(3)) o.charge = true; if (edge(0)) o.jump = true; if (edge(1)) o.musou = true; if (edge(5) || edge(7)) o.dodge = true; if (edge(4)) o.mount = true; if (edge(11) || edge(10)) o.lock = true; if (b(6)) guard = true;
      if (edge(9)) togglePause();
      padPrev = gp.buttons.map((x) => x.pressed);
    }
    if (touch.id !== null) { const dx = touch.x - touch.ox, dy = touch.y - touch.oy, l = Math.hypot(dx, dy); if (l > 8) { const k = Math.min(1, l / 50) / l; sx += dx * k; fx -= dy * k; } }
    for (const a of ['attack', 'charge', 'jump', 'dodge', 'musou', 'mount', 'lock']) if (pressed.has('T_' + a)) o[a] = true;
    const mag = Math.min(1, Math.hypot(fx, sx));
    const cy = cam.yaw, cfx = Math.sin(cy), cfz = Math.cos(cy);
    let mx = cfx * fx + -cfz * sx, mz = cfz * fx + cfx * sx;
    const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
    if (consume) pressed.clear();
    const dx = camDX; camDX = 0;
    return { mx, mz, mag, camX, dragX: dx, guard, ...(consume ? o : {}) };
  },
};

// ---------------------------------------------------------------- camera
const cam = { crowdK: 0, yaw: 0, pitch: 0.3, dist: 6.6, pos: new THREE.Vector3(0, 4, -20), look: new THREE.Vector3(), manualT: 0, fov: 52 };
const _t = new THREE.Vector3(), _p = new THREE.Vector3();
// lock-on: R picks the nearest officer; the camera keeps him in frame and neutral attacks face him
const lock = { o: null };
game.lockPos = () => { const o = lock.o; return o ? { x: game.crowd.x[o.idx], z: game.crowd.z[o.idx] } : null; };
function toggleLock() {
  if (lock.o) { lock.o = null; return; }
  const c = game.crowd, h = game.hero; let best = null, bd = 38;
  for (const o of c.officers) if (o.active && !o.dead) { const d = Math.hypot(c.x[o.idx] - h.x, c.z[o.idx] - h.z); if (d < bd) { bd = d; best = o; } }
  lock.o = best; if (best) game.emit('lockOn');
}
function camStep(inp) {
  if (inp.lock) toggleLock();
  if (lock.o) {
    const o = lock.o, c = game.crowd, hh = game.hero;
    if (!o.active || o.dead || Math.hypot(c.x[o.idx] - hh.x, c.z[o.idx] - hh.z) > 46) lock.o = null;
    else { let d = Math.atan2(c.x[o.idx] - hh.x, c.z[o.idx] - hh.z) - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); cam.yaw += d * 0.07; cam.manualT = 30; }
  }
  cam.yaw -= inp.camX * 2.4 / 60 + inp.dragX * 0.006;
  if (Math.abs(inp.camX) > 0.05 || inp.dragX) cam.manualT = 90; else cam.manualT--;
  const h = game.hero;
  if (cam.manualT < 0 && (h.state === 'run' || h.state === 'ride') && h.spd > 3) {
    let d = h.yaw - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < 2.4) cam.yaw += d * 0.012;
  }
}
function camUpdate(dt) {
  const h = game.hero, mu = game.musou;
  let crowdN = 0; const cr = game.crowd; cr.query(h.x, h.z, 4, (i) => { if (cr.isAlive(i)) crowdN++; });
  cam.crowdK += (Math.min(1, crowdN / 14) - (cam.crowdK || 0)) * 0.03;
  const portrait = innerHeight > innerWidth * 1.1;
  let dist = cam.dist * (portrait ? 1.45 : 1) + cam.crowdK * 1.2, pitch = cam.pitch + (portrait ? 0.08 : 0) + cam.crowdK * 0.2, yaw = cam.yaw, lookY = 1.25, fov = portrait ? 64 : 52;
  if (h.riding) { dist += 2.4; lookY = 1.75; fov += Math.min(1, h.spd / HERO.ride) * 5; }
  _t.set(h.x, h.y * 0.6 + lookY, h.z);
  let ease = 0;
  if (game.slow > 0 && DIR.koPos) { _t.lerp(_p.set(DIR.koPos.x, 1.3, DIR.koPos.z), 0.55); dist = 5.4; fov = 40; pitch = 0.2; }
  if (DIR.phase === 7) { _t.set(BRIDGE.x + 1.2, 2.0, RIVER.z0 + 5); yaw = 0.34; dist = 16; pitch = 0.24; fov = 50; ease = 0.035; }
  if (mu.active) {
    const t = mu.t;
    if (mu.style === 'roar') { if (t < ROAR.raise) { yaw = h.yaw + Math.PI + 0.5; dist = 3.6; pitch = 0.06; lookY = 1.7; _t.set(h.x, h.y + lookY, h.z); fov = 44; } else { yaw = h.yaw + 0.35; dist = 11.5; pitch = 0.36; fov = 58; } }
    else if (t < MU.raise) { yaw = h.yaw + Math.PI + 0.5; dist = 3.2; pitch = 0.08; lookY = 1.45; _t.set(h.x, h.y + lookY, h.z); fov = 44; }
    else if (t < MU.rush) { yaw = h.yaw - 0.9; dist = 8.5; pitch = 0.22; fov = 56; }
    else { yaw = h.yaw + 0.2; dist = 12; pitch = 0.42; fov = 58; }
  }
  const k = mu.active ? 0.08 : 1 - Math.exp(-dt * 12);
  const cp = Math.cos(pitch);
  _p.set(_t.x - Math.sin(yaw) * dist * cp, _t.y + Math.sin(pitch) * dist, _t.z - Math.cos(yaw) * dist * cp);
  if (mu.active && mu.t === 1) cam.pos.copy(_p);
  cam.pos.lerp(_p, ease || (mu.active ? 0.12 : Math.min(1, k * 1.2)));
  cam.look.lerp(_t, ease ? ease * 1.6 : mu.active ? 0.2 : Math.min(1, k * 1.6));
  cam.fov += (fov - cam.fov) * 0.1;
}
function applyCam() {
  camera.position.copy(cam.pos); game.camPos = cam.pos;
  game.camFwd = game.camFwd || new THREE.Vector3(); game.camFwd.subVectors(cam.look, cam.pos).setY(0).normalize();
  const s = vfx.shake * vfx.shake * 0.35;
  if (s > 0) camera.position.add(_p.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
  camera.position.y = Math.max(camera.position.y, 0.4);
  camera.lookAt(cam.look);
  const ov = window.__camOv;
  if (ov) { const h = game.hero; camera.position.set(h.x + ov[0], h.y + ov[1], h.z + ov[2]); camera.lookAt(h.x + (ov[3] || 0), h.y + (ov[4] ?? 1.1), h.z + (ov[5] || 0)); }
  if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
}
// title screen orbit
function titleCam(t) {
  const a = t * 0.05 + 2.4;
  camera.position.set(Math.sin(a) * 9 + game.hero.x, 2.4, Math.cos(a) * 9 + game.hero.z);
  camera.lookAt(game.hero.x, 1.4, game.hero.z + 6);
}

// ---------------------------------------------------------------- director
const DIR = { phase: 0, t: 0, time: 0, ko0: 0, dmg: 0, maxCombo: 0, combo: 0, comboT: 0, offDown: 0, over: false, endT: 0, win: false, lastMile: 0, dlgQ: [] };
function say(who, zh, en, dur = 200) { DIR.dlgQ.push({ who, zh, en, dur }); }
function banner(main, sub, blue) { const b = $('banner'); $('bannerMain').innerHTML = main; $('bannerSub').textContent = sub || ''; b.classList.toggle('blue', !!blue); b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); }
function spawnOfficerNear(k, dist = 16) {
  const h = game.hero;
  let a = Math.atan2(0 - h.x, 20 - h.z) + (Math.random() - 0.5) * 1.2;
  let x = h.x + Math.sin(a) * dist, z = h.z + Math.cos(a) * dist;
  x = Math.max(ARENA.x0 + 4, Math.min(ARENA.x1 - 4, x)); z = Math.max(ARENA.z0 + 4, Math.min(ARENA.z1 - 4, z));
  const o = game.crowd.spawnOfficer(k, x, z);
  const yaw = Math.atan2(h.x - x, h.z - z);
  game.crowd.spawnSquad(x - Math.sin(yaw) * 3, z - Math.cos(yaw) * 3, yaw, 14, 'mixed', 'march');
  return o;
}
const markPos = () => (DIR.phase === 6 ? BRIDGE : game.stage === 'bridge' ? null : DIR.mark);   // where the light pillar stands
function directorStep() {
  if (DIR.over) { DIR.endT++; return; }
  DIR.t++; DIR.time++;
  const c = game.crowd, h = game.hero, ko = c.ko;
  const offs = c.officers;
  if (auto.on) DIR.autoRun = true;
  if (h.sword) ach('sword');
  if (game.stage === 'bridge') bridgeDirector();
  else if (game.stage === 'endless') endlessDirector();
  else if (DIR.phase >= 10) xunzhuDirector();
  else if (DIR.phase === 0) {
    if (DIR.t === 30) say('趙雲', '主公之子在此，趙雲誓死護之！', 'My lord\'s son is in my care. None of you shall pass!');
    if (ko >= 50 || DIR.t > 60 * 60) {
      spawnOfficerNear(0); DIR.phase = 1; DIR.t = 0;
      banner('敵將 <em>夏侯恩</em> 出現', 'ENEMY OFFICER XIAHOU EN APPROACHES');
      say('夏侯恩', '趙雲！留下阿斗，饒你不死！', 'Zhao Yun! Hand over the child and I may spare you!');
    }
  } else if (DIR.phase === 1) {
    if (offs[0].dead) {
      DIR.phase = 2; DIR.t = 0; DIR.ko0 = ko;
      h.sword = true;
      setTimeout(() => banner('獲得 <em>青釭劍</em>', 'QINGGANG SWORD OBTAINED · ATTACK UP', true), 1600);
      say('趙雲', '青釭之劍……削鐵如泥，好劍！', 'The Qinggang blade — it cuts iron like clay!');
      dropItem('wine', offs[0].rig.root.position.x, offs[0].rig.root.position.z);
    }
  } else if (DIR.phase === 2) {
    if (DIR.t > 60 * 25 || ko >= DIR.ko0 + 80) {
      spawnOfficerNear(1, 15); spawnOfficerNear(2, 17);
      DIR.phase = 3; DIR.t = 0;
      banner('敵將 <em>晏明</em>・<em>淳于導</em> 出現', 'YAN MING & CHUNYU DAO APPROACH');
      say('晏明', '常山小兒，吃我一刀！', 'Changshan whelp — taste my blade!');
    }
  } else if (DIR.phase === 3) {
    if (offs[1].dead && offs[2].dead) { DIR.phase = 4; DIR.t = 0; }
  } else if (DIR.phase === 4) {
    if (DIR.t === 90) {
      spawnOfficerNear(3, 18); DIR.phase = 5; DIR.t = 0;
      banner('魏將 <em>張郃</em> 見參', 'ZHANG HE HAS ENTERED THE FIELD');
      say('張郃', '常山趙子龍，名不虛傳。且讓張儁乂會你一會！', 'Zhao Zilong of Changshan — let me see if the tales are true!');
    }
  } else if (DIR.phase === 5) {
    if (offs[3].dead) {
      DIR.phase = 6; DIR.t = 0;
      setTimeout(() => banner('向 <em>長坂橋</em> 突圍！', 'BREAK THROUGH TO CHANGBAN BRIDGE', true), 1800);
      say('張飛', '子龍快走！此處交給俺老張！', 'Zilong, go! Leave this lot to me!', 240);
    }
  } else if (DIR.phase === 6) {
    if (Math.abs(h.x - BRIDGE.x) < BRIDGE.w + 0.5 && h.z < RIVER.z1 - 1) { DIR.phase = 7; DIR.t = 0; game.reinforceOK = false; h.inv = 99999; }
  } else if (DIR.phase === 7) {   // 張飛據橋: he roars, the pursuit is thrown back
    h.inv = 99999;
    if (DIR.t === 40) say('張飛', '燕人張翼德在此！誰敢與我決一死戰！', 'I am Zhang Yide of Yan! Who dares fight me to the death?!', 250);
    if (DIR.t === 120) { game.emit('roar', { x: BRIDGE.x, z: RIVER.z1 + 1 }); game.crowd.shock(BRIDGE.x, RIVER.z1 - 2, 60, 16, 10); }
    if (DIR.t === 150) game.crowd.shock(BRIDGE.x, RIVER.z1 - 2, 40, 9, 6);
    if (DIR.t >= 270) finish(true);
  }
  // 虎豹騎 charges once the first officer is down
  if (game.stage === 'xunzhu' && !h.sword && offs[0].active && offs[0].dead) {   // 夏侯恩's sword is a prize here, not a gate
    h.sword = true; setTimeout(() => banner('獲得 <em>青釭劍</em>', 'QINGGANG SWORD OBTAINED · ATTACK UP', true), 1600);
    say('趙雲', '青釭之劍……削鐵如泥，好劍！', 'The Qinggang blade — it cuts iron like clay!');
  }
  if ((game.stage === 'changban' || game.stage === 'xunzhu') && DIR.phase >= 2 && DIR.phase <= 6 && --DIR.cavT <= 0) DIR.cavT = game.cav.launch(DIR.phase >= 5 ? 5 : 4) ? (60 * 40 + Math.random() * 60 * 20) / game.diff.cav : 120;
  // KO milestones
  const mile = Math.floor(ko / 100) * 100;
  if (mile > DIR.lastMile && mile > 0 && game.stage !== 'endless') { DIR.lastMile = mile; banner(`<em>${mile}</em> 人 擊破`, `${mile} K.O.`); game.emit('milestone'); }
  // combo decay
  if (DIR.comboT > 0 && --DIR.comboT === 0) DIR.combo = 0;
  // pickups
  for (let k = items.length - 1; k >= 0; k--) {
    const it = items[k]; it.t++;
    it.m.position.set(it.x, 0.25 + Math.sin(it.t * 0.08) * 0.08, it.z); it.m.rotation.y += 0.03;
    if (Math.hypot(h.x - it.x, h.z - it.z) < 1.2 && !h.dead) {
      if (it.type === 'wine') { h.musou = HERO.musouMax; game.emit('pickup', { x: it.x, z: it.z, col: [1, 0.8, 0.3] }); floatText('無雙全滿', '#ffd060'); }
      else if (BUFFS[it.type]) { const bf = BUFFS[it.type]; h.buff[it.type] = HERO.buffTime; game.emit('pickup', { x: it.x, z: it.z, col: bf.rgb }); floatText(bf.tip, bf.col); }
      else { const v = it.type === 'bigbun' ? h.hpMax * Math.min(1, game.diff.heal) : h.hpMax * 0.25 * game.diff.heal; h.hp = Math.min(h.hpMax, h.hp + v); game.emit('pickup', { x: it.x, z: it.z, col: [0.5, 1, 0.6] }); floatText(it.type === 'bigbun' ? '體力全滿' : '體力回復', '#8af0b0'); }
      scene.remove(it.m); items.splice(k, 1);
    } else if (it.t > 60 * 60) { scene.remove(it.m); items.splice(k, 1); }
  }
}
// ---- 尋主: find 簡雍, reach 糜夫人 at the dry well before the clock runs out, take A Dou, then the breakout as usual
const MI_TIME = { easy: 100, normal: 75, hard: 60, chaos: 50 };
function xunzhuDirector() {
  const h = game.hero, c = game.crowd;
  if (DIR.phase === 10) {
    if (DIR.t === 30) say('趙雲', '主母與小主人失散在亂軍之中……先尋個人問問！', 'My lady and the young lord are lost in this rout. Someone must have seen them.');
    if (Math.hypot(h.x - CLUE.x, h.z - CLUE.z) < 3.4) {
      DIR.phase = 11; DIR.t = 0; DIR.mark = WELL; DIR.miT = MI_TIME[diffKey] * 60;
      say('簡雍', '子龍！二位夫人棄了車仗，往西南斷牆那邊去了……快去！', 'Zilong! The ladies left the carriage and fled south-west, toward the broken wall — go!', 250);
      banner('趕往 <em>枯井</em>', 'REACH THE DRY WELL BEFORE IT IS TOO LATE', true);
      spawnOfficerNear(0, 15);
      say('夏侯恩', '來將休走！且看我背上這口青釭劍！', 'Stand, rider! See the Qinggang blade on my back!');
    }
  } else if (DIR.phase === 11) {
    DIR.miT--;
    if (DIR.miT === 60 * 30) banner('糜夫人 <em>危急</em>', 'LADY MI IS IN DANGER — 30 SECONDS');
    if (DIR.miT <= 0) { DIR.lost = true; banner('幼主 <em>失散</em>', 'THE HEIR IS LOST'); finish(false); return; }
    if (Math.hypot(h.x - WELL.x, h.z - WELL.z) < 3.6) {
      DIR.phase = 12; DIR.t = 0; DIR.mark = null; h.inv = Math.max(h.inv, 430);
      c.shock(WELL.x, WELL.z, 9, 7, 4);
      say('糜夫人', '將軍來了……妾身腿上中槍，行走不得。阿斗就託付給將軍了！', 'General, you came. I am wounded and cannot walk. A Dou is in your hands now.', 280);
    }
  } else if (DIR.phase === 12) {
    if (DIR.t === 150) {
      heroView.setBaby(true); miRig.j.adou.visible = false;
      banner('懷抱 <em>阿斗</em>', 'THE HEIR IS IN YOUR ARMS · BREAK OUT', true);
      game.emit('pickup', { x: h.x, z: h.z, col: [1, 0.85, 0.4] }); h.hp = Math.min(h.hpMax, h.hp + h.hpMax * 0.3);
    }
    if (DIR.t === 290) say('趙雲', '夫人放心，雲拼死也護小主人殺出重圍！', 'Rest easy, my lady. I will carry him out or die trying.', 200);
    if (DIR.t === 400) { miRig.root.visible = false; game.emit('thud', { x: WELL.x, z: WELL.z }); say('趙雲', '夫人——！', 'My lady—!', 110); }
    if (DIR.t >= 430) { DIR.phase = 2; DIR.t = 60 * 13; DIR.ko0 = c.ko; }
  }
}
// ---- 千人斬: no end. Every hundred down the army gets tougher; officers and cavalry keep coming
function endlessDirector() {
  const c = game.crowd, ko = c.ko;
  if (DIR.t === 30) say(game.char.zh, charKey === 'fei' ? '來多少，俺殺多少！' : '縱有千軍萬馬，雲何懼哉！', charKey === 'fei' ? 'Send as many as you like — I will cut them all down!' : 'A thousand horse, ten thousand men — what of it?');
  const lv = 1 + Math.floor(ko / 100);
  if (lv !== DIR.lv) {
    DIR.lv = lv; const d = DIFFS[diffKey];
    game.diff.hp = d.hp * (1 + 0.1 * (lv - 1)); game.diff.dmg = d.dmg * (1 + 0.07 * (lv - 1)); game.diff.tokens = d.tokens + Math.floor((lv - 1) / 3);
    if (ko === 1000 || (ko > 1000 && !DIR.thousand)) { DIR.thousand = true; banner('<em>千人斬</em> 達成', 'A THOUSAND SLAIN', true); game.emit('thousand'); }
    else banner(`<em>${(lv - 1) * 100}</em> 人擊破 · 第 ${lv} 陣`, `${(lv - 1) * 100} K.O. · RANK ${lv}`);
    game.emit('milestone');
    if (lv % 3 === 0) dropItem('bun', game.hero.x + 2, game.hero.z + 2);
  }
  if (ko >= DIR.nextOff && c.officers.filter((o) => o.active && !o.dead).length < 2) {
    const k = DIR.offN++ % OFFICERS.length, o = c.officers[k];
    if (!o.active || o.dead) { spawnOfficerNear(k, 16); DIR.nextOff = ko + 130; banner(`敵將 <em>${o.def.zh}</em> 出現`, `ENEMY OFFICER ${o.def.en} APPROACHES`); }
  }
  if (ko >= 200 && --DIR.cavT <= 0) DIR.cavT = game.cav.launch(lv >= 8 ? 5 : 4) ? (60 * 45) / game.diff.cav : 120;
}
// ---- 據水斷橋: Zhang Fei holds the bridge mouth against five waves; twenty men across and it is lost
const WAVES = [
  { squads: [[-12, 26], [0, 32], [12, 26]] },
  { squads: [[-18, 28], [-6, 34], [6, 34], [18, 28]], archers: [[0, 44]] },
  { squads: [[-14, 30], [0, 36], [14, 30]], officer: 4, cav: 4, cavN: 1 },
  { squads: [[-22, 28], [-11, 34], [0, 38], [11, 34], [22, 28]], archers: [[-9, 46], [9, 46]], cav: 5, cavN: 2 },
  { squads: [[-14, 30], [0, 36], [14, 30]], archers: [[0, 46]], officer: 5, cav: 5, cavN: 1 },
];
const CROSS_MAX = 20;
function startWave(n) {
  const c = game.crowd, w = WAVES[n - 1], g = game.goal;
  DIR.wave = n; DIR.waveLive = 0; DIR.waveT = 0;
  for (const [x, z] of w.squads) c.spawnSquad(x, z, Math.atan2(g.x - x, g.z - z), CROWD.squad, 'mixed', 'march', g);
  for (const [x, z] of w.archers || []) c.spawnSquad(x, z, Math.atan2(g.x - x, g.z - z), 12, 'archer', 'march', g);
  banner(`魏軍 第 <em>${n}</em> 波`, `WAVE ${n} / ${WAVES.length}`);
  if (w.officer != null) {
    const o = c.spawnOfficer(w.officer, 0, 42);
    setTimeout(() => banner(`敵將 <em>${o.def.zh}</em> 出現`, `ENEMY OFFICER ${o.def.en} APPROACHES`), 2600);
    if (w.officer === 4) say('文聘', '張飛匹夫，橋上只你一人，也敢攔我大軍？', 'One man on a bridge, Zhang Fei? You would stop an army?');
    else say('許褚', '俺許仲康來會你！看錘！', 'Xu Zhongkang comes for you — mind the hammer!');
  }
  DIR.cavLeft = w.cavN || 0; DIR.cavSize = w.cav || 4; DIR.cavT = 60 * 9;
  game.emit('waveHorn');
}
function bridgeDirector() {
  const c = game.crowd;
  if (DIR.t === 30) say('張飛', '子龍已過橋去了。俺老張在此，一個也休想過去！', 'Zilong is across. Not one of you gets past me!');
  if (DIR.endAt) { if (DIR.t >= DIR.endAt) finish(true); return; }
  if (DIR.wave === 0) { if (DIR.t === 150) startWave(1); return; }
  DIR.waveLive++;
  if (DIR.waveT > 0) { if (--DIR.waveT === 0) startWave(DIR.wave + 1); return; }
  if (DIR.cavLeft > 0 && --DIR.cavT <= 0) { if (game.cav.launch(DIR.cavSize)) { DIR.cavLeft--; DIR.cavT = 60 * 20 / game.diff.cav; } else DIR.cavT = 120; }
  const offAlive = c.officers.some((o) => o.active && !o.dead);
  // once only archers and standard-bearers are left they make a run for the bridge themselves
  if (DIR.t % 60 === 0) { let f = 0; for (let i = 0; i < CROWD.maxGrunts; i++) if (c.isAlive(i) && c.kind[i] !== KIND.ARCHER && c.kind[i] !== KIND.BEARER) f++; game.rush = (f === 0 && DIR.waveLive > 60 * 12) || (f <= 4 && DIR.waveLive > 60 * 50) || DIR.waveLive > 60 * 85; }
  if (DIR.waveLive > 60 * 5 && !offAlive && ((c.alive <= 2 && !game.cav.busy() && DIR.cavLeft === 0) || DIR.waveLive > 60 * (DIR.wave >= WAVES.length ? 180 : 100))) {
    if (DIR.wave >= WAVES.length) {
      DIR.endAt = DIR.t + 230; game.hero.inv = 99999;
      banner('曹軍 <em>退卻</em>', 'THE WEI ARMY FALLS BACK', true);
      say('張飛', '燕人張翼德在此！誰敢與我決一死戰！', 'I am Zhang Yide of Yan! Who dares fight me to the death?!', 220);
      setTimeout(() => { game.emit('roar', { x: game.hero.x, z: game.hero.z }); game.crowd.shock(game.hero.x, game.hero.z, 40, 14, 9); }, 900);
    } else { banner(`第 <em>${DIR.wave}</em> 波 擊退`, `WAVE ${DIR.wave} REPELLED`, true); DIR.waveT = 60 * 4; dropItem('bun', game.goal.x - 1.5, game.goal.z + 3); if (DIR.wave % 2 === 0) dropItem('wine', game.goal.x + 1.5, game.goal.z + 3); }
  }
}
game.on('cross', (e) => {
  if (DIR.over || DIR.endAt) return;
  DIR.crossed += e.n; floatText(`渡橋 ${DIR.crossed} / ${CROSS_MAX}`, '#ff7a5a');
  if (DIR.crossed >= CROSS_MAX) { banner('長坂橋 <em>失守</em>', 'THE BRIDGE IS LOST'); finish(false); }
});

function finish(win) {
  if (DIR.over) return;
  DIR.over = true; DIR.win = win; DIR.endT = 0;
  if (win) { game.emit('victory'); if (game.stage === 'bridge') banner('長坂橋 <em>守住了</em>', 'THE BRIDGE HOLDS', true); else { banner('突圍 <em>成功</em>', 'VICTORY', true); say('趙雲', '主公，阿斗安然無恙！', 'My lord, your son is safe!', 220); } }
  setTimeout(showResult, win ? 3800 : 3200);
}
game.on('heroDead', () => { if (game.stage === 'endless') banner(`<em>${game.crowd.ko}</em> 人斬`, `${game.crowd.ko} SLAIN`, true); else banner(`${game.char.zh} <em>敗走</em>`, 'DEFEATED'); finish(false); });
game.on('heroHit', (e) => {
  const h = game.hero;
  DIR.combo += e.n; DIR.comboT = 150; DIR.maxCombo = Math.max(DIR.maxCombo, DIR.combo);
  if (!e.musou) h.musou = Math.min(HERO.musouMax, h.musou + e.n * 0.2 * (h.sword ? 1.2 : 1) * game.bonus.mus);
  comboPop = true;
});
game.on('heroHurt', (e) => { DIR.dmg += e.dmg; DIR.src[e.src] = (DIR.src[e.src] || 0) + Math.round(e.dmg); DIR.combo = 0; hurtFlash = 1; });
game.on('ko', (e) => {
  if (e.off) { banner(`敵將 <em>${e.o.def.zh}</em> 擊破！`, `ENEMY OFFICER ${e.o.def.en} DEFEATED`); DIR.offDown++; game.hitstop = Math.max(game.hitstop, 6); game.slow = 66; DIR.koPos = { x: e.x, z: e.z }; dropItem('bigbun', e.x, e.z); return; }
  const r = Math.random();
  if (e.kind === KIND.CAPTAIN && r < 0.45) dropItem('bun', e.x, e.z);
  else if (e.kind === KIND.CAPTAIN && r < 0.62) dropItem(['axe', 'armor', 'boots'][(Math.random() * 3) | 0], e.x, e.z);
  else if (e.kind === KIND.BEARER && r < 0.35) dropItem('wine', e.x, e.z);
  else if (r < 0.012) dropItem('bun', e.x, e.z);
});
game.on('cavalry', () => {
  banner('<em>虎豹騎</em> 突擊！', 'TIGER-LEOPARD CAVALRY — CLEAR THE LANE');
  if (game.cav.waves === 1) say('曹純', '虎豹騎，踏平他！', 'Tiger-Leopard riders — run him down!');
});
game.on('parry', (e) => {
  const h = game.hero, f = e.from;
  floatText('彈反！', '#fff2b0');
  if (f && f.cav) game.cav.unseat(f.cav, Math.sin(h.yaw), Math.cos(h.yaw));
  else if (f && f.i != null) game.crowd.stagger(f.i, Math.sin(h.yaw), Math.cos(h.yaw));
});
game.on('cavKo', () => { floatText('騎兵 擊落', '#ffb070'); comboPop = true; });
game.on('mount', () => { if (!DIR.rode && charKey === 'zhao') { DIR.rode = true; say('趙雲', '白龍，隨我殺出去！', 'Bailong — carry me through!', 150); } });
game.on('musouEnd', () => { if (charKey === 'fei') say('張飛', '燕人張翼德在此！', 'Zhang Yide of Yan stands here!', 150); else say('趙雲', '吾乃常山趙子龍也！', 'I am Zhao Zilong of Changshan!', 150); });
game.on('wave', () => { if (game.frame - (DIR.waveF || -9999) > 60 * 25) { DIR.waveF = game.frame; banner('魏軍 <em>援兵</em> 到着', 'WEI REINFORCEMENTS HAVE ARRIVED'); } });
// ---- achievements. Autopilot battles (attract / tests) earn nothing unless auto.count is set
const counts = () => !DIR.autoRun || auto.count;
function ach(k) {
  if (!counts()) return;
  const a = meta.unlock(k); if (!a) return;
  toast(`成就 · ${a.zh}`, `${a.d} · 武勳 +${a.merit}`); game.emit('achieve', a); refreshMeta();
}
game.on('officer', (e) => { DIR.offDmg[e.o.def.key] = DIR.dmg; });
game.on('ko', (e) => {
  if (game.crowd.ko >= 1000) ach('thousand');
  if (e.off) { if (DIR.offDmg[e.o.def.key] === DIR.dmg) ach('flawless'); } else if (game.hero.riding && ++DIR.rideKo >= 50) ach('trample');
});
game.on('heroHit', () => { if (DIR.combo >= 300) ach('combo'); });
game.on('parry', () => { if (++DIR.parries >= 10) ach('parry'); });
game.on('cavKo', () => { if (++DIR.unseats >= 5) ach('unseat'); });
game.musicIntensity = () => (ui.mode !== 'play' ? 0.6 : game.crowd.officers.some((o) => o.active && !o.dead) || game.musou.active ? 2 : 1);

// ---------------------------------------------------------------- HUD
const ui = { mode: 'title', shownKo: 0, hpLag: 1 };
let comboPop = false, hurtFlash = 0;
const hudEls = { hp: $('hp'), hpLag: $('hpLag'), hpBox: $('hpBox'), mu: $('mu'), muBox: $('muBox'), muLbl: $('muLbl'), ko: $('ko'), combo: $('combo'), comboN: $('comboN'),
  obj: $('obj'), tm: $('tm'), buffs: $('buffs'), morale: $('morale'), boss: $('boss'), bossName: $('bossName'), bossHp: $('bossHp'), dlg: $('dlg'), sword: $('swordTag') };
const tagEls = OFFICERS.map((d) => { const e = document.createElement('div'); e.className = 'tag'; e.innerHTML = `<div class="nm">${d.zh}<small>${d.en}</small></div><div class="bar"><i></i></div><div class="mk">▼▼</div>`; e.style.display = 'none'; $('tags').appendChild(e); return e; });
const floatLayer = document.createElement('div'); floatLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none'; $('hud').appendChild(floatLayer);
function floatText(txt, color) {
  const e = document.createElement('div'); e.textContent = txt;
  e.style.cssText = `position:absolute;left:50%;top:58%;transform:translate(-50%,0);font-family:var(--serif);font-weight:900;font-size:22px;color:${color};text-shadow:0 2px 0 #000;transition:all 1.2s ease-out;opacity:1`;
  floatLayer.appendChild(e); requestAnimationFrame(() => { e.style.top = '50%'; e.style.opacity = '0'; }); setTimeout(() => e.remove(), 1300);
}
function toast(main, sub) { const e = $('toast'); e.innerHTML = `${main}<small>${sub || ''}</small>`; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); }
// portrait
function drawFace(k) {
  const x = $('face').getContext('2d');
  const px = (c, a, b, w = 1, h = 1) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
  if (k === 'fei') {
    px('#3a2420', 0, 0, 20, 20); px('#b88a62', 5, 5, 10, 10); px('#0e0e10', 4, 2, 12, 4); px('#0e0e10', 4, 2, 2, 9); px('#0e0e10', 14, 2, 2, 9);
    px('#a8322a', 4, 5, 12, 1); px('#0e0e10', 9, 0, 2, 2);
    px('#f4f4f0', 7, 9, 2, 1); px('#f4f4f0', 11, 9, 2, 1); px('#101010', 8, 9, 1, 1); px('#101010', 11, 9, 1, 1); px('#0e0e10', 6, 8, 3, 1); px('#0e0e10', 11, 8, 3, 1);
    px('#0e0e10', 5, 11, 10, 5); px('#7a4a3a', 9, 12, 2, 1); px('#0e0e10', 7, 16, 6, 2);
    px('#2a2a30', 2, 17, 16, 3); px('#a8322a', 2, 17, 16, 1);
    return;
  }
  px('#2a3e40', 0, 0, 20, 20); px('#e9c29c', 5, 6, 10, 10); px('#17171c', 4, 3, 12, 4); px('#17171c', 4, 3, 2, 10); px('#17171c', 14, 3, 2, 10);
  px('#23a39a', 4, 6, 12, 1); px('#5fd6c8', 9, 1, 2, 2); px('#17171c', 9, 0, 2, 1);
  px('#1b1b22', 7, 10, 2, 1); px('#1b1b22', 11, 10, 2, 1); px('#17171c', 7, 9, 2, 1); px('#17171c', 11, 9, 2, 1); px('#c07a6a', 9, 13, 2, 1);
  px('#eceae3', 3, 16, 14, 4); px('#23a39a', 3, 16, 14, 1); px('#c6cbd1', 8, 17, 4, 3);
}
const mapCv = $('map'), mctx = mapCv.getContext('2d');
const MAPB = { x0: -56, x1: 56, z0: -64, z1: 64 };
const mx = (x) => (MAPB.x1 - x) / (MAPB.x1 - MAPB.x0) * 188, mz = (z) => (MAPB.z1 - z) / (MAPB.z1 - MAPB.z0) * 188;
function drawMap() {
  const c = game.crowd, h = game.hero;
  mctx.clearRect(0, 0, 188, 188);
  mctx.fillStyle = 'rgba(120,90,60,0.25)'; mctx.fillRect(mx(ARENA.x1), mz(ARENA.z1), mx(ARENA.x0) - mx(ARENA.x1), mz(ARENA.z0) - mz(ARENA.z1));
  mctx.fillStyle = 'rgba(160,140,120,0.9)'; mctx.fillRect(0, mz(GATE.z) - 2, 188, 4);
  mctx.fillStyle = 'rgba(30,20,14,1)'; mctx.fillRect(mx(4.5), mz(GATE.z) - 2, mx(-4.5) - mx(4.5), 4);
  mctx.fillStyle = 'rgba(80,120,150,0.8)'; mctx.fillRect(0, mz(RIVER.z1), 188, mz(RIVER.z0) - mz(RIVER.z1));
  mctx.fillStyle = '#8a6a44'; mctx.fillRect(mx(1.8), mz(RIVER.z1 + 1), mx(-1.8) - mx(1.8), mz(RIVER.z0 - 1) - mz(RIVER.z1 + 1));
  mctx.font = '900 11px "Noto Serif TC", serif'; mctx.fillStyle = '#e8d8b8'; mctx.textAlign = 'center';
  mctx.fillText('城門', mx(0), mz(GATE.z) + 14); mctx.fillText('長坂橋', mx(0), mz(RIVER.z0) + 14);
  for (let i = 0; i < c.N; i++) {
    const s = c.st[i]; if (s === ST.OFF || s === ST.DEAD || c.kod[i] || c.kind[i] === KIND.OFFICER) continue;
    const cap = c.kind[i] === KIND.CAPTAIN;
    mctx.fillStyle = cap ? '#ffb070' : s === ST.FORM || s === ST.MARCH ? 'rgba(210,60,40,0.75)' : '#ff5a3a';
    const sz = cap ? 4 : 2.4;
    mctx.fillRect(mx(c.x[i]) - sz / 2, mz(c.z[i]) - sz / 2, sz, sz);
  }
  for (const o of c.officers) if (o.active && !o.dead) { const x = mx(c.x[o.idx]), y = mz(c.z[o.idx]); mctx.fillStyle = '#b8281e'; mctx.fillRect(x - 6, y - 6, 12, 12); mctx.fillStyle = '#fff'; mctx.font = '900 9px "Noto Serif TC", serif'; mctx.fillText('將', x, y + 3.5); }
  for (const ln of game.cav.lanes) if (game.cav.tele > 0) { mctx.strokeStyle = 'rgba(255,80,50,0.6)'; mctx.lineWidth = 2; mctx.beginPath(); mctx.moveTo(mx(ln.x), mz(ln.z)); mctx.lineTo(mx(ln.x + Math.sin(ln.yaw) * ln.len), mz(ln.z + Math.cos(ln.yaw) * ln.len)); mctx.stroke(); }
  for (const r of game.cav.riders) if (r.on) { mctx.fillStyle = r.rider ? '#ffb030' : '#8a7a60'; mctx.fillRect(mx(r.x) - 3, mz(r.z) - 3, 6, 6); }
  if (!h.riding) { const hz = h.horse; mctx.fillStyle = '#ffffff'; mctx.beginPath(); mctx.moveTo(mx(hz.x), mz(hz.z) - 4); mctx.lineTo(mx(hz.x) + 3.5, mz(hz.z)); mctx.lineTo(mx(hz.x), mz(hz.z) + 4); mctx.lineTo(mx(hz.x) - 3.5, mz(hz.z)); mctx.fill(); }
  for (const it of items) { mctx.fillStyle = it.type === 'wine' ? '#ffd060' : BUFFS[it.type] ? BUFFS[it.type].col : '#8af0b0'; mctx.beginPath(); mctx.arc(mx(it.x), mz(it.z), 2.5, 0, 7); mctx.fill(); }
  { const mk = game.stage === 'bridge' ? BRIDGE : markPos(); if (mk) { const t = performance.now() / 300; mctx.strokeStyle = '#7ac8ff'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(mx(mk.x), mz(mk.z), 6 + Math.sin(t) * 2, 0, 7); mctx.stroke(); } }
  // hero + view cone
  const hx = mx(h.x), hz = mz(h.z);
  mctx.save(); mctx.translate(hx, hz);
  mctx.rotate(-cam.yaw + Math.PI); mctx.fillStyle = 'rgba(160,230,255,0.13)'; mctx.beginPath(); mctx.moveTo(0, 0); mctx.arc(0, 0, 36, Math.PI / 2 - 0.5, Math.PI / 2 + 0.5); mctx.fill(); mctx.restore();
  mctx.save(); mctx.translate(hx, hz); mctx.rotate(-h.yaw + Math.PI);
  mctx.fillStyle = '#5fe8d8'; mctx.strokeStyle = '#0a2a28'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.moveTo(0, 7); mctx.lineTo(-5, -5); mctx.lineTo(0, -2); mctx.lineTo(5, -5); mctx.closePath(); mctx.stroke(); mctx.fill(); mctx.restore();
}
const OBJ = ['擊破魏軍 · 殺出重圍', '擊破敵將 夏侯恩', '奪得青釭劍 · 繼續突破', '擊破敵將 晏明・淳于導', '魏軍名將將至……', '擊破魏將 張郃', '向長坂橋突圍！', '張飛 據水斷橋'];
const OBJ_X = { 10: '尋找簡雍 · 打聽主母下落', 11: '趕往枯井 · 糜夫人危在旦夕', 12: '接過阿斗' };
function objText() {
  if (game.stage === 'bridge') return DIR.endAt ? '曹軍退卻' : DIR.wave ? `死守長坂橋 · 第 ${DIR.wave} / ${WAVES.length} 波` : '魏軍將至 · 死守長坂橋';
  if (game.stage === 'endless') return `千人斬 · 第 ${DIR.lv} 陣 · 距下一陣 ${100 - game.crowd.ko % 100} 人`;
  return OBJ_X[DIR.phase] || OBJ[Math.min(DIR.phase, OBJ.length - 1)];
}
let buffKey = '';
const _v = new THREE.Vector3();
let dlgCur = null, dlgT = 0, lastKoShown = -1, mapT = 0;
function hudUpdate() {
  const h = game.hero, c = game.crowd;
  const hp = h.hp / h.hpMax;
  hudEls.hp.style.width = (hp * 100).toFixed(1) + '%';
  ui.hpLag += (hp - ui.hpLag) * (hp < ui.hpLag ? 0.03 : 1);
  hudEls.hpLag.style.width = (ui.hpLag * 100).toFixed(1) + '%';
  hudEls.hpBox.classList.toggle('low', hp < 0.25);
  hudEls.mu.style.width = (h.musou / HERO.musouMax * 100).toFixed(1) + '%';
  const full = h.musou >= HERO.musouMax;
  hudEls.muBox.classList.toggle('full', full); hudEls.muLbl.textContent = full && hp < 0.25 ? '真・無雙' : '無雙'; hudEls.muLbl.classList.toggle('on', full);
  hudEls.sword.textContent = (h.sword ? '青釭劍' : '') + (h.riding ? ' · 騎乘' : '');
  let bk = ''; for (const k in BUFFS) if (h.buff[k] > 0) bk += k + Math.ceil(h.buff[k] / 60) + ' ';
  if (bk !== buffKey) { buffKey = bk; hudEls.buffs.innerHTML = Object.keys(BUFFS).filter((k) => h.buff[k] > 0).map((k) => `<span style="--c:${BUFFS[k].col}"><b>${BUFFS[k].zh}</b>${Math.ceil(h.buff[k] / 60)}</span>`).join(''); }
  if (c.ko !== lastKoShown) { hudEls.ko.textContent = c.ko; if (lastKoShown >= 0) { hudEls.ko.classList.remove('pop'); void hudEls.ko.offsetWidth; hudEls.ko.classList.add('pop'); } lastKoShown = c.ko; }
  hudEls.combo.classList.toggle('on', DIR.combo >= 2);
  if (comboPop) { hudEls.comboN.textContent = DIR.combo; hudEls.comboN.classList.remove('pop'); void hudEls.comboN.offsetWidth; hudEls.comboN.classList.add('pop'); comboPop = false; }
  hudEls.obj.textContent = objText();
  const s = Math.floor(DIR.time / 60); hudEls.tm.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` + (game.stage === 'bridge' ? ` · 渡橋 ${DIR.crossed} / ${CROSS_MAX}` : DIR.phase === 11 ? ` · 糜夫人 ${Math.floor(DIR.miT / 3600)}:${String(Math.floor(DIR.miT / 60) % 60).padStart(2, '0')}` : '');
  hudEls.tm.classList.toggle('warn', DIR.phase === 11 && DIR.miT < 60 * 30);
  const wei = c.alive + 40, shu = 40 + c.ko * 0.8;
  hudEls.morale.style.width = Math.max(8, Math.min(92, shu / (shu + wei) * 100)).toFixed(1) + '%';
  // officer tags + boss bar
  let boss = null, bd = 1e9;
  c.officers.forEach((o, k) => {
    const e = tagEls[k];
    if (!o.active || o.dead) { e.style.display = 'none'; return; }
    const i = o.idx, d = Math.hypot(c.x[i] - h.x, c.z[i] - h.z);
    if (d < bd) { bd = d; boss = o; }
    _v.set(c.x[i], c.y[i] + 2.45 * (o.def.opts.scale || 1), c.z[i]).project(camera);
    if (_v.z > 1 || d > 45) { e.style.display = 'none'; return; }
    e.classList.toggle('lock', lock.o === o);
    e.style.display = ''; e.style.left = ((_v.x * 0.5 + 0.5) * innerWidth).toFixed(0) + 'px'; e.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight).toFixed(0) + 'px';
    e.querySelector('.bar i').style.width = (Math.max(0, c.hp[i] / c.hpMax[i]) * 100).toFixed(1) + '%';
    e.style.opacity = d > 38 ? ((45 - d) / 7).toFixed(2) : '1';
  });
  const showBoss = boss && bd < 16;
  hudEls.boss.classList.toggle('on', !!showBoss);
  if (showBoss) { hudEls.bossName.textContent = boss.def.zh; hudEls.bossHp.style.width = (Math.max(0, c.hp[boss.idx] / c.hpMax[boss.idx]) * 100).toFixed(1) + '%'; }
  // dialogue
  if (dlgCur) { if (--dlgT <= 0) { dlgCur = null; hudEls.dlg.classList.remove('on'); } }
  else if (DIR.dlgQ.length) { dlgCur = DIR.dlgQ.shift(); dlgT = dlgCur.dur; $('dlgWho').textContent = dlgCur.who; $('dlgLine').textContent = dlgCur.zh; $('dlgEn').textContent = dlgCur.en; hudEls.dlg.classList.add('on'); }
  if (++mapT % 3 === 0) drawMap();
}

// ---------------------------------------------------------------- menus
function showMenu(id) { for (const m of ['title', 'pause', 'result']) $(m).classList.toggle('hidden', m !== id); $('touch').style.visibility = id ? 'hidden' : 'visible'; $('hud').classList.toggle('hidden', id !== null && id !== 'play'); }
function startGame() {
  audio.resume();
  resetGame();
  ui.mode = 'play'; showMenu(null); $('hud').classList.remove('hidden');
}
function resetGame() {
  lock.o = null;
  game.hero.reset(); game.crowd.reset(); game.cav.reset(); game.world.resetCrates(); game.frame = 0; game.hitstop = 0; game.slow = 0; game.musou.active = false; game.crowd.freeze = 0; game.reinforceOK = true;
  Object.assign(DIR, { phase: 0, t: 0, time: 0, ko0: 0, dmg: 0, maxCombo: 0, combo: 0, comboT: 0, offDown: 0, over: false, endT: 0, win: false, lastMile: 0, dlgQ: [], src: {}, cavT: 60 * 14, koPos: null, rode: false });
  Object.assign(feiPose, clonePose(FEI.stand));
  for (const it of items) scene.remove(it.m); items.length = 0;
  Object.assign(DIR, { wave: 0, waveT: 0, waveLive: 0, crossed: 0, endAt: 0, cavLeft: 0 }); game.rush = false;
  Object.assign(DIR, { mark: null, miT: 0, lost: false, lv: 1, nextOff: 150, offN: 0, thousand: false, resShown: false, parries: 0, unseats: 0, rideKo: 0, offDmg: {}, autoRun: false, gain: 0 });
  game.bonus = meta.bonus(); { const hh = game.hero; hh.hpMax = hh.hp = Math.round(game.char.hp * game.bonus.hp); hh.musou = HERO.musouMax * Math.min(1, game.bonus.start); }
  game.diff = { ...DIFFS[diffKey] };
  const xz = game.stage === 'xunzhu';
  feiRig.root.visible = game.stage === 'changban' || xz;
  miRig.root.visible = jianRig.root.visible = xz; miRig.j.adou.visible = true; heroView.setBaby(!xz);
  if (xz) { DIR.phase = 10; DIR.mark = CLUE; game.crowd.spawnSquad(WELL.x + 6, WELL.z + 5, 2.4, 14, 'mixed', 'hold'); }
  if (game.stage === 'endless') DIR.cavT = 60 * 20;
  if (game.stage === 'bridge') {
    const h = game.hero; h.z = -38; h.horse.x = 4.5; h.horse.z = -42; h.horse.yaw = 0.4;
    game.goal = { x: BRIDGE.x, z: ARENA.z0 + 1.2 }; game.reinforceOK = false;
  } else { game.goal = null; game.crowd.spawnArmy(); }
  cam.yaw = 0; cam.pos.set(0, 4, game.hero.z - 8); ui.hpLag = 1; lastKoShown = -1;
}
const K = (s) => s.split('').map((c) => `<kbd>${c}</kbd>`).join('');
const MOVELIST = {
  zhao: [['連擊', `${K('J')}×6 — 刺・挑・掃・連刺・劈・迴旋`], ['C1', `${K('K')} — 挑空`], ['C2', `${K('JK')} — 旋挑，再追刺空中`], ['C3', `${K('JJK')} — 百烈突`],
    ['C4', `${K('J')}×3 ${K('K')} — 旋風，收招吹飛`], ['C5', `${K('J')}×4 ${K('K')} — 龍突進（可轉向）`], ['C6', `${K('J')}×5 ${K('K')} — 躍斬震地`]],
  fei: [['連擊', `${K('J')}×5 — 橫掃・回掃・砸地・肩撞・迴旋`], ['C1', `${K('K')} — 頓矛震地（挑空）`], ['C2', `${K('JK')} — 上撩`], ['C3', `${K('JJK')} — 蛇矛亂舞（可轉向）`],
    ['C4', `${K('J')}×3 ${K('K')} — 躍起砸地`], ['C5', `${K('J')}×4 ${K('K')} — 蠻牛衝撞（可轉向）`]],
};
const MOVE_COMMON = [['空中', `${K('J')} 連斬 ×3 · ${K('K')} 下刺`], ['馬上', `${K('J')} 左右橫掃 · ${K('K')} 挺槍突擊 · <kbd>Space</kbd> 躍下`],
  ['格擋', `按住 ${K('U')} — 擋正面攻擊；剛按下的瞬間擋住即<b>彈反</b>，重擊會破防`], ['鎖定', `${K('R')} — 鎖定最近的敵將`]];
function togglePause() {
  if (ui.mode === 'play') {
    ui.mode = 'pause'; showMenu('pause');
    $('moveList').innerHTML = [...MOVELIST[charKey], ...MOVE_COMMON].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    const s = Math.floor(DIR.time / 60);
    $('pauseStats').innerHTML = `<dt>時間</dt><dd>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</dd><dt>擊破</dt><dd>${game.crowd.ko}</dd><dt>最大連擊</dt><dd>${DIR.maxCombo}</dd><dt>敵將</dt><dd>${DIR.offDown}${game.stage === 'endless' ? '' : ' / ' + (game.stage === 'bridge' ? 2 : 4)}</dd>`;
  } else if (ui.mode === 'pause') { ui.mode = 'play'; showMenu(null); $('hud').classList.remove('hidden'); }
}
const fmtT = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function showResult() {
  if (DIR.resShown) return; DIR.resShown = true;
  ui.mode = 'result'; showMenu('result');
  const s = Math.floor(DIR.time / 60), ko = game.crowd.ko, st = game.stage;
  const br = st === 'bridge', en = st === 'endless';
  let rank, note = '';
  if (en) {
    rank = ko >= 1000 ? 'S' : ko >= 600 ? 'A' : ko >= 300 ? 'B' : 'C';
    $('resTitle').textContent = ko >= 1000 ? '千人斬' : '力盡'; $('resSub').textContent = `${ko} SLAIN · RANK ${DIR.lv}`;
    const key = 'board_' + charKey, me = { ko, time: s, diff: diffKey, lv: DIR.lv, at: Date.now() };
    const board = [...LS.get(key, []), me].sort((p, q) => q.ko - p.ko || p.time - q.time).slice(0, 5); LS.set(key, board);
    note = '評價：300 人 B · 600 人 A · 千人斬 S<br>' + board.map((r, i) => `<span class="${r.at === me.at ? 'me' : ''}">${i + 1}. ${r.ko} 人 · 第 ${r.lv} 陣 · ${fmtT(r.time)} · ${DIFFS[r.diff] ? DIFFS[r.diff].zh : ''}</span>`).join('<br>');
  } else {
    const pts = (DIR.win ? 1 : 0) + (br ? (DIR.crossed <= 5 ? 1 : 0) : (s < (st === 'xunzhu' ? 600 : 480) ? 1 : 0)) + (ko >= 300 ? 1 : 0) + (DIR.dmg < (br ? 500 : 400) ? 1 : 0) + (DIR.maxCombo >= 60 ? 1 : 0);
    rank = !DIR.win ? '—' : ['C', 'C', 'C', 'B', 'A', 'S'][pts];
    $('resTitle').textContent = DIR.win ? (br ? '斷橋' : '突圍') : DIR.lost ? '失散' : (br && DIR.crossed >= CROSS_MAX ? '失守' : '敗走');
    $('resSub').textContent = DIR.win ? (br ? 'VICTORY · THE BRIDGE HOLDS' : st === 'xunzhu' ? 'VICTORY · THE HEIR IS SAFE' : 'VICTORY · CHANGBAN') : 'DEFEAT';
    const bkey = `best_${st}_${diffKey}`;
    const best = LS.get(bkey, st === 'changban' ? LS.get('best_' + diffKey, null) : br ? LS.get('bestB_' + diffKey, null) : null);
    const rec = { time: s, ko, combo: DIR.maxCombo, rank };
    if (DIR.win && (!best || (br ? ko > best.ko : s < best.time))) LS.set(bkey, rec);
    note = (DIR.win ? (br ? '評價：守住・渡橋 5 人以下・擊破 300・受傷 500 以下・連擊 60 以上<br>' : `評價：突圍・${st === 'xunzhu' ? 10 : 8} 分鐘內・擊破 300・受傷 400 以下・連擊 60 以上<br>`) : '') + (best ? `最佳紀錄（${game.diff.zh}）${fmtT(best.time)} · ${best.ko} 擊破 · ${best.rank}` : '');
  }
  DIR.rank = rank;
  let gain = 0;
  if (counts()) {
    gain = meta.award(meta.runMerit({ ko, officers: DIR.offDown, win: DIR.win, diff: diffKey })); DIR.gain = gain;
    ach('first');
    if (DIR.win) { ach({ changban: 'break', xunzhu: 'heir', bridge: 'bridge' }[st]); if (br && DIR.crossed <= 5) ach('nocross'); if (diffKey === 'chaos') ach('chaos'); }
    if (rank === 'S') ach('srank');
  }
  const fresh = meta.fresh.splice(0);
  note = (fresh.length ? `<span class="me">成就達成：${fresh.map((a) => a.zh).join(' · ')}</span><br>` : '') + note;
  refreshMeta();
  $('resRank').textContent = rank; $('resRank').style.display = DIR.win || en ? '' : 'none';
  $('resGrid').innerHTML = `<dt>關卡</dt><dd style="font-family:var(--serif)">${STAGE_INFO[st].zh} · ${DIFFS[diffKey].zh}</dd><dt>時間</dt><dd>${fmtT(s)}</dd><dt>擊破數</dt><dd>${ko}</dd><dt>最大連擊</dt><dd>${DIR.maxCombo}</dd><dt>敵將擊破</dt><dd>${DIR.offDown}${en ? '' : ' / ' + (br ? 2 : 4)}</dd><dt>受到傷害</dt><dd>${Math.round(DIR.dmg)}</dd><dt>武勳</dt><dd>${counts() ? `+${gain}（持有 ${meta.st.merit}）` : '自動演示不計'}</dd>` + (br ? `<dt>渡橋</dt><dd>${DIR.crossed} / ${CROSS_MAX}</dd>` : '');
  $('resNote').innerHTML = note;
  game.emit('result', { win: DIR.win, stage: st, ko, time: s, rank });
}
$('go').onclick = startGame; $('again').onclick = startGame; $('resume').onclick = togglePause;
$('restart').onclick = () => { startGame(); };
for (const [a, b, k, f] of [['vol', 'vol2', 'vol', (v) => audio.setVol(v)], ['mus', 'mus2', 'mus', (v) => audio.setMusic(v)]]) {
  const v0 = LS.get(k, k === 'vol' ? 0.8 : 0.55); $(a).value = v0; $(b).value = v0;
  const h = (e) => { const v = +e.target.value; $(a).value = v; $(b).value = v; f(v); LS.set(k, v); };
  $(a).oninput = h; $(b).oninput = h;
}
const STAGES = { zhao: ['changban', 'xunzhu', 'endless'], fei: ['bridge', 'endless'] };
const STAGE_INFO = {
  changban: { zh: '長坂單騎', en: 'LONE RIDER', tag: '長坂坡 · 一杆長槍，單騎七進七出', foot: '擊破四員魏將，向長坂橋突圍。' },
  xunzhu: { zh: '尋主', en: 'SEEK THE HEIR', tag: '亂軍之中 · 尋回糜夫人與阿斗', foot: '先找簡雍打聽下落，趕在糜夫人遇害前到枯井接過阿斗，再殺出重圍。' },
  bridge: { zh: '據水斷橋', en: 'HOLD THE BRIDGE', tag: '長坂橋 · 據水斷橋，一夫當關', foot: '守住橋頭五波，放過二十人即失守。' },
  endless: { zh: '千人斬', en: 'THOUSAND SLAIN', tag: '無盡魏軍 · 每百人更強一陣', foot: '沒有終點：每擊破一百人敵軍變強一陣，戰至力盡。目標千人斬。' },
};
let stageKey = 'changban';
function setStage(k, refresh = true) {
  if (!STAGES[charKey].includes(k)) k = STAGES[charKey][0];
  stageKey = k; game.stage = k; LS.set('stage_' + charKey, k);
  $('stages').innerHTML = '<span>關卡</span>' + STAGES[charKey].map((q) => `<button data-s="${q}" class="${q === k ? 'on' : ''}">${STAGE_INFO[q].zh}</button>`).join('');
  for (const b of document.querySelectorAll('#stages button')) b.onclick = () => setStage(b.dataset.s);
  $('tTag').textContent = STAGE_INFO[k].tag; $('tFoot').textContent = STAGE_INFO[k].foot;
  if (refresh && ui.mode === 'title') resetGame();
}
function setChar(k, refresh = true) {
  charKey = k; game.char = CHARS[k]; LS.set('char', k);
  heroView.setChar(k); drawFace(k);
  const ch = game.char;
  $('tName').textContent = ch.zh; $('tSeal').textContent = ch.seal;
  $('hName').textContent = ch.zh; $('hSeal').textContent = ch.seal; $('hEn').textContent = ch.en; $('pName').textContent = ch.zh;
  for (const b of document.querySelectorAll('#chars button')) b.classList.toggle('on', b.dataset.c === k);
  setStage(LS.get('stage_' + k, ch.stage), refresh);
}
for (const b of document.querySelectorAll('#chars button')) b.onclick = () => setChar(b.dataset.c);
function setDiff(k) { diffKey = k; game.diff = { ...DIFFS[k] }; LS.set('diff', k); for (const b of document.querySelectorAll('#diffs button')) b.classList.toggle('on', b.dataset.d === k); }
for (const b of document.querySelectorAll('#diffs button')) b.onclick = () => setDiff(b.dataset.d);
setDiff(diffKey);
$('qbtn').onclick = cycleQuality; $('qbtn2').onclick = cycleQuality;
// ---- 強化 / 成就 panels
let modalKind = null;
function refreshMeta() {
  $('upBtn').innerHTML = `強化 · 武勳 <b>${meta.st.merit}</b>`; $('achBtn').innerHTML = `成就 <b>${meta.count()}</b> / ${ACHS.length}`;
  if (modalKind) openModal(modalKind);
}
function openModal(kind) {
  modalKind = kind; $('modal').classList.remove('hidden');
  if (kind === 'up') {
    $('mTitle').textContent = '強化'; $('mSub').textContent = `持有武勳 ${meta.st.merit} · 每場戰鬥依擊破數、敵將與勝敗獲得，難度越高越多`;
    $('mBody').innerHTML = '<div class="up">' + UPGRADES.map((u) => { const n = meta.lvl(u.key), c = meta.cost(u.key);
      return `<div><b>${u.zh}</b><small>${u.tip}</small></div><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div><button data-u="${u.key}" ${c == null || meta.st.merit < c ? 'disabled' : ''}>${c == null ? '已滿' : c + ' 武勳'}</button>`; }).join('') + '</div>';
    for (const b of document.querySelectorAll('#mBody button')) b.onclick = () => { if (meta.buy(b.dataset.u)) { game.emit('buff'); refreshMeta(); if (ui.mode === 'title') resetGame(); } };
  } else {
    $('mTitle').textContent = '成就'; $('mSub').textContent = `${meta.count()} / ${ACHS.length} · 達成即得武勳`;
    $('mBody').innerHTML = '<div class="achs">' + ACHS.map((a) => `<div class="${meta.has(a.key) ? 'on' : ''}"><b>${a.zh}</b><i>+${a.merit}</i><small>${a.d}</small></div>`).join('') + '</div>';
  }
}
function closeModal() { modalKind = null; $('modal').classList.add('hidden'); }
$('upBtn').onclick = () => openModal('up'); $('achBtn').onclick = () => openModal('ach'); $('mClose').onclick = closeModal;
$('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal')) closeModal(); });
refreshMeta();

// ---------------------------------------------------------------- loop
let paused = false, manual = false;
function step() {
  const skip = game.slow > 0 && game.slow % 3 !== 0;       // officer finisher plays at one-third speed
  if (game.slow > 0) game.slow--;
  const inp = input.sample(game.hitstop <= 0 && !skip);
  if (ui.mode === 'play') { camStep(inp); camUpdate(1 / 60); }
  if (ui.mode !== 'play' && ui.mode !== 'result') { heroView.step(); game.frame++; return; }
  if (game.hitstop > 0) { game.hitstop--; }
  else if (!skip) {
    let hin = DIR.over ? { mx: 0, mz: 0, mag: 0 } : (auto.on ? autoInput(inp) : inp);
    if (DIR.phase === 7 && !DIR.over) { const h = game.hero, tz = RIVER.z0 + 1.6, dx = BRIDGE.x - 0.5 - h.x, dz = tz - h.z, d = Math.hypot(dx, dz); hin = { mx: dx / (d || 1), mz: dz / (d || 1), mag: d > 1.2 ? 0.7 : 0 }; if (d <= 1.2) h.yaw += Math.atan2(Math.sin(-h.yaw), Math.cos(-h.yaw)) * 0.08; }
    game.hero.step(hin);
    game.crowd.step();
    game.cav.step();
    directorStep();
    approach(feiPose, DIR.phase === 7 ? (DIR.t < 60 ? FEI.stand : DIR.t < 118 ? FEI.raise : FEI.roar) : FEI.stand, DIR.phase === 7 && DIR.t >= 118 ? 0.5 : 0.12);
    heroView.step();
    heroView.update(); vfx.simStep(heroView); musouView.step();
  }
  hurtFlash = Math.max(0, hurtFlash - 0.04);
  vfx.shake = Math.max(0, vfx.shake - 2.2 / 60); vfx.flash = Math.max(0, vfx.flash - 2.5 / 60);
  game.frame++;
}
let lastT = 0;
function render(dt) {
  heroView.update();
  game.crowd.render();
  game.cav.render(game.frame / 60);
  vfx.update(dt, heroView);
  musouView.update();
  if (ui.mode === 'title') titleCam(performance.now() / 1000); else applyCam();
  game.world.update(dt, _v.set(game.hero.x, 0, game.hero.z));
  feiRig.root.position.y = bridgeDeck(feiRig.root.position.z);
  applyPose(feiRig, feiPose);
  const mk = markPos(); if (mk) { beacon.position.x = mk.x; beacon.position.z = mk.z; }
  beacon.material.opacity += ((mk ? 0.22 + Math.sin(game.frame * 0.08) * 0.06 : 0) - beacon.material.opacity) * 0.05;
  beacon.visible = beacon.material.opacity > 0.01;
  grade.uniforms.flash.value = vfx.flash; grade.uniforms.flashCol.value.copy(vfx.flashCol);
  grade.uniforms.musou.value = musouView.strength; grade.uniforms.time.value = (grade.uniforms.time.value + 0.37) % 100;
  grade.uniforms.hurt.value = Math.max(hurtFlash, game.hero.hp / game.hero.hpMax < 0.25 && ui.mode === 'play' ? 0.35 + Math.sin(game.frame * 0.1) * 0.15 : 0);
  game.world.skyMat.uniforms.grade.value = musouView.strength * 0.5;
  composer.render();
  if (ui.mode === 'play' || ui.mode === 'result') hudUpdate();
}
let acc = 0, shotW = 0, shotH = 0;   // test hook: fixed render size for captures
function frame(now) {
  requestAnimationFrame(frame);
  if (manual) return;
  const dt = Math.min(0.1, Math.max(0, (now - (lastT || now)) / 1000)); lastT = now;
  if (ui.mode === 'pause') { render(0); return; }
  acc += dt;
  let n = 0;
  while (acc >= 1 / 60 && n < 4) { step(); acc -= 1 / 60; n++; }
  if (n === 4) acc = 0;
  render(dt);
  if (qMode === 'auto' && ui.mode === 'play' && document.visibilityState === 'visible' && gov.push(dt * 1000)) applyQuality();
}
function onResize(e, w = shotW || innerWidth, h = shotH || innerHeight) {
  renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', onResize);

// ---------------------------------------------------------------- autopilot (testing / attract)
const auto = { on: false, plan: [], t: 0, ride: true };
function autoInput(real) {
  const h = game.hero, c = game.crowd;
  const o = { mx: 0, mz: 0, mag: 0, attack: false, charge: false, jump: false, dodge: false, musou: false };
  // dodge officer telegraphs
  for (const of of c.officers) {
    const dd = of.danger; if (!of.active || of.dead || !dd) continue;
    const dx = h.x - dd.x, dz = h.z - dd.z, d = Math.hypot(dx, dz) || 1;
    if ((dd.r && d < dd.r + 1) || (dd.line && d < 9)) { if (h.state !== 'dodge' && game.frame % 6 === 0) { o.dodge = true; o.mx = dx / d; o.mz = dz / d; o.mag = 1; return o; } }
  }
  const cv = game.cav;
  if (cv.busy()) {
    let n = 0, cx = 0, cz = 0, yaw = 0;
    for (const r of cv.riders) if (r.on && r.rider) { n++; cx += r.x; cz += r.z; yaw = r.yaw; }
    if (n) {
      cx /= n; cz /= n;
      const fx = Math.sin(yaw), fz = Math.cos(yaw), dx = h.x - cx, dz = h.z - cz, along = dx * fx + dz * fz, side = dx * fz - dz * fx, half = n * 1.2 + 1.8;
      if (along > -2 && Math.abs(side) < half && (cv.tele > 0 || along < 30)) {
        const sg = side >= 0 ? 1 : -1; o.mx = fz * sg; o.mz = -fx * sg; o.mag = 1;
        if (cv.tele === 0 && along < 8 && h.state !== 'dodge' && game.frame % 5 === 0) o.dodge = true;
        return o;
      }
    }
  }
  if (h.musou >= HERO.musouMax && c.alive > 20) { o.musou = true; }
  let tgt = null, td = 1e9;
  for (const of of c.officers) if (of.active && !of.dead) { const d = Math.hypot(c.x[of.idx] - h.x, c.z[of.idx] - h.z); if (d < td) { td = d; tgt = { x: c.x[of.idx], z: c.z[of.idx] }; } }
  if (!tgt) { const e = c.nearest(h.x, h.z, 60, 0, 1, -2); if (e) { tgt = e; td = Math.hypot(e.x - h.x, e.z - h.z); } }
  if (game.goal) {
    const offNear = c.officers.some((of) => of.active && !of.dead && Math.hypot(c.x[of.idx] - h.x, c.z[of.idx] - h.z) < 6);
    let bd = 1e9, bi = -1; for (let i = 0; i < CROWD.maxGrunts; i++) if (c.isAlive(i) && (game.rush || (c.kind[i] !== KIND.BEARER && c.kind[i] !== KIND.ARCHER))) { const d = Math.hypot(c.x[i] - game.goal.x, c.z[i] - game.goal.z); if (d < bd) { bd = d; bi = i; } }
    if (bi >= 0 && bd > 15) { bi = -1; if (!offNear) tgt = null; }   // hold the bridge mouth until they come
    if (bi >= 0 && offNear && bd > 9) bi = -2;                        // an officer is on him and nobody is near the bridge yet
    if (bi >= 0) { tgt = { x: c.x[bi], z: c.z[bi] }; td = Math.hypot(tgt.x - h.x, tgt.z - h.z); } else if (!tgt) { tgt = { x: game.goal.x, z: game.goal.z + 7 }; td = Math.hypot(tgt.x - h.x, tgt.z - h.z) > 2 ? 99 : 0; }
  }
  if (DIR.phase === 6) { tgt = { x: BRIDGE.x, z: BRIDGE.z - 3 }; td = 99; }
  if ((DIR.phase === 10 || DIR.phase === 11) && DIR.mark) { tgt = DIR.mark; td = 99; }
  if (DIR.phase === 12) { tgt = null; td = 99; }
  if (tgt) { const dx = tgt.x - h.x, dz = tgt.z - h.z, d = Math.hypot(dx, dz) || 1; o.mx = dx / d; o.mz = dz / d; o.mag = td > 2.6 ? 1 : 0.3; }
  if (auto.ride && !h.riding && td > 26 && td < 90 && game.frame % 90 === 0) o.mount = true;
  if (h.riding && td < 4 && DIR.phase !== 6) { o.jump = true; return o; }
  if (td < 3.4 && game.frame % 7 === 0) {
    if (!auto.plan.length) { const n = (Math.random() * 6) | 0; auto.plan = [...Array(n).fill('a'), Math.random() < 0.8 ? 'c' : 'a']; }
    const k = auto.plan.shift(); if (k === 'a') o.attack = true; else o.charge = true;
  }
  return o;
}

// ---------------------------------------------------------------- test hooks
window.__vm = {
  game, DIR, cam, auto, heroView, scene, camera, renderer,
  start() { startGame(); },
  step(n = 1, dt = 1 / 60) { manual = true; for (let i = 0; i < n; i++) step(); render(dt); return this.info(); },
  run() { manual = false; lastT = 0; },
  simRun(sec) { manual = true; const n = sec * 60; for (let i = 0; i < n; i++) { step(); if (i % 30 === 0) { game.crowd.render(); vfx.update(1 / 2, heroView); } if (DIR.over && DIR.endT > 30) break; } render(1 / 60); return this.info(); },
  info() { const h = game.hero, c = game.crowd; return { t: +(DIR.time / 60).toFixed(1), phase: DIR.phase, ride: h.riding, cav: game.cav.waves + '/' + game.cav.unseated, diff: diffKey, char: charKey, wave: DIR.wave, crossed: DIR.crossed, hp: Math.round(h.hp), musou: Math.round(h.musou), ko: c.ko, alive: c.alive, state: h.state, over: DIR.over, win: DIR.win, dmg: Math.round(DIR.dmg), combo: DIR.maxCombo, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, offs: c.officers.map((o) => o.active ? (o.dead ? 'x' : Math.round(c.hp[o.idx])) : '-').join(' ') }; },
  capture(name = 'shot.jpg', q = 0.85) { render(1 / 60); const data = canvas.toDataURL('image/jpeg', q); return fetch('http://127.0.0.1:8209/', { method: 'POST', body: JSON.stringify({ name, data }) }).then((r) => r.text()); },
  press(k) { pressed.add(k); },
  size(w, h) { shotW = w; shotH = h; onResize(); },
  gov, quality(m) { if (m) { qMode = m; applyQuality(); } return { mode: qMode, tier: TIERS[qTier()].key, pr: renderer.getPixelRatio() }; },
  hold(code, on) { if (on) keys.add(code); else keys.delete(code); },
  ride() { const h = game.hero; h.horse.x = h.x + 1; h.horse.z = h.z; h.horse.yaw = h.yaw; h.mount(); },
  setDiff, setChar, setStage, STAGES, miRig, jianRig, meta, ach, openModal, closeModal, dropItem, items, startWave, result() { showResult(); },
  officer(k) { const o = spawnOfficerNear(k, 8); return o.def.zh; },
};

// ---------------------------------------------------------------- boot
setChar(charKey, false);
resetGame();
applyQuality();
ui.mode = 'title'; showMenu('title'); $('hud').classList.add('hidden');
$('loading').remove();
onResize();
setTimeout(() => $('go').focus(), 100);
requestAnimationFrame(frame);
