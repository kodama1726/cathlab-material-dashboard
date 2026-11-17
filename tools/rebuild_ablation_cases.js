// アブレーション症例を「1症例日=患者1人」の現実的なカテーテル構成で作り直す(模擬データ)。
// 使い方: node tools/rebuild_ablation_cases.js data.js
// - data.js 内の経皮的カテーテル心筋焼灼術の行をすべて削除し、2023/01〜2026/03 の症例を再生成する。
// - 症例ごとに適応(心房細動/発作性上室頻拍/心房粗動/心室頻拍・期外収縮)と治療方式を決め、
//   方式・3Dマッピングシステムに対応したカテーテル一式を割り当てる。治療用カテーテルは1本が基本で、
//   バルーン/PFAの一部症例のみ高周波カテーテルで追加焼灼(タッチアップ)を行う。
// - 派生集計(cases / overview / benchmark / dealerMaker)を再計算する。施設B〜Eは「A病院に対する比率」を維持。
// - 乱数は固定シードのため再実行しても同じ結果になる。在庫情報(inventory)は変更しない。
const { load, save, recompute, makeRandom } = require('./recompute');
const dataPath = process.argv[2];
const D = load(dataPath);
const ABL = '経皮的カテーテル心筋焼灼術';
const { chance, pick, weighted } = makeRandom(20230108);

// ---- 製品マスタ(既存行から取得+追加製品。追加製品の償還価格は本データセットの価格水準に合わせた模擬値) ----
const master = {};
for (const r of D.rawRows) if (!master[r.code]) master[r.code] = { maker: r.maker, material: r.material, price: r.price };
const ADD = {
  '10000021': { name: 'パルスフィールドアブレーションカテーテル (FARAPULSE)', spec: '31mm, 5スプライン', maker: 'ボストン・サイエンティフィック', material: '心臓用カテーテル(アブレーション用)', price: 380000 },
  '10000022': { name: 'パルスフィールドアブレーションカテーテル (VARIPULSE)', spec: '35mm, 可変ループ', maker: 'ジョンソン・エンド・ジョンソン', material: '心臓用カテーテル(アブレーション用)', price: 380000 },
  '10000023': { name: 'ホットバルーンカテーテル (SATAKE・HotBalloon)', spec: '26-33mm', maker: '東レ', material: '心臓用カテーテル(アブレーション用)', price: 300000 },
  '10000024': { name: 'ステアラブルシース (FARADRIVE)', spec: '13Fr', maker: 'ボストン・サイエンティフィック', material: 'ガイディングカテーテル(心臓用)', price: 38000 },
  '10000025': { name: 'マッピングカテーテル (Advisor HD Grid)', spec: '16極, グリッド型', maker: 'アボットメディカルジャパン', material: '心臓用カテーテル(診断用 複数電極)', price: 150000 },
  '10000026': { name: 'ステアラブルシース (FlexCath Advance)', spec: '12Fr', maker: 'メドトロニック', material: 'ガイディングカテーテル(心臓用)', price: 38000 }
};
for (const [code, p] of Object.entries(ADD)) { D.products[code] = { name: p.name, spec: p.spec }; master[code] = { maker: p.maker, material: p.material, price: p.price }; }

const P = {
  STC: '10000001', PENTARAY: '10000002', AGILIS: '10000003', TACTI: '10000004', BRK: '10000005', ICE: '10000006', INQUIRY: '10000007',
  PERCLOSE: '10000008', ORION: '10000009', PRELUDE: '10000010', CRYO: '10000011', ACHIEVE: '10000012', FASTCATH: '10000013', DECANAV: '10000014',
  NEEDLE: '10000015', EXT: '10000016', STOPCOCK: '10000017', SYRINGE: '10000018', PADS: '10000019', PLINE: '10000020',
  FARA: '10000021', VARI: '10000022', HOT: '10000023', FARADRIVE: '10000024', HDGRID: '10000025', FLEXCATH: '10000026'
};
for (const code of Object.values(P)) if (!master[code]) throw new Error('missing product ' + code);

// ---- 3Dマッピングシステム別の診断カテーテル ----
// CARTO(J&J): ThermoCool SmartTouch + PentaRay(高密度) + DecaNav(冠静脈洞)
// EnSite(Abbott): TactiCath + Advisor HD Grid(高密度) + Inquiry(冠静脈洞)
const SYS = {
  carto: { rf: P.STC, hd: P.PENTARAY, cs: P.DECANAV },
  ensite: { rf: P.TACTI, hd: P.HDGRID, cs: P.INQUIRY }
};

// ---- 心房細動の治療方式構成(四半期ごと: PFA, RF, クライオ, ホットバルーン) ----
// PFA国内導入(2024年後半)以降に急拡大、クライオは縮小、という想定
function afMix(q) {
  const T = {
    '2024Q4': [0.20, 0.42, 0.34, 0.04], '2025Q1': [0.35, 0.36, 0.25, 0.04], '2025Q2': [0.45, 0.32, 0.19, 0.04],
    '2025Q3': [0.55, 0.28, 0.14, 0.03], '2025Q4': [0.60, 0.26, 0.11, 0.03], '2026Q1': [0.65, 0.24, 0.08, 0.03]
  };
  return T[q] || [0, 0.55, 0.40, 0.05];
}
const quarterOf = (ym) => ym.slice(0, 4) + 'Q' + Math.ceil(+ym.slice(4, 6) / 3);

