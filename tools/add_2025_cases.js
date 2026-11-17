// 2025年(1〜12月)のPCI(待機的・緊急)・ペースメーカー・ICD・CRT-P症例を患者単位で追加する(模擬データ)。
// 使い方: node tools/add_2025_cases.js data.js
// - アブレーションの2025年分は rebuild_ablation_cases.js で生成済みのため対象外。
// - 1症例=患者1人。同日に複数症例があるため、追加行には症例番号(cid)を付与する。
// - PCIの特定保険医療材料は病変・手技に応じて構成し、それ以外の消耗品は2026年の同種PCI症例から複製する。
// - 植込みデバイスは本体とリードのメーカーを揃え、経静脈/リードレス/皮下植込型(S-ICD)を含める。
// - 乱数は固定シードのため再実行しても同じ結果になる。追加製品の償還価格は本データセットの価格水準に合わせた模擬値。
const { load, save, recompute, makeRandom } = require('./recompute');
const dataPath = process.argv[2];
const D = load(dataPath);
const { chance, pick, weighted } = makeRandom(20250101);
const ABL = '経皮的カテーテル心筋焼灼術';
const PCI_E = 'PCI（待機的）', PCI_U = 'PCI（緊急）', PM = 'ペースメーカー移植術', ICD = '植込型除細動器移植術', CRT = '両心室ペースメーカー移植術';
if (D.rawRows.some(r => r.date.startsWith('2025') && r.procedure !== ABL)) throw new Error('2025 cases already added');

// ---- 製品マスタ ----
const master = {};
for (const r of D.rawRows) if (!master[r.code]) master[r.code] = { maker: r.maker, material: r.material, price: r.price };
const ADD = {
  '20000013': { name: 'ペースメーカ (Azure S SR MRI)', spec: 'シングルチャンバ', maker: 'メドトロニック', material: 'ペースメーカ', price: 650000 },
  '20000014': { name: 'リードレスペースメーカ (Micra AV2)', spec: 'リードレス', maker: 'メドトロニック', material: 'ペースメーカ', price: 1500000 },
  '20000015': { name: '皮下植込型除細動器 (EMBLEM MRI S-ICD)', spec: '皮下植込型', maker: 'ボストン・サイエンティフィック', material: '植込型除細動器', price: 3000000 },
  '20000016': { name: '皮下植込型除細動器用電極 (EMBLEM S-ICD)', spec: '45cm', maker: 'ボストン・サイエンティフィック', material: '植込型除細動器用リード', price: 400000 }
};
for (const [code, p] of Object.entries(ADD)) { D.products[code] = { name: p.name, spec: p.spec }; master[code] = { maker: p.maker, material: p.material, price: p.price }; }

const C = {
  // PCI
  DES_RESOLUTE: '10010001', DES_ULTIMASTER: '10010002', DES_XIENCE: '10010003', DES_SYNERGY: '10010004',
  NC_ACCUFORCE: '10020001', NC_SAPPHIRE: '10020002', SEMI_RAIJIN: '10020003', NC_EUPHORA: '10020004',
  GC_HEARTRAIL: '10030001', GC_HYPERION: '10030002', GC_LAUNCHER: '10030003',
  GW_RUNTHROUGH: '10040001', GW_SION: '10040002', GW_MIRACLE: '10040003',
  MC_CORSAIR: '10050001', MC_FINECROSS: '10050002',
  IVUS_OPTICROSS: '10060001', IVUS_ALTAVIEW: '10060002', OCT_DRAGONFLY: '10060003',
  SH_RADIFOCUS: '10070001', SH_GLIDESHEATH: '10070002', HEM_ANGIOSEAL: '10080001', HEM_PERCLOSE: '10080002',
  ROTA_150: '10090001', ROTA_175: '10090002', DCA_HUNTER: '10100001',
  // デバイス
  PM_AZURE: '20000001', PM_ASSURITY: '20000002', LEAD_CAPSURE: '20000003', LEAD_TENDRIL: '20000004',
  CRT_PERCEPTA: '20000005', CRT_QUADRA: '20000006', LV_ATTAIN: '20000007', LV_QUARTET: '20000008',
  ICD_EVERA: '20000009', ICD_RESONATE: '20000010', DF_SPRINT: '20000011', DF_RELIANCE: '20000012',
  PM_AZURE_SR: '20000013', PM_MICRA: '20000014', SICD_EMBLEM: '20000015', SICD_ELECTRODE: '20000016',
  PEEL7: '30000001', PEEL9: '30000002', JWIRE: '30000003', NEEDLE: '30000004', SCALPEL: '30000005', SILK: '30000006', VICRYL: '30000007',
  SYR_LOCK: '30000008', SYR5: '30000009', EXT: '30000010', STOPCOCK: '30000011', GAUZE: '30000012', DRAPE: '30000013', SPATULA: '30000014', ESU: '30000015'
};
for (const code of Object.values(C)) if (!master[code]) throw new Error('missing product ' + code);

