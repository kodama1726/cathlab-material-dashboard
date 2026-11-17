// シナリオ: A病院は償還対象材料の破棄・過剰使用が多く、他施設より材料コストが高い(模擬データ)。
// 使い方: node tools/add_waste_scenario.js data.js
//   実行順: rebuild_ablation_cases.js → add_2025_cases.js → add_device_benchmark.js → 本スクリプト
// - PCIと植込みデバイスの全症例に、確率的に「追加使用」「破棄・破損」の行を加える(アブレーションは対象外)。
//   PCI: ガイドワイヤー・バルーンを多く開封、マイクロカテーテルの追加、IVUSの追加使用、
//        サイズ違いのステント・バルーン・IVUSの開封後破棄
//   植込みデバイス: リードの破棄(長さ・固定不良)、CRTの左室リード留置困難による交換
// - 施設B〜Eは加工前の水準に固定する(recompute の anchorPeers、使用量係数も加工前のA病院基準に補正)。
const { load, save, recompute, makeRandom } = require('./recompute');
const dataPath = process.argv[2];
const D = load(dataPath);
if (D.meta.scenario === 'waste') throw new Error('waste scenario already applied');
const { chance, pick } = makeRandom(20251201);

const PCI = ['PCI（待機的）', 'PCI（緊急）'];
const PM = 'ペースメーカー移植術', ICD = '植込型除細動器移植術', CRT = '両心室ペースメーカー移植術';
const DEVICES = [PM, ICD, CRT];

// ---- 使用量指標(app.js の USAGE_INDICATORS と同じ定義) ----
const caseKey = (r) => r.date + '|' + r.procedure + '|' + (r.cid || '');
const inMat = (...m) => (r) => m.includes(r.material);
const INDICATORS = {
  stents: { procs: PCI, kind: 'count', match: inMat('冠動脈ステント（薬剤溶出型）') },
  balloons: { procs: PCI, kind: 'count', match: inMat('PTCAダイレーテーションカテーテル（一般型）', 'PTCAダイレーテーションカテーテル（高圧型）') },
  guidewires: { procs: PCI, kind: 'count', match: inMat('PTCAガイドワイヤー（標準型）', 'PTCAガイドワイヤー（貫通型）') },
  imaging: { procs: PCI, kind: 'rate', match: inMat('血管内超音波カテーテル', '血管内光干渉断層用カテーテル') },
  pmLeads: { procs: [PM], kind: 'count', match: inMat('ペースメーカ用リード') },
  icdLeads: { procs: [ICD], kind: 'count', match: (r) => /リード/.test(r.material) },
  discardsPci: { procs: PCI, kind: 'count', match: (r) => r.useType === '破棄破損' && r.price > 0 },
  discardsDevice: { procs: DEVICES, kind: 'count', match: (r) => r.useType === '破棄破損' && r.price > 0 }
};
function usage(ind) {
  const n = D.cases.filter(c => ind.procs.includes(c.procedure)).length;
  const rows = D.rawRows.filter(r => ind.procs.includes(r.procedure) && ind.match(r));
  if (ind.kind === 'count') return rows.length / n;
  return new Set(rows.map(caseKey)).size / n;
}
const before = Object.fromEntries(Object.entries(INDICATORS).map(([k, ind]) => [k, usage(ind)]));
const beforeA = JSON.parse(JSON.stringify(D.benchmark.facilities.A.procStats));

// ---- 製品マスタ ----
const master = {};
for (const r of D.rawRows) if (!master[r.code]) master[r.code] = { maker: r.maker, material: r.material, price: r.price };
const GW = ['10040001', '10040002'], NC = ['10020001', '10020002', '10020004'], SEMI = '10020003', MICRO = ['10050001', '10050002'];
const IVUS = ['10060001', '10060002'], DES = ['10010001', '10010002', '10010003', '10010004'];
const PM_LEADS = ['20000003', '20000004'], DF_LEADS = ['20000011', '20000012'], LV_LEADS = ['20000007', '20000008'];