// ---- 1症例分のカテーテル構成 ----
function buildCase(ym) {
  const items = [];
  const add = (code, n = 1) => { for (let i = 0; i < n; i++) items.push(code); };
  const indication = weighted([['AF', 0.72], ['PSVT', 0.14], ['AFL', 0.07], ['VT', 0.07]]);
  const sys = SYS[weighted([['carto', 0.55], ['ensite', 0.45]])];
  let modality = 'RF';
  let transseptal = false;

  if (indication === 'AF') {
    const mix = afMix(quarterOf(ym));
    modality = weighted([['PFA', mix[0]], ['RF', mix[1]], ['CRYO', mix[2]], ['HOT', mix[3]]]);
    transseptal = true;
    add(P.BRK, modality === 'RF' && chance(0.5) ? 2 : 1); // RFは2本のシースで中隔穿刺を2回行うことがある
    if (modality === 'RF') {
      add(sys.rf); add(sys.hd); add(sys.cs); add(P.AGILIS);
    } else if (modality === 'CRYO') {
      add(P.CRYO); add(P.ACHIEVE); add(P.FLEXCATH); add(sys.cs);
      if (chance(0.15)) { add(sys.rf); add(sys.hd); } // 隔離不十分部位・三尖弁輪-下大静脈間の追加焼灼
    } else if (modality === 'HOT') {
      add(P.HOT); add(sys.cs); add(P.AGILIS);
      if (chance(0.2)) { add(sys.rf); add(sys.hd); }
    } else { // PFA
      if (weighted([['fara', 0.7], ['vari', 0.3]]) === 'fara') {
        add(P.FARA); add(P.FARADRIVE);
        if (chance(0.7)) add(sys.cs);
        if (chance(0.3)) add(P.ORION); // 隔離確認のための電位マッピング
      } else {
        add(P.VARI); add(P.AGILIS); add(SYS.carto.cs);
        if (chance(0.3)) add(SYS.carto.hd);
      }
      if (chance(0.08)) { add(sys.rf); if (!items.includes(sys.hd)) add(sys.hd); }
    }
    if (chance(0.4)) add(P.ICE);
  } else if (indication === 'PSVT') {
    add(sys.rf); add(sys.cs, chance(0.5) ? 3 : 2); // 高位右房・ヒス束・右室・冠静脈洞に診断カテーテルを留置
    if (chance(0.3)) { transseptal = true; add(P.BRK); add(P.AGILIS); } // 左側副伝導路
  } else if (indication === 'AFL') {
    add(sys.rf); add(sys.cs, 2);
    if (chance(0.3)) add(sys.hd);
  } else { // VT/PVC
    add(sys.rf); add(sys.hd); add(sys.cs, 2);
    if (chance(0.6)) add(P.ICE);
    if (chance(0.3)) { transseptal = true; add(P.BRK); add(P.AGILIS); }
  }

  // 共通材料(穿刺・シース・ライン類)
  const sheaths = (transseptal ? 2 : 1) + (chance(0.5) ? 1 : 0);
  for (let i = 0; i < sheaths; i++) add(chance(0.6) ? P.PRELUDE : P.FASTCATH);
  add(P.NEEDLE); add(P.STOPCOCK, chance(0.5) ? 3 : 2); add(P.EXT); add(P.SYRINGE, 2); add(P.PLINE); add(P.PADS);
  if (transseptal && chance(0.4)) add(P.PERCLOSE);
  return { items, indication, modality };
}

// ---- 症例日の生成(2023/01〜2026/03、1症例日=患者1人) ----
const dateFrom = D.meta.dateFrom.replace(/-/g, '');
const months = [];
for (let y = 2023, m = 1; y * 100 + m <= 202603; m === 12 ? (y++, m = 1) : m++) months.push(`${y}${String(m).padStart(2, '0')}`);
const newRows = [];
const summary = new Map();
for (const ym of months) {
  const y = +ym.slice(0, 4), m = +ym.slice(4, 6);
  const last = new Date(y, m, 0).getDate();
  const weekdays = [];
  for (let d = 1; d <= last; d++) {
    const w = new Date(y, m - 1, d).getDay();
    const date = `${ym}${String(d).padStart(2, '0')}`;
    if (w !== 0 && w !== 6 && date >= dateFrom) weekdays.push(date);
  }
  const nCases = Math.min(weekdays.length, weighted([[2, 0.25], [3, 0.45], [4, 0.3]]));
  const dates = [];
  while (dates.length < nCases) { const d = pick(weekdays); if (!dates.includes(d)) dates.push(d); }
  for (const date of dates.sort()) {
    const cs = buildCase(ym);
    const key = cs.indication + (cs.indication === 'AF' ? '-' + cs.modality : '');
    summary.set(key, (summary.get(key) || 0) + 1);
    const dept = chance(0.04) ? 'その他' : '循環器内科';
    for (const code of cs.items) {
      const pm = master[code];
      newRows.push({
        date, ym, dept,
        stockType: weighted(pm.price >= 100000 ? [['定数品', 0.62], ['持ち込み品', 0.32], ['緊急使用', 0.06]] : [['定数品', 0.86], ['持ち込み品', 0.09], ['緊急使用', 0.05]]),
        useType: chance(pm.price >= 100000 ? 0.004 : 0.015) ? '破棄破損' : '患者消費',
        maker: pm.maker, material: pm.material, price: pm.price, procedure: ABL, code
      });
    }
  }
}
D.rawRows = D.rawRows.filter(r => r.procedure !== ABL).concat(newRows);

recompute(D);
save(dataPath, D);
const abCases = D.cases.filter(c => c.procedure === ABL);
console.log('ablation cases', abCases.length, 'rows', newRows.length,
  'avgItems', (newRows.length / abCases.length).toFixed(1), 'avgReimburse', Math.round(abCases.reduce((s, c) => s + c.reimburse, 0) / abCases.length));
console.log([...summary].sort().map(x => x.join(': ')).join(', '));
