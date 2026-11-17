// アブレーション症例(2024/10〜2026/03)を模擬的に追加し、PFA導入後の現実的なカテーテル構成を再現する。
// 使い方: node tools/augment_ablation_pfa.js data.js
// - 既存2023年のアブレーション症例日をテンプレートとして複製し、アブレーションカテーテルの方式を
//   四半期ごとの想定構成比(下記 MIX)で再割当てする。乱数は固定シードのため再実行しても同じ結果になる。
// - 派生集計(cases / overview / benchmark / dealerMaker)を再計算する。施設B〜Eは「A病院に対する比率」を保って再計算。
// - 在庫情報(inventory)は変更しない。
const fs = require('fs');
const dataPath = process.argv[2];
const PREFIX = 'window.DASHBOARD_DATA = ';
const src = fs.readFileSync(dataPath, 'utf8');
const D = JSON.parse(src.slice(PREFIX.length).replace(/;\s*$/, ''));
const ABL = '経皮的カテーテル心筋焼灼術';
const ABL_CAT = '心臓用カテーテル(アブレーション用)';
if (D.rawRows.some(r => r.procedure === ABL && r.date >= '20241001')) throw new Error('already augmented');

// ---- 乱数(mulberry32、固定シード) ----
let seed = 20241005;
function rand() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function weighted(entries) { let x = rand() * entries.reduce((s, e) => s + e[1], 0); for (const [k, w] of entries) { if ((x -= w) < 0) return k; } return entries[entries.length - 1][0]; }

// ---- 追加する製品(償還価格は本データセット内の価格水準に合わせた模擬値) ----
const NEW_PRODUCTS = {
  '10000021': { name: 'パルスフィールドアブレーションカテーテル (FARAPULSE)', spec: '31mm, 5スプライン', maker: 'ボストン・サイエンティフィック', material: ABL_CAT, price: 380000 },
  '10000022': { name: 'パルスフィールドアブレーションカテーテル (VARIPULSE)', spec: '35mm, 可変ループ', maker: 'ジョンソン・エンド・ジョンソン', material: ABL_CAT, price: 380000 },
  '10000023': { name: 'ホットバルーンカテーテル (SATAKE・HotBalloon)', spec: '26-33mm', maker: '東レ', material: ABL_CAT, price: 300000 },
  '10000024': { name: 'ステアラブルシース (FARADRIVE)', spec: '13Fr', maker: 'ボストン・サイエンティフィック', material: 'ガイディングカテーテル(心臓用)', price: 38000 }
};
const CODE = { RF_TACTI: '10000004', RF_STC: '10000001', CRYO: '10000011', PFA_FARA: '10000021', PFA_VARI: '10000022', HOT: '10000023', AGILIS: '10000003', FARADRIVE: '10000024', ACHIEVE: '10000012' };
const PRICE = { [CODE.RF_TACTI]: 250000, [CODE.RF_STC]: 250000, [CODE.CRYO]: 320000 };
const MAKER = { [CODE.RF_TACTI]: 'アボットメディカルジャパン', [CODE.RF_STC]: 'ジョンソン・エンド・ジョンソン', [CODE.CRYO]: 'メドトロニック' };
for (const [code, p] of Object.entries(NEW_PRODUCTS)) { D.products[code] = { name: p.name, spec: p.spec }; PRICE[code] = p.price; MAKER[code] = p.maker; }

// ---- 四半期ごとの方式構成比(PFA, RF, クライオ, ホットバルーン) ----
// 国内でのPFA導入(2024年後半)以降、心房細動の肺静脈隔離でPFAが急速に拡大し、
// クライオは縮小、RFは非心房細動(PSVT・VT等)や追加焼灼で一定割合が残る、という想定。
const MIX = {
  '2024Q4': [0.20, 0.50, 0.27, 0.03], '2025Q1': [0.35, 0.42, 0.20, 0.03], '2025Q2': [0.45, 0.38, 0.14, 0.03],
  '2025Q3': [0.50, 0.36, 0.11, 0.03], '2025Q4': [0.55, 0.34, 0.08, 0.03], '2026Q1': [0.58, 0.33, 0.07, 0.02]
};
const quarterOf = (ym) => ym.slice(0, 4) + 'Q' + Math.ceil(+ym.slice(4, 6) / 3);

// ---- テンプレート(2023年のアブレーション症例日) ----
const tplByDate = new Map();
for (const r of D.rawRows) if (r.procedure === ABL) { if (!tplByDate.has(r.date)) tplByDate.set(r.date, []); tplByDate.get(r.date).push(r); }
const templates = [...tplByDate.values()];