// ---- 症例ごとに追加行を生成 ----
const cases = new Map();
for (const r of D.rawRows) if (PCI.includes(r.procedure) || DEVICES.includes(r.procedure)) { const k = caseKey(r); if (!cases.has(k)) cases.set(k, []); cases.get(k).push(r); }
const added = [];
const counts = {};
for (const rows of cases.values()) {
  const base = rows[0];
  const codesInCase = new Set(rows.map(r => r.code));
  const sameOr = (list) => pick(list.filter(c => codesInCase.has(c)).concat(list.filter(c => codesInCase.has(c)).length ? [] : list));
  const add = (code, discard, reason) => {
    const m = master[code];
    added.push({ date: base.date, ym: base.ym, dept: base.dept, stockType: '定数品', useType: discard ? '破棄破損' : '患者消費',
      maker: m.maker, material: m.material, price: m.price, procedure: base.procedure, code, ...(base.cid ? { cid: base.cid } : {}) });
    counts[reason] = (counts[reason] || 0) + 1;
  };
  if (PCI.includes(base.procedure)) {
    if (chance(0.55)) add(sameOr(GW), false, 'PCI ガイドワイヤー追加使用');
    if (chance(0.12)) add(sameOr(GW), true, 'PCI ガイドワイヤー破棄');
    if (chance(0.40)) add(sameOr(NC), false, 'PCI バルーン追加使用');
    if (chance(0.15)) add(chance(0.5) ? SEMI : sameOr(NC), true, 'PCI バルーン破棄(サイズ違い)');
    if (chance(0.10)) add(sameOr(DES), true, 'PCI ステント破棄(サイズ違い)');
    if (chance(0.15)) add(sameOr(MICRO), false, 'PCI マイクロカテーテル追加使用');
    if (chance(0.10)) add(sameOr(IVUS), false, 'PCI IVUS追加使用');
    if (chance(0.08)) add(sameOr(IVUS), true, 'PCI IVUS破棄');
  } else if (base.procedure === PM) {
    if (chance(0.25)) add(sameOr(PM_LEADS), true, 'PM リード破棄');
    if (chance(0.12)) add(sameOr(PM_LEADS), false, 'PM リード追加使用(入替)');
  } else if (base.procedure === ICD) {
    if (chance(0.25)) add(sameOr(DF_LEADS), true, 'ICD 除細動リード破棄');
  } else if (base.procedure === CRT) {
    if (chance(0.35)) add(sameOr(LV_LEADS), true, 'CRT 左室リード破棄(留置困難で交換)');
  }
}
D.rawRows = D.rawRows.concat(added);
D.meta.scenario = 'waste';

// 施設B〜Eの中央値を加工前のA病院の水準にそろえる(施設間の相対的なばらつきは維持)。
// 「A病院は本来は他施設並みで、破棄・過剰使用の分だけ高い」というシナリオにするため。アブレーションは対象外
const median = (a) => { const s = [...a].sort((x, y) => x - y); return (s[1] + s[2]) / 2; };
for (const p of [...PCI, ...DEVICES]) {
  for (const key of ['avgReimburse', 'avgItems']) {
    const med = median(['B', 'C', 'D', 'E'].map(k => D.benchmark.facilities[k].procStats[p][key] / beforeA[p][key]));
    for (const k of ['B', 'C', 'D', 'E']) D.benchmark.facilities[k].procStats[p][key] /= med;
  }
  for (const k of ['B', 'C', 'D', 'E']) { const s = D.benchmark.facilities[k].procStats[p]; s.totalReimburse = s.avgReimburse * s.nCases; }
}

recompute(D, { anchorPeers: true });

// 使用量係数を「加工前のA病院基準」に補正し、施設B〜Eの使用量を加工前の水準に固定する
const after = Object.fromEntries(Object.entries(INDICATORS).map(([k, ind]) => [k, usage(ind)]));
for (const k of ['B', 'C', 'D', 'E']) {
  const mult = D.benchmark.usageProfiles[k].mult;
  for (const key of Object.keys(INDICATORS)) if (mult[key] !== undefined && after[key]) mult[key] = mult[key] * before[key] / after[key];
}
save(dataPath, D);

console.log('added rows', added.length);
for (const [k, v] of Object.entries(counts)) console.log(' ', k, v);
for (const p of [...PCI, ...DEVICES]) {
  const b = beforeA[p].avgReimburse, a = D.benchmark.facilities.A.procStats[p].avgReimburse;
  console.log(p, Math.round(b), '->', Math.round(a), `(+${((a / b - 1) * 100).toFixed(1)}%)`);
}
for (const key of Object.keys(INDICATORS)) console.log(key, before[key].toFixed(3), '->', after[key].toFixed(3));
