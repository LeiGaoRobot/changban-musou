// Visual effects: spear trail, sparks, voxel debris, dust, shock rings, officer danger decals, pickups.
import * as THREE from 'three';
import { radialTexture } from './world.js';
import { ST, KIND } from './crowd.js';

const pointsMat = (additive) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  uniforms: { map: { value: radialTexture() }, scale: { value: 600 } },
  vertexShader: `attribute float size; attribute float alpha; attribute vec3 col; varying float vA; varying vec3 vC;
    uniform float scale; void main(){ vA = alpha; vC = col; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); }`,
});

function pointPool(scene, n, additive) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n), col = new Float32Array(n * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1)); g.setAttribute('col', new THREE.BufferAttribute(col, 3));
  const mat = pointsMat(additive);
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  const P = []; for (let i = 0; i < n; i++) P.push({ life: 0 });
  let head = 0;
  return {
    mat,
    spawn(o) { const p = P[head]; head = (head + 1) % n; Object.assign(p, { vx: 0, vy: 0, vz: 0, g: 0, drag: 0, grow: 0, a0: 1, r: 1, gg: 1, b: 1 }, o); p.max = p.life; },
    update(dt) {
      for (let i = 0; i < n; i++) {
        const p = P[i];
        if (p.life <= 0) { alpha[i] = 0; continue; }
        p.life -= dt; p.vy -= p.g * dt; const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.s += p.grow * dt;
        const u = Math.max(0, p.life / p.max);
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; size[i] = p.s; alpha[i] = p.a0 * (p.fadeIn ? Math.min(1, (1 - u) * 5) * u : u);
        col[i * 3] = p.r; col[i * 3 + 1] = p.gg; col[i * 3 + 2] = p.b;
      }
      for (const k of ['position', 'size', 'alpha', 'col']) g.attributes[k].needsUpdate = true;
    },
  };
}