// ---- 症例日の生成 ----
const months = [];
for (let y = 2024, m = 10; y * 100 + m <= 202603; m === 12 ? (y++, m = 1) : m++) months.push(`${y}${String(m).padStart(2, '0')}`);
const newRows = [];
for (const ym of months) {
  const nDays = weighted([[2, 0.15], [3, 0.35], [4, 0.35], [5, 0.15]]);
  const y = +ym.slice(0, 4), m = +ym.slice(4, 6);
  const last = new Date(y, m, 0).getDate();
  const weekdays = [];
  for (let d = 1; d <= last; d++) { const w = new Date(y, m - 1, d).getDay(); if (w !== 0 && w !== 6) weekdays.push(d); }
  const days = [];
  while (days.length < nDays) { const d = pick(weekdays); if (!days.includes(d)) days.push(d); }
  const mix = MIX[quarterOf(ym)];
  for (const d of days.sort((a, b) => a - b)) {
    const date = `${ym}${String(d).padStart(2, '0')}`;
    const rows = pick(templates).map(r => ({ ...r, date, ym }));
    // アブレーションカテーテルの方式を再割当て
    let nFara = 0, nCryo = 0;
    for (const r of rows) {
      if (r.material !== ABL_CAT) continue;
      const mod = weighted([['PFA', mix[0]], ['RF', mix[1]], ['CRYO', mix[2]], ['HOT', mix[3]]]);
      r.code = mod === 'PFA' ? weighted([[CODE.PFA_FARA, 0.75], [CODE.PFA_VARI, 0.25]])
        : mod === 'RF' ? pick([CODE.RF_TACTI, CODE.RF_STC])
        : mod === 'CRYO' ? CODE.CRYO : CODE.HOT;
      if (r.code === CODE.PFA_FARA) nFara++;
      if (r.code === CODE.CRYO) nCryo++;
    }
    // FARAPULSEは専用シース(FARADRIVE)を使用 → 同数のAgilisを置換
    for (const r of rows) if (nFara > 0 && r.code === CODE.AGILIS) { r.code = CODE.FARADRIVE; nFara--; }
    // 円状マッピング(Achieve)はクライオの付属用途 → クライオ本数を超える分は使用しない
    let keepAchieve = nCryo;
    const kept = rows.filter(r => r.code !== CODE.ACHIEVE || keepAchieve-- > 0);
    for (const r of kept) if (PRICE[r.code] !== undefined) { r.price = PRICE[r.code]; r.maker = MAKER[r.code]; }
    newRows.push(...kept);
  }
}
D.rawRows = D.rawRows.concat(newRows);

// ================= 派生集計の再計算 =================
const rows = D.rawRows;
function countBy(arr, key) { const m = new Map(); for (const r of arr) m.set(r[key], (m.get(r[key]) || 0) + 1); return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count); }
const PROCS = D.benchmark.procedures;

// cases(日付×処置)
const caseMap = new Map();
for (const r of rows) { const k = r.date + '|' + r.procedure; const c = caseMap.get(k) || { date: r.date, ym: r.ym, procedure: r.procedure, items: 0, reimburse: 0 }; c.items++; c.reimburse += r.price; caseMap.set(k, c); }
const oldKeys = new Set(D.cases.map(c => c.date + '|' + c.procedure));
D.cases = D.cases.map(c => caseMap.get(c.date + '|' + c.procedure)).concat([...caseMap.entries()].filter(([k]) => !oldKeys.has(k)).map(([, c]) => c));

// meta
D.meta.totalRows = rows.length;
D.meta.totalCases = D.cases.length;
D.meta.generatedAt = new Date().toISOString();

// overview
const ov = D.overview;
ov.procBreakdown = countBy(rows, 'procedure');
ov.makerBreakdown = countBy(rows, 'maker');
ov.materialBreakdown = countBy(rows, 'material');
ov.stockTypeBreakdown = countBy(rows, 'stockType');
ov.useTypeBreakdown = countBy(rows, 'useType');
ov.deptBreakdown = countBy(rows, 'dept');
ov.totalReimburse = rows.reduce((s, r) => s + r.price, 0);
const monthMap = new Map();
for (const c of D.cases) {
  const e = monthMap.get(c.ym) || { ym: c.ym, ...Object.fromEntries(PROCS.map(p => [p, 0])), _total: 0, _reimburse: 0 };
  e[c.procedure]++; e._total++; e._reimburse += c.reimburse; monthMap.set(c.ym, e);
}
ov.monthlyByProc = [...monthMap.values()].sort((a, b) => a.ym.localeCompare(b.ym));