// ---- PCI ----
const desBrand = () => weighted([[C.DES_ULTIMASTER, 0.3], [C.DES_RESOLUTE, 0.3], [C.DES_XIENCE, 0.25], [C.DES_SYNERGY, 0.15]]);
const ncBalloon = () => pick([C.NC_ACCUFORCE, C.NC_SAPPHIRE, C.NC_EUPHORA]);
function buildPci(emergency) {
  const it = [];
  const add = (code, n = 1) => { for (let i = 0; i < n; i++) it.push(code); };
  const radial = chance(emergency ? 0.7 : 0.8);
  add(pick([C.SH_RADIFOCUS, C.SH_GLIDESHEATH]));
  if (!radial && chance(0.7)) add(pick([C.HEM_ANGIOSEAL, C.HEM_PERCLOSE]));
  add(pick([C.GC_HEARTRAIL, C.GC_HYPERION, C.GC_LAUNCHER]), chance(0.05) ? 2 : 1);
  add(pick([C.GW_SION, C.GW_RUNTHROUGH]), 1 + (chance(0.5) ? 1 : 0) + (chance(0.15) ? 1 : 0)); // 分岐部・多枝ではバディワイヤー等を追加
  const cto = !emergency && chance(0.08);
  if (cto) { add(C.GW_MIRACLE); add(pick([C.MC_CORSAIR, C.MC_FINECROSS])); }
  else if (chance(emergency ? 0.05 : 0.12)) add(pick([C.MC_CORSAIR, C.MC_FINECROSS]));
  const img = weighted(emergency ? [['ivus', 0.7], ['oct', 0.12], ['none', 0.18]] : [['ivus', 0.72], ['oct', 0.2], ['none', 0.08]]);
  if (img === 'ivus') add(pick([C.IVUS_OPTICROSS, C.IVUS_ALTAVIEW])); else if (img === 'oct') add(C.OCT_DRAGONFLY);
  if (!emergency && chance(0.05)) add(weighted([[C.ROTA_150, 0.6], [C.ROTA_175, 0.4]])); // 高度石灰化
  if (!emergency && chance(0.015)) add(C.DCA_HUNTER);
  if (chance(0.85)) add(C.SEMI_RAIJIN, chance(0.25) ? 2 : 1); // 前拡張
  const nStent = weighted(emergency ? [[0, 0.05], [1, 0.65], [2, 0.27], [3, 0.03]] : [[0, 0.05], [1, 0.55], [2, 0.32], [3, 0.08]]);
  add(desBrand(), nStent);
  if (nStent > 0) { if (chance(emergency ? 0.8 : 0.9)) add(ncBalloon(), chance(0.3) ? 2 : 1); } // 後拡張
  else add(ncBalloon()); // バルーン拡張のみ
  return it;
}

// ---- 植込みデバイス ----
function surgicalKit(add) {
  add(C.SCALPEL); add(C.ESU); add(C.VICRYL, 2); add(C.SILK); add(C.DRAPE); add(C.GAUZE, chance(0.5) ? 3 : 2);
  add(C.SYR_LOCK); add(C.SYR5); add(C.EXT); add(C.STOPCOCK); add(C.SPATULA);
}
function buildPm() {
  const it = []; const add = (code, n = 1) => { for (let i = 0; i < n; i++) it.push(code); };
  const type = weighted([['dual', 0.75], ['single', 0.13], ['leadless', 0.12]]);
  if (type === 'leadless') { // 大腿静脈アプローチ、ポケット作成なし
    add(C.PM_MICRA); add(C.NEEDLE); add(C.JWIRE); add(C.SILK); add(C.DRAPE); add(C.GAUZE, 2); add(C.SYR_LOCK, 2); add(C.EXT); add(C.STOPCOCK);
    return it;
  }
  if (type === 'single') { add(C.PM_AZURE_SR); add(C.LEAD_CAPSURE); add(C.PEEL7); add(C.NEEDLE); add(C.JWIRE); }
  else {
    const mdt = chance(0.5);
    add(mdt ? C.PM_AZURE : C.PM_ASSURITY); add(mdt ? C.LEAD_CAPSURE : C.LEAD_TENDRIL, 2);
    add(C.PEEL7, 2); add(C.NEEDLE, chance(0.5) ? 2 : 1); add(C.JWIRE, 2);
  }
  surgicalKit(add);
  return it;
}
function buildIcd() {
  const it = []; const add = (code, n = 1) => { for (let i = 0; i < n; i++) it.push(code); };
  const type = weighted([['sicd', 0.2], ['single', 0.5], ['dual', 0.3]]);
  if (type === 'sicd') { add(C.SICD_EMBLEM); add(C.SICD_ELECTRODE); }
  else if (type === 'single') { add(C.ICD_EVERA); add(C.DF_SPRINT); add(C.PEEL9); add(C.NEEDLE); add(C.JWIRE); }
  else { add(C.ICD_RESONATE); add(C.DF_RELIANCE); add(C.LEAD_CAPSURE); add(C.PEEL9); add(C.PEEL7); add(C.NEEDLE, 2); add(C.JWIRE, 2); }
  surgicalKit(add);
  return it;
}
function buildCrt() {
  const it = []; const add = (code, n = 1) => { for (let i = 0; i < n; i++) it.push(code); };
  const mdt = chance(0.5);
  add(mdt ? C.CRT_PERCEPTA : C.CRT_QUADRA); add(mdt ? C.LV_ATTAIN : C.LV_QUARTET); add(mdt ? C.LEAD_CAPSURE : C.LEAD_TENDRIL, 2);
  add(C.PEEL9); add(C.PEEL7, 2); add(C.NEEDLE, 2); add(C.JWIRE, 3);
  surgicalKit(add);
  return it;
}