export function createVfx(scene, game, camera) {
  const V = { shake: 0, flash: 0, flashCol: new THREE.Color(1, 1, 1) };
  const glow = pointPool(scene, 1400, true), dust = pointPool(scene, 700, false);
  V.glow = glow; V.dust = dust;
  // debris cubes
  const DN = 900;
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const debris = new THREE.InstancedMesh(cubeGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), DN); debris.frustumCulled = false; debris.castShadow = true; debris.count = DN; scene.add(debris);
  debris.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DN * 3), 3);
  const D = []; for (let i = 0; i < DN; i++) D.push({ life: 0 });
  let dh = 0;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), Pv = new THREE.Vector3(), C = new THREE.Color();
  const chunk = (x, y, z, vx, vy, vz, s, col, life = 1.6) => { const d = D[dh]; dh = (dh + 1) % DN; Object.assign(d, { x, y, z, vx, vy, vz, s, col, life, max: life, rx: Math.random() * 6, ry: Math.random() * 6, sp: (Math.random() - 0.5) * 20 }); };
  // hero trail
  const TN = 14;
  const tPos = new Float32Array(TN * 2 * 3), tA = new Float32Array(TN * 2);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tPos, 3)); tg.setAttribute('a', new THREE.BufferAttribute(tA, 1));
  const idx = []; for (let i = 0; i < TN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } tg.setIndex(idx);
  const trailMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { c0: { value: new THREE.Color(0.85, 1.0, 1.0) }, c1: { value: new THREE.Color(0.2, 0.75, 0.9) } },
    vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c0, c1; varying float vA; void main(){ gl_FragColor = vec4(mix(c1, c0, vA) * 1.3, vA * vA * 0.5); }' });
  const trail = new THREE.Mesh(tg, trailMat); trail.frustumCulled = false; scene.add(trail);
  V.trailMat = trailMat;
  const hist = [];
  // rings
  const rings = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); rings.push({ m, life: 0 });
  }
  let rh = 0;
  const ring = (x, y, z, r0, r1, life, color, opacity = 0.9) => { const r = rings[rh]; rh = (rh + 1) % rings.length; Object.assign(r, { x, y, z, r0, r1, life, max: life, op: opacity }); r.m.material.color.set(color); r.m.visible = true; };
  V.ring = ring;
  // officer danger decals
  const dangerMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const dCircle = new THREE.Mesh(new THREE.CircleGeometry(1, 48), dangerMat); dCircle.rotation.x = -Math.PI / 2;
  const dEdge = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), dangerMat); dEdge.rotation.x = -Math.PI / 2;
  const dRect = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), dangerMat); dRect.rotation.x = -Math.PI / 2;
  const dangers = []; for (let k = 0; k < 4; k++) { const g = new THREE.Group(); const a = dCircle.clone(), b = dEdge.clone(), r = dRect.clone(); g.add(a, b, r); g.visible = false; scene.add(g); dangers.push({ g, a, b, r }); }
  const lanes = []; for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), dangerMat.clone()); m.rotation.order = 'YXZ'; m.visible = false; scene.add(m); lanes.push(m); }
  // pickup meshes (meat bun / wine jar)
  V.items = [];

  // ---------------- event hooks
  const cam = camera;
  game.on('hit', (e) => {
    const heavy = e.kb === 'blow' || e.kb === 'launch';
    const n = e.off ? 10 : heavy ? 7 : 4;
    const [r, g, b] = game.hero.sword ? [0.6, 0.9, 1] : [1, 0.85, 0.5];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, v = 3 + Math.random() * 6;
      glow.spawn({ x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * v + e.ux * 3, vy: Math.random() * 5, vz: Math.sin(a) * v + e.uz * 3, g: 14, drag: 3, s: 0.12 + Math.random() * 0.08, life: 0.25 + Math.random() * 0.2, r, gg: g, b });
    }
    glow.spawn({ x: e.x, y: e.y, z: e.z, s: e.off ? 2.6 : 1.6, grow: -3, life: 0.1, r: 1, gg: 0.95, b: 0.8 });
    if (e.kb === 'armor') { glow.spawn({ x: e.x, y: e.y + 0.2, z: e.z, s: 2.4, life: 0.18, r: 1, gg: 0.3, b: 0.2 }); }
  });
  game.on('ko', (e) => {
    const c = game.crowd, i = e.i;
    const cols = e.off ? [0x2b3350, 0xd9a843, 0x4a5577] : [0x2a2e38, 0x4b515d, 0x9e2a20, 0xd9a57f];
    for (let k = 0; k < (e.off ? 30 : 7); k++) chunk(c.x[i], c.y[i] + 0.4 + Math.random() * 1.2, c.z[i], (Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6, 0.07 + Math.random() * 0.09, cols[k % cols.length]);
    if (e.off) { ring(c.x[i], 0.08, c.z[i], 0.5, 7, 0.6, 0xffc060); V.shake = Math.max(V.shake, 0.8); V.flash = 0.5; }
  });
  game.on('thud', (e) => { if (Math.random() < 0.5) for (let k = 0; k < 3; k++) dust.spawn({ x: e.x + (Math.random() - 0.5), y: 0.2, z: e.z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 2, vy: 0.6, vz: (Math.random() - 0.5) * 2, drag: 2, s: 0.9, grow: 2.4, life: 0.8, a0: 0.35, r: 0.62, gg: 0.52, b: 0.42 }); });
  const slamFx = (x, z, r, gold) => {
    ring(x, 0.1, z, 0.5, r * 1.1, 0.5, gold ? 0xffd070 : 0xbfe8ff); ring(x, 0.12, z, 0.3, r * 0.7, 0.35, 0xffffff);
    for (let k = 0; k < 40; k++) { const a = k / 40 * 6.28; dust.spawn({ x: x + Math.cos(a) * r * 0.3, y: 0.3, z: z + Math.sin(a) * r * 0.3, vx: Math.cos(a) * r * 1.4, vy: 0.8 + Math.random(), vz: Math.sin(a) * r * 1.4, drag: 3, s: 1.2, grow: 3, life: 1.0, a0: 0.4, r: 0.68, gg: 0.58, b: 0.46 }); }
    for (let k = 0; k < 24; k++) chunk(x + (Math.random() - 0.5) * r, 0.1, z + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 4, 4 + Math.random() * 6, (Math.random() - 0.5) * 4, 0.12 + Math.random() * 0.18, [0x8c7f70, 0x6a5e52, 0x9a8c7a][k % 3], 1.4);
    V.shake = Math.max(V.shake, gold ? 1 : 0.7);
  };
  game.on('slam', (e) => slamFx(e.x, e.z, e.r, false));
  game.on('burst', (e) => { ring(e.x, 1, e.z, 0.3, 4, 0.3, 0x9fe0ff); V.shake = Math.max(V.shake, 0.4); });
  game.on('musouSlam', (e) => { slamFx(e.x, e.z, 9.5, true); ring(e.x, 0.2, e.z, 1, 16, 0.9, 0x6ab8ff); V.flash = 1; V.flashCol.setRGB(1, 0.95, 0.8); V.shake = 1.2; });
  game.on('musouStart', () => { V.flash = 0.8; V.flashCol.setRGB(1, 0.85, 0.5); const h = game.hero; ring(h.x, 0.1, h.z, 0.5, 6, 0.5, 0xffd070); });
  game.on('heroHurt', (e) => { V.shake = Math.max(V.shake, e.heavy ? 0.7 : 0.3); if (e.heavy) { V.flash = 0.35; V.flashCol.setRGB(1, 0.3, 0.2); } });
  game.on('officerStrike', (e) => { if (e.heavy && e.shape === 'circle') { ring(e.x, 0.1, e.z, 0.4, e.r, 0.4, 0xff7050); V.shake = Math.max(V.shake, 0.5); } });
  game.on('land', (e) => { for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; dust.spawn({ x: e.x, y: 0.15, z: e.z, vx: Math.cos(a) * 2, vy: 0.3, vz: Math.sin(a) * 2, drag: 3, s: 0.6, grow: 1.5, life: 0.5, a0: 0.3, r: 0.65, gg: 0.55, b: 0.45 }); } });
  game.on('dodge', () => { const h = game.hero; for (let k = 0; k < 5; k++) dust.spawn({ x: h.x, y: 0.15, z: h.z, vx: (Math.random() - 0.5) * 2, vy: 0.4, vz: (Math.random() - 0.5) * 2, drag: 3, s: 0.6, grow: 1.4, life: 0.5, a0: 0.3, r: 0.65, gg: 0.55, b: 0.45 }); });
  game.on('crate', (e) => { for (let k = 0; k < 16; k++) chunk(e.x + (Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.6, e.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5, 0.08 + Math.random() * 0.12, [0x94704a, 0x7a5636, 0x56391f][k % 3], 1.3);
    for (let k = 0; k < 4; k++) dust.spawn({ x: e.x, y: 0.3, z: e.z, vx: (Math.random() - 0.5) * 2, vy: 0.6, vz: (Math.random() - 0.5) * 2, drag: 2, s: 0.8, grow: 2, life: 0.7, a0: 0.3, r: 0.6, gg: 0.5, b: 0.4 }); });
  game.on('cavKo', (e) => { for (let k = 0; k < 14; k++) chunk(e.x, 1.6 + Math.random() * 0.8, e.z, e.ux * 4 + (Math.random() - 0.5) * 5, 2 + Math.random() * 5, e.uz * 4 + (Math.random() - 0.5) * 5, 0.08 + Math.random() * 0.1, [0x23262e, 0x444a56, 0xc9a040, 0x8a1e18][k % 4]); V.shake = Math.max(V.shake, 0.4); });
  game.on('cavalry', () => { V.shake = Math.max(V.shake, 0.3); });
  game.on('roar', (e) => {
    ring(e.x, 0.3, e.z, 1, 60, 1.2, 0xffe0a0, 1); ring(e.x, 0.5, e.z, 0.5, 34, 0.8, 0xffffff, 0.9); ring(e.x, 1.2, e.z, 0.5, 20, 0.5, 0xffb060, 0.8);
    V.flash = 0.9; V.flashCol.setRGB(1, 0.92, 0.75); V.shake = 1.4;
    for (let k = 0; k < 70; k++) { const a = Math.PI * (k / 70) , r = 4 + Math.random() * 10; dust.spawn({ x: e.x + Math.cos(a) * r, y: 0.4, z: e.z + Math.sin(a) * r, vx: Math.cos(a) * 14, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 14, drag: 2, s: 1.6, grow: 4, life: 1.4, a0: 0.4, r: 0.7, gg: 0.6, b: 0.48 }); }
  });
  game.on('pickup', (e) => { for (let k = 0; k < 20; k++) { const a = Math.random() * 6.28; glow.spawn({ x: e.x, y: 0.5 + Math.random(), z: e.z, vx: Math.cos(a) * 1.5, vy: 2 + Math.random() * 2, vz: Math.sin(a) * 1.5, drag: 1.5, s: 0.18, life: 0.8, r: e.col[0], gg: e.col[1], b: e.col[2] }); } });

  const tipP = new THREE.Vector3(), midP = new THREE.Vector3();
  V.simStep = (heroView) => {
    if (heroView.trailOn) hist.unshift([heroView.tip.clone(), heroView.mid.clone()]); else if (hist.length) hist.pop();
    while (hist.length > TN) hist.pop();
  };
  V.update = (dt, heroView) => {
    const h = game.hero;
    // trail (history is sampled in V.simStep)
    for (let i = 0; i < TN; i++) {
      const s = hist[Math.min(i, hist.length - 1)];
      if (!s) { tA[i * 2] = tA[i * 2 + 1] = 0; continue; }
      tPos.set([s[0].x, s[0].y, s[0].z], i * 6); tPos.set([s[1].x, s[1].y, s[1].z], i * 6 + 3);
      const a = i < hist.length ? 1 - i / TN : 0; tA[i * 2] = a; tA[i * 2 + 1] = 0.0;
    }
    tg.attributes.position.needsUpdate = true; tg.attributes.a.needsUpdate = true;
    if (heroView.trailOn && Math.random() < 0.6) glow.spawn({ x: heroView.tip.x, y: heroView.tip.y, z: heroView.tip.z, vy: 0.5, s: 0.1, life: 0.35, r: 0.6, gg: 0.95, b: 1 });
    // musou motes
    if (game.musou.active) for (let k = 0; k < 3; k++) { const a = Math.random() * 6.28, r = 0.4 + Math.random() * 1.2; glow.spawn({ x: h.x + Math.cos(a) * r, y: h.y + Math.random() * 0.4, z: h.z + Math.sin(a) * r, vy: 2 + Math.random() * 3, drag: 0.5, s: 0.12, life: 0.9, r: 1, gg: 0.8, b: 0.35 }); }
    if (h.sword && Math.random() < 0.15) glow.spawn({ x: heroView.tip.x, y: heroView.tip.y, z: heroView.tip.z, vy: 0.3, s: 0.09, life: 0.5, r: 0.5, gg: 0.9, b: 1 });
    glow.update(dt); dust.update(dt);
    // debris
    for (let i = 0; i < DN; i++) {
      const d = D[i];
      if (d.life <= 0) { M.makeScale(0, 0, 0); debris.setMatrixAt(i, M); continue; }
      d.life -= dt; d.vy -= 20 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y < d.s / 2) { d.y = d.s / 2; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.sp *= 0.5; }
      d.rx += d.sp * dt; d.ry += d.sp * dt * 0.7;
      const sc = d.s * Math.min(1, d.life / 0.4);
      E.set(d.rx, d.ry, 0); Q.setFromEuler(E); S.setScalar(sc); Pv.set(d.x, d.y, d.z); M.compose(Pv, Q, S); debris.setMatrixAt(i, M);
      C.setHex(d.col); debris.setColorAt(i, C);
    }
    debris.instanceMatrix.needsUpdate = true; debris.instanceColor.needsUpdate = true;
    // rings
    for (const r of rings) {
      if (r.life <= 0) { r.m.visible = false; continue; }
      r.life -= dt; const u = 1 - r.life / r.max, e = 1 - (1 - u) ** 3;
      r.m.position.set(r.x, r.y, r.z); r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * e); r.m.material.opacity = r.op * (1 - u);
    }
    // cavalry lanes while the charge is telegraphed, and until the riders have passed
    const cv = game.cav;
    lanes.forEach((m, k) => {
      const ln = cv.lanes[k]; if (!ln || !cv.riders[k].on) { m.visible = false; return; }
      m.visible = true; m.position.set(ln.x + Math.sin(ln.yaw) * ln.len / 2, 0.07, ln.z + Math.cos(ln.yaw) * ln.len / 2); m.rotation.set(-Math.PI / 2, ln.yaw, 0);
      m.scale.set(1.9, ln.len, 1); m.material.opacity = cv.tele > 0 ? 0.1 + 0.07 * Math.sin(game.frame * 0.4) : 0.06;
    });
    // hoof dust
    if (h.riding && h.spd > 6 && Math.random() < 0.7) dust.spawn({ x: h.x - Math.sin(h.yaw) * 1.1 + (Math.random() - 0.5) * 0.6, y: 0.15, z: h.z - Math.cos(h.yaw) * 1.1 + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5), vy: 0.6, vz: (Math.random() - 0.5), drag: 2, s: 0.7, grow: 2.2, life: 0.7, a0: 0.32, r: 0.66, gg: 0.56, b: 0.46 });
    for (const r of cv.riders) if (r.on && r.spd > 6 && Math.random() < 0.6) dust.spawn({ x: r.x - Math.sin(r.yaw) * 1.1, y: 0.15, z: r.z - Math.cos(r.yaw) * 1.1, vy: 0.6, drag: 2, s: 0.8, grow: 2.4, life: 0.8, a0: 0.34, r: 0.6, gg: 0.5, b: 0.42 });
    // danger decals
    let di = 0;
    for (const o of game.crowd.officers) {
      const dd = o.danger; const D0 = dangers[di++];
      if (!dd || !o.active || o.dead) { D0.g.visible = false; continue; }
      D0.g.visible = true; D0.g.position.set(dd.x, 0.06, dd.z);
      const pul = 0.25 + 0.2 * Math.sin(game.frame * 0.5);
      if (dd.line) { D0.a.visible = D0.b.visible = false; D0.r.visible = true; D0.g.rotation.y = dd.yaw; D0.r.scale.set(2.2, dd.len, 1); D0.r.position.set(0, 0, dd.len / 2); D0.r.rotation.set(-Math.PI / 2, 0, 0); }
      else { D0.a.visible = D0.b.visible = true; D0.r.visible = false; D0.g.rotation.y = 0; D0.a.scale.setScalar(dd.r * Math.min(1, dd.k)); D0.b.scale.setScalar(dd.r); }
      dangerMat.opacity = pul;
    }
    trailMat.uniforms.c1.value.setRGB(...(h.sword ? [0.3, 0.6, 1.0] : [0.2, 0.75, 0.9]));
  };
  return V;
}
