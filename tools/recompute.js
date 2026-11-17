// data.js の派生集計(cases / meta / overview / benchmark / dealerMaker)を rawRows から再計算する共通処理。
// 施設B〜Eは「再計算前のA病院に対する比率」を維持して更新する。inventory は変更しない。
// 症例は 日付×処置内容×症例番号(cid、患者単位データのみ) で識別する。
const fs = require('fs');
const PREFIX = 'window.DASHBOARD_DATA = ';

function load(dataPath) {
  return JSON.parse(fs.readFileSync(dataPath, 'utf8').slice(PREFIX.length).replace(/;\s*$/, ''));
}
function save(dataPath, D) {
  fs.writeFileSync(dataPath, PREFIX + JSON.stringify(D) + ';');
}

function countBy(arr, key) {
  const m = new Map();
  for (const r of arr) m.set(r[key], (m.get(r[key]) || 0) + 1);
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function recompute(D) {
  const rows = D.rawRows;
  const PROCS = D.benchmark.procedures;

  // cases
  const caseMap = new Map();
  for (const r of rows) {
    const k = r.date + '|' + r.procedure + '|' + (r.cid || '');
    const c = caseMap.get(k) || { date: r.date, ym: r.ym, procedure: r.procedure, items: 0, reimburse: 0 };
    c.items++; c.reimburse += r.price;
    caseMap.set(k, c);
  }
  D.cases = [...caseMap.values()].sort((a, b) => a.date.localeCompare(b.date) || a.procedure.localeCompare(b.procedure));

  // meta(対象期間 dateFrom〜dateTo・spanDays はデータセットの定義値を維持)
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
    e[c.procedure]++; e._total++; e._reimburse += c.reimburse;
    monthMap.set(c.ym, e);
  }
  ov.monthlyByProc = [...monthMap.values()].sort((a, b) => a.ym.localeCompare(b.ym));

  // benchmark
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

  // dealerMaker(各施設の値の合計は維持したまま構成比のみ更新)
  const dm = D.dealerMaker;
  dm.makerBreakdown = ov.makerBreakdown.slice(0, dm.makerBreakdown.length);
  dm.topMakers = ov.makerBreakdown.slice(0, dm.topMakers.length).map(m => m.name);
  const byYmMaker = new Map();
  for (const r of rows) { const k = r.ym + '|' + r.maker; byYmMaker.set(k, (byYmMaker.get(k) || 0) + r.price); }
  dm.makerMonthly = ov.monthlyByProc.map(e => ({ ym: e.ym, ...Object.fromEntries(dm.topMakers.map(mk => [mk, byYmMaker.get(e.ym + '|' + mk) || 0])) }));
  const valueByMaker = new Map();
  for (const r of rows) valueByMaker.set(r.maker, (valueByMaker.get(r.maker) || 0) + r.price);
  const topVals = dm.topMakersForMatrix.map(mk => valueByMaker.get(mk) || 0);
  const topSum = topVals.reduce((s, v) => s + v, 0);
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
  const byCat = new Map();
  for (const r of rows) { if (!byCat.has(r.material)) byCat.set(r.material, []); byCat.get(r.material).push(r); }
  dm.categoryConcentration = [...byCat].map(([cat, cr]) => {
    const byMaker = new Map(); for (const r of cr) byMaker.set(r.maker, (byMaker.get(r.maker) || 0) + 1);
    const hhi = Math.round([...byMaker.values()].reduce((s, n) => s + (n / cr.length) ** 2, 0) * 10000);
    const top = [...byMaker].sort((a, b) => b[1] - a[1])[0];
    return { category: cat, count: cr.length, totalValue: cr.reduce((s, r) => s + r.price, 0), hhi, topMaker: top[0], topShare: +(top[1] / cr.length).toFixed(3) };
  }).filter(c => c.count >= 5).sort((a, b) => b.totalValue - a.totalValue);
}

// 固定シードの乱数(mulberry32)
function makeRandom(seed) {
  const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const chance = (p) => rand() < p;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const weighted = (entries) => { let x = rand() * entries.reduce((s, e) => s + e[1], 0); for (const [k, w] of entries) { if ((x -= w) < 0) return k; } return entries[entries.length - 1][0]; };
  return { rand, chance, pick, weighted };
}

module.exports = { load, save, recompute, makeRandom };
