// Meta progression: 武勳 earned per battle buys permanent upgrades; achievements pay a one-off bonus.
// Pure logic over a {get, set} store so it can be exercised under node.

export const UPGRADES = [
  { key: 'hp', zh: '體魄', en: 'Vigor', tip: '體力上限 +8%', tipEn: 'Max health +8%', max: 5 },
  { key: 'atk', zh: '武藝', en: 'Might', tip: '攻擊力 +5%', tipEn: 'Attack +5%', max: 5 },
  { key: 'def', zh: '鐵壁', en: 'Bulwark', tip: '受到傷害 −5%', tipEn: 'Damage taken −5%', max: 5 },
  { key: 'mus', zh: '鬥氣', en: 'Spirit', tip: '無雙累積 +10%', tipEn: 'Musou gain +10%', max: 5 },
  { key: 'start', zh: '先聲', en: 'Opening', tip: '開局無雙 +20%', tipEn: 'Start with +20% Musou', max: 5 },
  { key: 'horse', zh: '馬術', en: 'Horsemanship', tip: '騎乘速度 +5%', tipEn: 'Riding speed +5%', max: 3 },
];
export const COSTS = [60, 120, 200, 300, 420];
export const ACHS = [
  { key: 'first', zh: '初陣', en: 'First Blood', d: '打完一場戰鬥', dEn: 'Finish a battle', merit: 30 },
  { key: 'break', zh: '七進七出', en: 'Seven Charges', d: '長坂單騎 突圍成功', dEn: 'Break out in Lone Rider', merit: 60 },
  { key: 'heir', zh: '懷抱幼主', en: 'The Heir', d: '尋主 過關', dEn: 'Clear Seek the Heir', merit: 60 },
  { key: 'bridge', zh: '據水斷橋', en: 'Hold the Bridge', d: '守住長坂橋', dEn: 'Hold Changban Bridge', merit: 60 },
  { key: 'nocross', zh: '一夫當關', en: 'None Shall Pass', d: '守橋時渡橋不超過 5 人', dEn: 'Hold the bridge with 5 or fewer across', merit: 80 },
  { key: 'thousand', zh: '千人斬', en: 'Thousand Slain', d: '單局擊破 1000 人', dEn: '1000 K.O. in one battle', merit: 100 },
  { key: 'combo', zh: '勢如破竹', en: 'Unstoppable', d: '連擊達到 300', dEn: 'Reach a 300 combo', merit: 50 },
  { key: 'flawless', zh: '毫髮無傷', en: 'Untouched', d: '與敵將交手到擊破，全程未受傷', dEn: 'Defeat an officer without taking damage while he is on the field', merit: 80 },
  { key: 'trample', zh: '鐵蹄', en: 'Iron Hooves', d: '單局在馬上擊破 50 人', dEn: '50 K.O. on horseback in one battle', merit: 50 },
  { key: 'parry', zh: '以靜制動', en: 'Stillness', d: '單局彈反 10 次', dEn: 'Parry 10 times in one battle', merit: 60 },
  { key: 'unseat', zh: '挑落虎豹', en: 'Unhorsed', d: '單局擊落 5 名虎豹騎', dEn: 'Unseat 5 Tiger-Leopard riders in one battle', merit: 60 },
  { key: 'sword', zh: '青釭在手', en: 'Qinggang', d: '奪得青釭劍', dEn: 'Take the Qinggang sword', merit: 30 },
  { key: 'srank', zh: '無雙', en: 'Peerless', d: '任一關卡取得 S 評價', dEn: 'Earn an S rank', merit: 100 },
  { key: 'chaos', zh: '修羅', en: 'Asura', d: '修羅難度過關', dEn: 'Clear a stage on Chaos', merit: 150 },
];
const DIFF_MUL = { easy: 0.7, normal: 1, hard: 1.4, chaos: 1.9 };

export function createProgress(store) {
  const raw = store.get('meta', null) || {};
  const st = { merit: raw.merit | 0, total: raw.total | 0, up: { ...(raw.up || {}) }, ach: { ...(raw.ach || {}) } };
  const save = () => store.set('meta', st);
  const M = { st, fresh: [] };   // fresh: achievements unlocked since the UI last looked
  M.lvl = (k) => Math.min(st.up[k] | 0, UPGRADES.find((u) => u.key === k).max);
  M.cost = (k) => { const n = M.lvl(k); return n >= UPGRADES.find((u) => u.key === k).max ? null : COSTS[n]; };
  M.buy = (k) => { const c = M.cost(k); if (c == null || st.merit < c) return false; st.merit -= c; st.up[k] = M.lvl(k) + 1; save(); return true; };
  M.bonus = () => ({ hp: 1 + 0.08 * M.lvl('hp'), atk: 1 + 0.05 * M.lvl('atk'), def: 1 - 0.05 * M.lvl('def'), mus: 1 + 0.1 * M.lvl('mus'), start: 0.2 * M.lvl('start'), ride: 1 + 0.05 * M.lvl('horse') });
  M.has = (k) => !!st.ach[k];
  M.count = () => ACHS.filter((a) => st.ach[a.key]).length;
  M.unlock = (k) => {
    if (st.ach[k]) return null;
    const a = ACHS.find((q) => q.key === k); if (!a) return null;
    st.ach[k] = Date.now(); st.merit += a.merit; st.total += a.merit; M.fresh.push(a); save(); return a;
  };
  // merit for one battle: a tenth of the K.O. count, officers, a bonus for winning — scaled by difficulty
  M.runMerit = ({ ko, officers, win, diff }) => Math.round((ko / 10 + officers * 25 + (win ? 100 : 0)) * (DIFF_MUL[diff] || 1));
  M.award = (n) => { st.merit += n; st.total += n; save(); return n; };
  M.reset = () => { st.merit = 0; st.total = 0; st.up = {}; st.ach = {}; M.fresh.length = 0; save(); };
  return M;
}