// benchmark: A病院を再計算し、B〜Eは旧A病院に対する比率を維持
const years = D.meta.spanDays / 365;
const facA = D.benchmark.facilities.A;
const oldA = JSON.parse(JSON.stringify(facA.procStats));
facA.annualCases = Math.round(D.cases.length / years);
facA.note = '本データベースの値(模擬データ)';
for (const p of PROCS) {
  const cs = D.cases.filter(c => c.procedure === p);
  facA.procShare[p] = cs.length / D.cases.length;
  const nCases = cs.length / years;
  const avgItems = cs.reduce((s, c) => s + c.items, 0) / cs.length;
  const avgReimburse = cs.reduce((s, c) => s + c.reimburse, 0) / cs.length;
  facA.procStats[p] = { nCases, avgItems, avgReimburse, totalReimburse: avgReimburse * nCases };
}
for (const k of ['B', 'C', 'D', 'E']) {
  const f = D.benchmark.facilities[k];
  for (const p of PROCS) {
    const s = f.procStats[p];
    s.avgItems = s.avgItems / oldA[p].avgItems * facA.procStats[p].avgItems;
    s.avgReimburse = s.avgReimburse / oldA[p].avgReimburse * facA.procStats[p].avgReimburse;
    s.totalReimburse = s.avgReimburse * s.nCases;
  }
}
const vec = (f) => PROCS.map(p => f.procShare[p]);
const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0) / Math.hypot(...a) / Math.hypot(...b);
for (const k of ['B', 'C', 'D', 'E']) D.benchmark.similarity[k] = cosine(vec(facA), vec(D.benchmark.facilities[k]));

// dealerMaker
const dm = D.dealerMaker;
dm.makerBreakdown = ov.makerBreakdown.slice(0, dm.makerBreakdown.length);
dm.topMakers = ov.makerBreakdown.slice(0, dm.topMakers.length).map(m => m.name);
const ymList = ov.monthlyByProc.map(e => e.ym);
dm.makerMonthly = ymList.map(ym => ({ ym, ...Object.fromEntries(dm.topMakers.map(mk => [mk, rows.filter(r => r.ym === ym && r.maker === mk).reduce((s, r) => s + r.price, 0)])) }));
const valueOf = (mk) => rows.filter(r => r.maker === mk).reduce((s, r) => s + r.price, 0);
const topVals = dm.topMakersForMatrix.map(valueOf);
const topSum = topVals.reduce((s, v) => s + v, 0);
// 各施設の値の合計(元データでは1未満)は維持したまま、構成比のみ更新する
const oldPenA = { ...dm.makerPenetration.A };
const penSum = (k) => dm.topMakersForMatrix.reduce((s, mk) => s + dm.makerPenetration[k][mk], 0);
const sumA = penSum('A');
dm.makerPenetration.A = Object.fromEntries(dm.topMakersForMatrix.map((mk, i) => [mk, topVals[i] / topSum * sumA]));
for (const k of ['B', 'C', 'D', 'E']) {
  const target = penSum(k);
  const raw = dm.topMakersForMatrix.map(mk => dm.makerPenetration[k][mk] / oldPenA[mk] * dm.makerPenetration.A[mk]);
  const sum = raw.reduce((s, v) => s + v, 0);
  dm.makerPenetration[k] = Object.fromEntries(dm.topMakersForMatrix.map((mk, i) => [mk, raw[i] / sum * target]));
}
dm.categoryConcentration = [...new Set(rows.map(r => r.material))].map(cat => {
  const cr = rows.filter(r => r.material === cat);
  const byMaker = new Map(); for (const r of cr) byMaker.set(r.maker, (byMaker.get(r.maker) || 0) + 1);
  const hhi = Math.round([...byMaker.values()].reduce((s, n) => s + (n / cr.length) ** 2, 0) * 10000);
  const top = [...byMaker].sort((a, b) => b[1] - a[1])[0];
  return { category: cat, count: cr.length, totalValue: cr.reduce((s, r) => s + r.price, 0), hhi, topMaker: top[0], topShare: +(top[1] / cr.length).toFixed(3) };
}).filter(c => c.count >= 5).sort((a, b) => b.totalValue - a.totalValue);

fs.writeFileSync(dataPath, PREFIX + JSON.stringify(D) + ';');
const added = new Map(); for (const r of newRows) if (r.material === ABL_CAT) { const n = D.products[r.code].name; added.set(n, (added.get(n) || 0) + 1); }
console.log('added rows', newRows.length, 'case-days', new Set(newRows.map(r => r.date)).size);
console.log([...added].map(x => x.join(': ')).join('\n'));