// ---- PCIの特定保険医療材料以外の消耗品(2026年の同種症例から複製) ----
const nonReimbTemplates = {};
for (const proc of [PCI_E, PCI_U]) {
  const byDate = new Map();
  for (const r of D.rawRows) if (r.procedure === proc && r.material === '特定保険医療材料以外の消耗品') { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); }
  nonReimbTemplates[proc] = [...byDate.values()];
}

// ---- 症例日の生成 ----
const PLAN = [
  { proc: PCI_E, perMonth: [[15, 0.15], [17, 0.25], [19, 0.3], [21, 0.2], [23, 0.1]], weekdaysOnly: true, build: () => buildPci(false) },
  { proc: PCI_U, perMonth: [[3, 0.2], [4, 0.3], [5, 0.3], [6, 0.2]], weekdaysOnly: false, build: () => buildPci(true) },
  { proc: PM, perMonth: [[3, 0.25], [4, 0.35], [5, 0.25], [6, 0.15]], weekdaysOnly: true, build: buildPm },
  { proc: ICD, perMonth: [[1, 0.4], [2, 0.45], [3, 0.15]], weekdaysOnly: true, build: buildIcd },
  { proc: CRT, perMonth: [[0, 0.5], [1, 0.4], [2, 0.1]], weekdaysOnly: true, build: buildCrt }
];
const newRows = [];
let seq = 0;
for (let m = 1; m <= 12; m++) {
  const ym = `2025${String(m).padStart(2, '0')}`;
  const last = new Date(2025, m, 0).getDate();
  const days = [];
  for (let d = 1; d <= last; d++) days.push({ date: `${ym}${String(d).padStart(2, '0')}`, weekday: ![0, 6].includes(new Date(2025, m - 1, d).getDay()) });
  for (const plan of PLAN) {
    const n = weighted(plan.perMonth);
    const pool = days.filter(d => d.weekday || !plan.weekdaysOnly);
    for (let i = 0; i < n; i++) {
      const date = pick(pool).date;
      const cid = `C25-${String(++seq).padStart(4, '0')}`;
      const dept = chance(0.03) ? 'その他' : '循環器内科';
      for (const code of plan.build()) {
        const pm = master[code];
        newRows.push({
          date, ym, dept,
          stockType: weighted(pm.price >= 100000 ? [['定数品', 0.62], ['持ち込み品', 0.32], ['緊急使用', 0.06]] : [['定数品', 0.86], ['持ち込み品', 0.09], ['緊急使用', 0.05]]),
          useType: chance(pm.price >= 100000 ? 0.004 : 0.015) ? '破棄破損' : '患者消費',
          maker: pm.maker, material: pm.material, price: pm.price, procedure: plan.proc, code, cid
        });
      }
      if (nonReimbTemplates[plan.proc]) {
        for (const t of pick(nonReimbTemplates[plan.proc])) newRows.push({ ...t, date, ym, dept, cid });
      }
    }
  }
}
D.rawRows = D.rawRows.concat(newRows);
recompute(D);
save(dataPath, D);

const by = new Map();
for (const c of D.cases.filter(c => c.date.startsWith('2025'))) {
  const e = by.get(c.procedure) || { n: 0, items: 0, re: 0 };
  e.n++; e.items += c.items; e.re += c.reimburse; by.set(c.procedure, e);
}
console.log('added rows', newRows.length);
for (const [p, e] of by) console.log(p, 'cases', e.n, 'avgItems', (e.items / e.n).toFixed(1), 'avgReimburse', Math.round(e.re / e.n));
