// Changban battlefield: sky, light, ground slabs, Wei wall, props, river + 長坂橋, banners, fire, smoke, motes.
import * as THREE from 'three';
import { propParts, wallGeometry, bridgeGeometry, bannerTexture, hash3 } from './voxel.js';

export const ARENA = { x0: -52, x1: 52, z0: -48.5, z1: 57 };
export const GATE = { x: 0, z: 60 };
export const BRIDGE = { x: 0, z: -55, half: 5.5, w: 1.6 };
export const RIVER = { z0: -60, z1: -50 };
export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.72).normalize();

let _rng = 12345;
const rnd = () => ((_rng = Math.imul(_rng ^ (_rng >>> 15), 2246822519) + 0x6D2B79F5 | 0) >>> 0) / 4294967296;

export function bridgeDeck(z) {
  const u = (z - BRIDGE.z) / BRIDGE.half;
  if (Math.abs(u) > 1) return 0;
  return (3.2 * Math.cos(u * Math.PI / 2) + 1) * 0.25;
}
export function groundY(x, z) {
  if (Math.abs(x - BRIDGE.x) < BRIDGE.w + 0.2 && z < RIVER.z1 + 1.5 && z > RIVER.z0 - 1.5) return bridgeDeck(z);
  return 0;
}

export function createWorld(scene) {
  const W = { colliders: [], time: 0, windU: { value: 0 } };
  const P = propParts();
  const matV = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });

  // ---------------- sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: SUN_DIR }, top: { value: new THREE.Color(0x4a5a78) }, mid: { value: new THREE.Color(0xd99a62) }, hor: { value: new THREE.Color(0xf6c486) }, grade: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 sun, top, mid, hor; uniform float grade; varying vec3 vD;
      void main(){ float h = vD.y; vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.15, 0.75, h));
        c = mix(c, vec3(0.42,0.33,0.26), smoothstep(0.0,-0.2,h));
        float s = max(dot(vD, sun), 0.0); c += vec3(1.0,0.72,0.42) * (pow(s, 12.0) * 0.55 + pow(s, 400.0) * 3.0);
        float g = dot(c, vec3(0.3,0.59,0.11)); c = mix(c, vec3(g*1.2, g*0.95, g*0.55), grade);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat); sky.renderOrder = -1; scene.add(sky);
  W.skyMat = skyMat;
  scene.fog = new THREE.Fog(0xd8a276, 40, 230);
  scene.background = new THREE.Color(0xe0a878);

  // ---------------- lights
  const hemi = new THREE.HemisphereLight(0xffe6c8, 0x6a5040, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd6a8, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120; sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  W.sun = sun; W.hemi = hemi;

  // ---------------- ground plane (vertex coloured earth) + river
  {
    const g = new THREE.PlaneGeometry(420, 420, 140, 140); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = []; const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = hash3(Math.floor(x / 3), 0, Math.floor(z / 3)) * 0.5 + hash3(Math.floor(x / 11), 1, Math.floor(z / 11)) * 0.5;
      const far = Math.max(0, Math.hypot(x, z - 5) - 60) / 60;
      c.setHex(0x8e7862).lerp(new THREE.Color(0x76704c), Math.min(1, far * 0.8)).multiplyScalar(0.85 + n * 0.25);
      if (z < RIVER.z1 + 1 && z > RIVER.z0 - 1) c.setHex(0x4a3c2e);
      col.push(c.r, c.g, c.b);
      if (z < RIVER.z1 && z > RIVER.z0) pos.setY(i, -1.2);
      if (far > 0.4) pos.setY(i, pos.getY(i) + (hash3(Math.floor(x / 9), 2, Math.floor(z / 9)) - 0.3) * far * 3);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); m.receiveShadow = true; scene.add(m);
    const wg = new THREE.PlaneGeometry(420, RIVER.z1 - RIVER.z0 + 0.6, 1, 1); wg.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x5a7a88, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.88, emissive: 0x2a3a44, emissiveIntensity: 0.4 }));
    water.position.set(0, -0.35, (RIVER.z0 + RIVER.z1) / 2); scene.add(water); W.water = water;
  }

  // ---------------- stone slabs (instanced boxes, running bond, worn gaps)
  {
    const cells = [];
    const S = 0.9;
    let row = 0;
    for (let z = ARENA.z0; z <= ARENA.z1 + 1; z += S, row++) for (let x = ARENA.x0 - 4 + (row & 1) * S * 0.5; x <= ARENA.x1 + 4; x += S) {
      const d = Math.hypot(x / 1.1, (z - 5) / 1.05);
      const n = hash3(Math.floor(x / 5), 7, Math.floor(z / 5)) * 0.6 + hash3(Math.round(x * 3), 8, Math.round(z * 3)) * 0.4;
      if (n < 0.28 + Math.max(0, d - 38) * 0.03) continue;
      if (d > 62) continue;
      cells.push([x + (rnd() - 0.5) * 0.08, z + (rnd() - 0.5) * 0.08, n]);
    }
    const geo = new THREE.BoxGeometry(0.84, 0.12, 0.84);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95 }), cells.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), c = new THREE.Color();
    const tones = [0x807464, 0x786c5e, 0x887b6a, 0x706658, 0x8c7f6c];
    cells.forEach(([x, z, n], i) => {
      e.set((rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.06); q.setFromEuler(e);
      p.set(x, -0.03 + rnd() * 0.05, z); s.set(0.8 + rnd() * 0.22, 1, 0.8 + rnd() * 0.22);
      m.compose(p, q, s); im.setMatrixAt(i, m);
      c.setHex(tones[(rnd() * tones.length) | 0]).multiplyScalar(0.78 + rnd() * 0.16 + n * 0.1); im.setColorAt(i, c);
    });
    im.receiveShadow = true; scene.add(im);
  }

  // ---------------- Wei wall + gate, far Wei camp
  {
    const wall = new THREE.Mesh(wallGeometry(150), matV);
    wall.position.set(0, 0, GATE.z); wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
    // wall top banners
    const tex = bannerTexture('魏');
    const bMat = flagMaterial(tex, W.windU);
    const poleGeo = new THREE.BoxGeometry(0.12, 5, 0.12); poleGeo.translate(0, 2.5, 0);
    const flagGeo = new THREE.PlaneGeometry(1.4, 2.8, 8, 1); flagGeo.translate(0.7, 0, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20 });
    for (let x = -64; x <= 64; x += 8) {
      if (Math.abs(x) < 11) continue;
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(x, 8.5, GATE.z + 0.3); scene.add(pole);
      const f = new THREE.Mesh(flagGeo, bMat); f.position.set(x + 0.06, 12, GATE.z + 0.3); f.rotation.y = -0.5 + rnd() * 0.3; scene.add(f);
    }
    for (const x of [-3.5, 3.5]) { const pole = new THREE.Mesh(poleGeo, poleMat); pole.scale.y = 1.6; pole.position.set(x, 0, GATE.z - 1); scene.add(pole);
      const f = new THREE.Mesh(flagGeo, bMat); f.scale.set(1.3, 1.3, 1.3); f.position.set(x, 6, GATE.z - 1); f.rotation.y = x > 0 ? -0.3 : 0.3; scene.add(f); }
    W.flagMat = bMat;
  }

  // ---------------- river + bridge
  {
    const b = new THREE.Mesh(bridgeGeometry(), matV); b.position.set(BRIDGE.x, 0, BRIDGE.z); b.castShadow = true; b.receiveShadow = true; scene.add(b);
  }

  // ---------------- props (instanced per kind), all colliders
  const place = (geo, list, cast = true) => {
    const im = new THREE.InstancedMesh(geo, matV, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    list.forEach((it, i) => { e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e); s.setScalar(it.s || 1); p.set(it.x, it.y || 0, it.z); m.compose(p, q, s); im.setMatrixAt(i, m); });
    im.castShadow = cast; im.receiveShadow = true; scene.add(im); return im;
  };
  const clear = (x, z, r) => Math.hypot(x, z + 10) > r && !(Math.abs(x) < 6 && z > 44);   // keep the start and the gate lane open
  // 拒馬 lines
  const juma = [];
  for (const [x0, z0, n, ry] of [[-30, 30, 4, 0.2], [18, 36, 4, -0.15], [-40, -8, 3, 1.4], [40, 4, 3, 1.7], [-12, 46, 3, 0], [28, -28, 3, 0.6], [-26, -34, 3, -0.5]]) {
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.cos(ry) * i * 2.6, z = z0 - Math.sin(ry) * i * 2.6;
      if (!clear(x, z, 9)) continue;
      juma.push({ x, z, ry: ry + (rnd() - 0.5) * 0.2 }); W.colliders.push({ x, z, r: 1.3 });
    }
  }
  place(P.juma, juma);
  // planted stakes and broken spears
  const stakes = [];
  for (let i = 0; i < 260; i++) {
    const x = (rnd() - 0.5) * 110, z = -44 + rnd() * 100;
    if (!clear(x, z, 7)) continue;
    stakes.push({ x, z, rx: (rnd() - 0.5) * 0.5, rz: (rnd() - 0.5) * 0.5, s: 0.6 + rnd() * 0.8 });
  }
  place(P.stake, stakes);
  const spent = [];
  for (let i = 0; i < 45; i++) { const x = (rnd() - 0.5) * 100, z = -44 + rnd() * 98; spent.push({ x, z, ry: rnd() * 6, s: 0.9 + rnd() * 0.4 }); }
  place(P.arrows, spent, false);
  const rocks = [], crates = [], carts = [], racks = [], braz = [], tents = [];
  for (let i = 0; i < 26; i++) { const x = (rnd() - 0.5) * 120, z = -46 + rnd() * 100; if (!clear(x, z, 12)) continue; const s = 0.7 + rnd() * 1.1; rocks.push({ x, z, ry: rnd() * 6, s }); W.colliders.push({ x, z, r: 0.6 * s + 0.1 }); }
  for (let i = 0; i < 16; i++) { const x = (rnd() - 0.5) * 100, z = -40 + rnd() * 90; if (!clear(x, z, 10)) continue; crates.push({ x, z, ry: rnd() * 6, s: 0.9 + rnd() * 0.3 }); W.colliders.push({ x, z, r: 0.55 }); }
  for (const [x, z, ry] of [[-22, 14, 0.7], [30, 22, 2.2], [-8, -30, 1.1], [44, -16, 0.3], [-44, 24, 2.8]]) { carts.push({ x, z, ry }); W.colliders.push({ x, z, r: 1.3 }); }
  for (const [x, z, ry] of [[-6, 52, 0], [8, 52, 0], [-34, 50, 0.3], [36, 50, -0.3]]) racks.push({ x, z, ry });
  const brazierPts = [[-8, 55], [8, 55], [-28, 40], [26, 42], [-44, 10], [44, 14], [-18, -20], [20, -18], [-5, -46], [5, -46]];
  for (const [x, z] of brazierPts) { braz.push({ x, z }); W.colliders.push({ x, z, r: 0.4 }); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (Math.sin(a) < -0.8) continue; tents.push({ x: Math.cos(a) * 92, z: 20 + Math.sin(a) * 78, ry: -a + Math.PI / 2, s: 1.5 + rnd() * 0.5 }); }
  for (let x = -70; x <= 70; x += 14) tents.push({ x, z: 76 + rnd() * 6, ry: rnd() * 0.4, s: 1.6 });
  place(P.rock, rocks); place(P.crate, crates); place(P.cart, carts); place(P.rack, racks); place(P.brazier, braz); place(P.tent, tents, false);

  // ---------------- fire sprites + smoke + motes
  const glowTex = radialTexture();
  const fires = [];
  const fireMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a3a, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  for (const [x, z] of brazierPts) for (let k = 0; k < 3; k++) {
    const s = new THREE.Sprite(fireMat); s.position.set(x, 1.1, z); scene.add(s); fires.push({ s, x, z, k, ph: rnd() * 10 });
  }
  const smokeMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x4a3a30, transparent: true, opacity: 0.35, depthWrite: false });
  const smokes = [];
  const smokeSrc = [[-40, 66], [-18, 70], [22, 68], [48, 64], [-60, 30], [64, 40], [-70, -20]];
  for (const [x, z] of smokeSrc) for (let k = 0; k < 10; k++) { const s = new THREE.Sprite(smokeMat.clone()); scene.add(s); smokes.push({ s, x, z, t: k / 10 }); }
  const moteN = 500, mg = new THREE.BufferGeometry(), mp = new Float32Array(moteN * 3);
  for (let i = 0; i < moteN; i++) { mp[i * 3] = (rnd() - 0.5) * 60; mp[i * 3 + 1] = rnd() * 8; mp[i * 3 + 2] = (rnd() - 0.5) * 60; }
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(mg, new THREE.PointsMaterial({ size: 0.07, color: 0xffd8a0, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.frustumCulled = false; scene.add(motes);

  W.update = (dt, focus) => {
    W.time += dt; W.windU.value = W.time;
    sun.position.copy(focus).addScaledVector(SUN_DIR, 60); sun.target.position.copy(focus);
    sky.position.copy(focus);
    for (const f of fires) {
      const t = W.time * 6 + f.ph;
      f.s.position.set(f.x + Math.sin(t * 0.7 + f.k) * 0.08, 1.15 + f.k * 0.22 + (Math.sin(t) * 0.5 + 0.5) * 0.12, f.z);
      f.s.scale.setScalar((0.9 - f.k * 0.22) * (0.85 + Math.sin(t * 1.3 + f.k * 2) * 0.15));
    }
    for (const s of smokes) {
      s.t = (s.t + dt * 0.05) % 1;
      s.s.position.set(s.x + s.t * 14, 6 + s.t * 40, s.z + Math.sin(s.t * 6) * 2);
      s.s.scale.setScalar(4 + s.t * 18); s.s.material.opacity = 0.42 * Math.sin(s.t * Math.PI);
    }
    const a = mg.attributes.position.array;
    for (let i = 0; i < moteN; i++) { a[i * 3] += dt * 0.35; a[i * 3 + 1] += Math.sin(W.time + i) * dt * 0.08; if (a[i * 3] > 30) a[i * 3] -= 60; }
    mg.attributes.position.needsUpdate = true;
    motes.position.set(focus.x - (focus.x % 60), 0, focus.z - (focus.z % 60));
    if (W.water) W.water.material.emissiveIntensity = 0.35 + Math.sin(W.time * 1.5) * 0.05;
  };

  // push a circle (pos {x,z}) out of world colliders and arena bounds; returns true if clamped
  W.resolve = (o, r, hero) => {
    for (const c of W.colliders) {
      const dx = o.x - c.x, dz = o.z - c.z, d2 = dx * dx + dz * dz, rr = c.r + r;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; o.x += dx * k; o.z += dz * k; }
    }
    const onBridge = Math.abs(o.x - BRIDGE.x) < BRIDGE.w;
    const zMin = hero && onBridge ? RIVER.z0 - 6 : ARENA.z0;
    o.x = Math.max(ARENA.x0, Math.min(ARENA.x1, o.x));
    o.z = Math.max(zMin, Math.min(ARENA.z1, o.z));
    if (o.z < ARENA.z0) o.x = Math.max(BRIDGE.x - BRIDGE.w, Math.min(BRIDGE.x + BRIDGE.w, o.x));
  };
  return W;
}

export function flagMaterial(tex, timeU) {
  const m = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = timeU;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float fx = max(position.x, 0.0);
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
      #else
        float ph = modelMatrix[3].x * 0.37;
      #endif
      transformed.z += sin(fx * 3.2 - uWind * 5.0 + ph) * 0.14 * fx;
      transformed.y += sin(fx * 2.1 - uWind * 3.0 + ph) * 0.04 * fx;`);
  };
  return m;
}

export function radialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}
