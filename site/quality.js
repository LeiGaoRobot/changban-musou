// Quality tiers and the governor that moves between them from measured frame times.
// Pure logic (no three.js) so it can be exercised with synthetic frame times under node.

// pr: pixel-ratio cap · hi/mid: how many soldiers may use the 3 cm / 6 cm models · lod/far: their distances (m)
export const TIERS = [
  { key: 'min', zh: '極低', en: 'Minimum', pr: 0.75, bloom: false, shadow: 0, hi: 0, lod: 0, mid: 70, far: 16 },
  { key: 'low', zh: '低', en: 'Low', pr: 1, bloom: false, shadow: 1024, hi: 0, lod: 0, mid: 150, far: 24 },
  { key: 'mid', zh: '中', en: 'Medium', pr: 1.25, bloom: true, shadow: 2048, hi: 18, lod: 7, mid: 220, far: 30 },
  { key: 'high', zh: '高', en: 'High', pr: 1.5, bloom: true, shadow: 2048, hi: 40, lod: 10, mid: 240, far: 30 },
];

// Feed it one frame time (ms) per rendered frame; it answers -1 / +1 when the tier should change, else 0.
//  · drops after ~2.5 s below ~42 fps
//  · climbs after 10 s of holding the display's rate, and backs off (20 s, 40 s, … then gives up) each time a climb has to be undone
export function createGovernor(start = TIERS.length - 1, n = TIERS.length) {
  const g = { tier: start, ema: 16.7, slow: 0, fast: 0, cool: 90, fails: 0, upAt: -1e9, t: 0, ceil: n - 1 };
  g.push = (ms) => {
    ms = Math.min(ms, 80);                       // one hitch (tab switch, shader compile) must not read as a slow machine
    g.t += ms; g.ema += (ms - g.ema) * 0.06;
    if (g.cool > 0) { g.cool--; g.slow = g.fast = 0; return 0; }
    if (g.ema > 24) { g.slow += ms; g.fast = 0; } else if (g.ema < 18.2) { g.fast += ms; g.slow = Math.max(0, g.slow - ms); } else { g.fast = 0; g.slow = Math.max(0, g.slow - ms); }
    if (g.slow > 2500 && g.tier > 0) {
      if (g.t - g.upAt < 15000) { g.fails++; if (g.fails >= 3) g.ceil = g.tier - 1; }   // the last climb did not hold
      g.tier--; g.slow = g.fast = 0; g.cool = 120; g.ema = 16.7; return -1;
    }
    const need = 10000 * (1 << Math.min(g.fails, 3));
    if (g.fast > need && g.tier < g.ceil) {
      g.tier++; g.slow = g.fast = 0; g.cool = 120; g.upAt = g.t; g.ema = 16.7; return 1;
    }
    return 0;
  };
  return g;
}
