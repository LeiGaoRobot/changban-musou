// WebAudio synthesis: combat SFX + a taiko / erhu battle loop that layers up with the fight.
export function createAudio(game) {
  let ctx = null, master, sfxBus, musBus, noiseBuf, verb;
  const A = { on: true, vol: 0.8, music: 0.55, started: false };
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = A.vol; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(comp);
    musBus = ctx.createGain(); musBus.gain.value = A.music; musBus.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // cheap reverb: feedback delays
    verb = ctx.createGain(); verb.gain.value = 0.25;
    const d1 = ctx.createDelay(), d2 = ctx.createDelay(), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    d1.delayTime.value = 0.089; d2.delayTime.value = 0.137; fb.gain.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 2400;
    verb.connect(d1); d1.connect(lp); lp.connect(d2); d2.connect(fb); fb.connect(d1); d2.connect(comp);
  }
  A.resume = () => { init(); if (ctx.state === 'suspended') ctx.resume(); if (!A.started) { A.started = true; startMusic(); } };
  A.setVol = (v) => { A.vol = v; if (master) master.gain.value = v; };
  A.setMusic = (v) => { A.music = v; if (musBus) musBus.gain.value = v; };
  const now = () => ctx.currentTime;
  const env = (g, t, a, peak, dcy) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy); };
  function noise(t, dur, type, f0, f1, q, peak, bus = sfxBus, send = 0) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, 0.005, peak, dur);
    s.connect(f); f.connect(g); g.connect(bus); if (send) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg); sg.connect(verb); }
    s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }
  function tone(t, dur, type, f0, f1, peak, bus = sfxBus, a = 0.004, send = 0, detune = 0) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.detune.value = detune;
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    o.connect(g); g.connect(bus); if (send) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg); sg.connect(verb); }
    o.start(t); o.stop(t + a + dur + 0.05);
  }
  let lastHit = 0, lastWhoosh = 0;
  const S = {
    whoosh(p = 1) { const t = now(); if (t - lastWhoosh < 0.05) return; lastWhoosh = t; noise(t, 0.2, 'bandpass', 500 * p, 2600 * p, 1.4, 0.35); },
    hit(n, heavy) { const t = now(); if (t - lastHit < 0.035) return; lastHit = t;
      noise(t, heavy ? 0.22 : 0.12, 'lowpass', heavy ? 3000 : 4200, 300, 0.8, heavy ? 0.7 : 0.45);
      tone(t, heavy ? 0.25 : 0.12, 'sine', heavy ? 160 : 220, 50, heavy ? 0.7 : 0.4);
      if (Math.random() < 0.5) tone(t, 0.08, 'square', 1400 + Math.random() * 800, 900, 0.05); },
    armor() { const t = now(); tone(t, 0.2, 'triangle', 1800, 1600, 0.12, sfxBus, 0.002, 0.3); tone(t, 0.2, 'triangle', 2600, 2400, 0.07); },
    ko(off) { const t = now(); tone(t, off ? 0.7 : 0.3, 'sine', off ? 110 : 140, 40, off ? 0.9 : 0.35); if (off) noise(t, 0.8, 'lowpass', 1200, 80, 0.7, 0.8, sfxBus, 0.5); },
    thud() { const t = now(); tone(t, 0.12, 'sine', 90, 40, 0.18); },
    slam(big) { const t = now(); tone(t, big ? 1.4 : 0.7, 'sine', 70, 28, 1.0); noise(t, big ? 1.2 : 0.6, 'lowpass', 1800, 60, 0.7, 0.9, sfxBus, 0.4); },
    jump() { noise(now(), 0.12, 'bandpass', 800, 1600, 1, 0.12); },
    land() { tone(now(), 0.1, 'sine', 110, 50, 0.2); },
    dodge() { noise(now(), 0.18, 'bandpass', 1400, 400, 1.2, 0.2); },
    hurt(heavy) { const t = now(); tone(t, 0.18, 'sawtooth', 180, 90, heavy ? 0.25 : 0.12); noise(t, 0.12, 'lowpass', 2000, 300, 1, 0.3); },
    tell() { const t = now(); tone(t, 0.5, 'sine', 1900, 2400, 0.12, sfxBus, 0.005, 0.5); tone(t + 0.02, 0.45, 'sine', 2850, 3100, 0.06); },
    arrow() { const t = now(); noise(t, 0.25, 'bandpass', 3000, 5000, 6, 0.08); },
    gong(v = 1) { const t = now(); for (const [f, a] of [[110, 1], [163, 0.6], [237, 0.5], [296, 0.35], [405, 0.25]]) tone(t, 3.5, 'sine', f, f * 0.985, 0.3 * a * v, sfxBus, 0.01, 0.6); noise(t, 0.3, 'lowpass', 3000, 400, 0.5, 0.3 * v); },
    roar() { const t = now();
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(130, t + 0.6); o.frequency.linearRampToValueAtTime(60, t + 1.8);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1400, t + 0.7); f.frequency.linearRampToValueAtTime(300, t + 1.8);
      const g = ctx.createGain(); env(g, t, 0.15, 0.5, 1.7); o.connect(f); f.connect(g); g.connect(sfxBus); const sg = ctx.createGain(); sg.gain.value = 0.5; g.connect(sg); sg.connect(verb); o.start(t); o.stop(t + 2);
      noise(t, 1.8, 'bandpass', 600, 250, 1.5, 0.35, sfxBus, 0.5); },
    pickup() { const t = now(); [587, 740, 880, 1175].forEach((f, k) => tone(t + k * 0.06, 0.25, 'triangle', f, f, 0.15, sfxBus, 0.004, 0.4)); },
    milestone() { const t = now(); drum(t, 1.1); tone(t, 1.2, 'sine', 220, 218, 0.2, sfxBus, 0.01, 0.6); },
    victory() { const t = now(); S.gong(1.2); [294, 392, 440, 587, 523, 587].forEach((f, k) => erhu(t + 0.4 + k * 0.28, 0.5, f, 0.2)); },
  };
  S.whinny = () => { const t = now(); for (let k = 0; k < 5; k++) tone(t + k * 0.07, 0.12, 'sawtooth', 900 - k * 90 + Math.random() * 60, 620 - k * 60, 0.07, sfxBus, 0.01, 0.3); noise(t, 0.4, 'bandpass', 1800, 900, 3, 0.08); };
  S.whistle = () => { const t = now(); tone(t, 0.18, 'sine', 1700, 2500, 0.1, sfxBus, 0.01, 0.4); tone(t + 0.2, 0.3, 'sine', 2500, 1900, 0.1, sfxBus, 0.01, 0.4); };
  S.hoof = () => { const t = now(); tone(t, 0.05, 'sine', 150 + Math.random() * 40, 70, 0.16); noise(t, 0.04, 'lowpass', 1400, 400, 1, 0.1); };
  S.horn = () => { const t = now(); for (const [d, f, len] of [[0, 147, 0.7], [0.75, 196, 1.3]]) { tone(t + d, len, 'sawtooth', f, f, 0.16, sfxBus, 0.08, 0.6); tone(t + d, len, 'sawtooth', f * 1.005, f * 1.005, 0.12, sfxBus, 0.08, 0.4, 7); tone(t + d, len, 'square', f / 2, f / 2, 0.08, sfxBus, 0.08); } };
  S.crack = () => { const t = now(); noise(t, 0.18, 'bandpass', 1800, 500, 1.2, 0.5); tone(t, 0.1, 'triangle', 300, 110, 0.25); };
  S.buff = () => { const t = now(); [392, 523, 659, 784].forEach((f, k) => tone(t + k * 0.05, 0.3, 'square', f, f, 0.06, sfxBus, 0.004, 0.4)); };
  S.bellow = () => { const t = now();
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(150, t + 0.35); o.frequency.linearRampToValueAtTime(80, t + 2.2);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1100, t + 0.4); f.frequency.linearRampToValueAtTime(420, t + 2.2);
    const g = ctx.createGain(); env(g, t, 0.1, 0.8, 2.2); o.connect(f); f.connect(g); g.connect(sfxBus); const sg = ctx.createGain(); sg.gain.value = 0.7; g.connect(sg); sg.connect(verb); o.start(t); o.stop(t + 2.5);
    noise(t, 2.0, 'bandpass', 900, 300, 1.2, 0.5, sfxBus, 0.6); S.slam(true); };
  A.S = S;
  function drum(t, v = 1, pitch = 1) { tone(t, 0.5, 'sine', 120 * pitch, 48 * pitch, 0.6 * v, musBus, 0.003); noise(t, 0.12, 'lowpass', 900, 200, 0.8, 0.25 * v, musBus); }
  function rim(t, v = 1) { noise(t, 0.05, 'highpass', 3000, 2500, 1, 0.12 * v, musBus); tone(t, 0.05, 'triangle', 900, 700, 0.05 * v, musBus); }
  function erhu(t, dur, f, v = 0.1) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.97, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = f * 0.012; lfo.connect(lg); lg.connect(o.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 4; lp.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.09); g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(musBus); const sg = ctx.createGain(); sg.gain.value = 0.35; g.connect(sg); sg.connect(verb);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  function pluck(t, f, v = 0.12) { tone(t, 0.35, 'triangle', f, f * 0.995, v, musBus, 0.002, 0.25); tone(t, 0.06, 'square', f * 2, f * 2, v * 0.2, musBus, 0.001); }
  // D minor pentatonic: D F G A C
  const SC = [146.8, 174.6, 196, 220, 261.6, 293.7, 349.2, 392, 440, 523.3, 587.3];
  const MEL = [[5, 2], [7, 1], [8, 1], [7, 2], [5, 1], [4, 1], [5, 4], [8, 2], [9, 1], [10, 1], [9, 2], [8, 1], [7, 1], [8, 4], [7, 2], [5, 1], [4, 1], [3, 2], [4, 1], [5, 1], [3, 4], [2, 2], [3, 2], [5, 3], [4, 1], [5, 4]];
  let step = 0, next = 0, melI = 0, melT = 0;
  const BPM = 104, SPB = 60 / BPM / 2;   // eighth notes
  function startMusic() { next = ctx.currentTime + 0.1; setInterval(schedule, 50); }
  function schedule() {
    if (!A.on || !ctx) return;
    const inten = game.musicIntensity ? game.musicIntensity() : 1;
    while (next < ctx.currentTime + 0.2) {
      const s = step % 16, t = next;
      if (inten > 0) {
        if (s === 0 || s === 6 || s === 10) drum(t, 0.9);
        if (s === 3 || s === 13) drum(t, 0.45, 1.3);
        if (inten > 1 && (s === 8 || s === 14)) drum(t, 0.6, 0.8);
        if (s % 2 === 1) rim(t, inten > 1 ? 0.9 : 0.5);
        if (inten > 1 && s % 4 === 2) pluck(t, SC[[0, 2, 3, 5][(step >> 2) % 4]], 0.07);
        if (inten > 0.5 && melT <= 0) { const [n, len] = MEL[melI % MEL.length]; erhu(t, len * SPB * 0.95, SC[n], inten > 1 ? 0.085 : 0.06); melT = len; melI++; }
        melT--;
      }
      step++; next += SPB;
    }
  }
  // game events
  const on = (n, f) => game.on(n, (e) => { if (A.on && ctx) f(e); });
  on('move', (e) => S.whoosh(e.id[0] === 'c' ? 0.8 : 1));
  on('heroHit', (e) => S.hit(e.n, e.hd.kb === 'blow' || e.hd.kb === 'launch' || e.hd.heavy));
  on('hit', (e) => { if (e.kb === 'armor') S.armor(); });
  on('ko', (e) => { if (e.off) S.ko(true); });
  on('slam', () => S.slam(false));
  on('musouSlam', () => S.slam(true));
  on('musouStart', () => { S.gong(); setTimeout(() => A.on && S.roar(), 500); });
  on('jump', S.jump); on('land', S.land); on('dodge', S.dodge);
  on('heroHurt', (e) => S.hurt(e.heavy));
  on('officerTell', S.tell);
  on('arrow', () => { if (Math.random() < 0.5) S.arrow(); });
  on('pickup', S.pickup);
  on('mount', S.whinny); on('whistle', S.whistle); on('hoof', S.hoof); on('unhorse', S.whinny);
  on('cavalry', S.horn); on('waveHorn', S.horn); on('roarMini', (e) => { S.roar(); S.slam(e.big); }); on('cross', () => S.hurt(true)); on('cavKo', () => S.ko(true)); on('crate', S.crack); on('roar', S.bellow);
  on('milestone', S.milestone);
  on('victory', S.victory);
  on('officer', () => S.gong(0.6));
  return A;
}
