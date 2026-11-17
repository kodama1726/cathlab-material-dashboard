// 他施設ベンチマーク用に、施設B〜Eの「主要デバイスの方式構成」を生成するためのプロファイルを data.js に書き込む。
// 使い方: node tools/add_device_benchmark.js data.js   (再実行すると上書き)
// 画面側(app.js)では、A病院の実績の方式別シェアに以下を適用して各施設の値を求める:
//   シェア = A病院シェア × mult[方式] + add[方式] → 合計1に正規化(mult=0の方式は未採用)
//   採用製品数 = A病院の製品数 + productDelta(採用方式数を下限)
// 施設プロフィール(大学病院・心臓血管センター・一般病院等)から想定される採用傾向を反映した模擬値。
const fs = require('fs');
const dataPath = process.argv[2];
const PREFIX = 'window.DASHBOARD_DATA = ';
const src = fs.readFileSync(dataPath, 'utf8');
const D = JSON.parse(src.slice(PREFIX.length).replace(/;\s*$/, ''));

const ABL = 'アブレーションカテーテル', MAP = 'マッピング・診断用電極カテーテル', BAL = 'PTCAバルーン', IMG = '冠動脈イメージング',
  DEB = 'デバルキング(石灰化・プラーク切除)', GW = 'PTCAガイドワイヤー', HEM = '止血デバイス', PM = 'ペースメーカ本体', ICD = '植込型除細動器(ICD)本体';
const RF = '高周波(RF)カテーテル', CRYO = 'クライオバルーン', HOT = 'ホットバルーン', PFA = 'パルスフィールド(PFA)';
const HD = '高密度マッピング', RING = '円状(リング)マッピング', MULTI = '多極診断(固定電極)';
const SEMI = 'セミコンプライアント', SCORE = 'スコアリング/カッティング', DCB = '薬剤コーティング(DCB)';
const OCT = 'OCT/OFDI(光干渉断層)';
const ROTA = 'ロータブレーター(高速回転式)', DCA = '方向性アテレクトミー(DCA)', OAD = 'オービタル(OAD)', IVL = '血管内砕石術(IVL)';
const CTO = '貫通型(CTO用)', SUTURE = '縫合型';
const PM_SINGLE = '経静脈 シングルチャンバ', LEADLESS = 'リードレス', SICD = '皮下植込型(S-ICD)';

D.benchmark.deviceProfiles = {
  // 大学病院本院: 新規デバイスを早期・幅広く導入、複雑病変・研究用途で製品数も多い
  B: {
    [ABL]: { mult: { [RF]: 0.85, [CRYO]: 0.9, [HOT]: 1.8, [PFA]: 1.45 }, productDelta: 2 },
    [MAP]: { mult: { [HD]: 1.35, [RING]: 0.85, [MULTI]: 0.8 }, productDelta: 2 },
    [BAL]: { mult: { [SEMI]: 1.1 }, add: { [SCORE]: 0.07, [DCB]: 0.09 }, productDelta: 3 },
    [IMG]: { mult: { [OCT]: 1.6 }, productDelta: 1 },
    [DEB]: { add: { [OAD]: 0.18, [IVL]: 0.22 }, productDelta: 2 },
    [GW]: { mult: { [CTO]: 1.4 }, productDelta: 4 },
    [HEM]: { productDelta: 0 },
    [PM]: { add: { [PM_SINGLE]: 0.1, [LEADLESS]: 0.12 }, productDelta: 1 },
    [ICD]: { add: { [SICD]: 0.18 }, productDelta: 1 }
  },
  // 地域医療支援病院(中規模): 標準的な方式中心、新規方式の導入はやや遅い
  C: {
    [ABL]: { mult: { [RF]: 1.1, [CRYO]: 1.25, [HOT]: 0, [PFA]: 0.75 }, productDelta: 0 },
    [MAP]: { mult: { [HD]: 0.9, [RING]: 1.15 }, productDelta: 0 },
    [BAL]: { add: { [DCB]: 0.05 }, productDelta: -1 },
    [IMG]: { mult: { [OCT]: 0.55 }, productDelta: 0 },
    [DEB]: { mult: { [DCA]: 0.4 }, add: { [IVL]: 0.1 }, productDelta: 0 },
    [GW]: { mult: { [CTO]: 0.9 }, productDelta: 1 },
    [HEM]: { productDelta: 0 },
    [PM]: { add: { [PM_SINGLE]: 0.08, [LEADLESS]: 0.04 }, productDelta: 0 },
    [ICD]: { productDelta: 0 }
  },
  // 心臓血管センター: 高症例数で新規方式を積極導入、石灰化・CTO治療も多い
  D: {
    [ABL]: { mult: { [RF]: 0.8, [CRYO]: 0.55, [HOT]: 1.2, [PFA]: 1.65 }, productDelta: 1 },
    [MAP]: { mult: { [HD]: 1.25 }, productDelta: 1 },
    [BAL]: { add: { [SCORE]: 0.1, [DCB]: 0.13 }, productDelta: 2 },
    [IMG]: { mult: { [OCT]: 1.3 }, productDelta: 1 },
    [DEB]: { mult: { [ROTA]: 1.2 }, add: { [OAD]: 0.25, [IVL]: 0.2 }, productDelta: 2 },
    [GW]: { mult: { [CTO]: 1.6 }, productDelta: 5 },
    [HEM]: { productDelta: 1 },
    [PM]: { add: { [LEADLESS]: 0.15 }, productDelta: 1 },
    [ICD]: { add: { [SICD]: 0.12 }, productDelta: 0 }
  },
  // 一般病院(急性期中心・小規模): 方式・製品を絞って運用
  E: {
    [ABL]: { mult: { [RF]: 1.5, [CRYO]: 0.7, [HOT]: 0, [PFA]: 0.25 }, productDelta: -2 },
    [MAP]: { mult: { [HD]: 0.6 }, productDelta: -2 },
    [BAL]: { mult: { [SEMI]: 1.3 }, productDelta: -1 },
    [IMG]: { mult: { [OCT]: 0 }, productDelta: -1 },
    [DEB]: { mult: { [DCA]: 0 }, productDelta: -2 },
    [GW]: { mult: { [CTO]: 0.6 }, productDelta: -1 },
    [HEM]: { mult: { [SUTURE]: 0 }, productDelta: -1 },
    [PM]: { productDelta: -1 },
    [ICD]: { mult: { [PM_SINGLE]: 1.3 }, productDelta: -1 }
  }
};

fs.writeFileSync(dataPath, PREFIX + JSON.stringify(D) + ';');
console.log('deviceProfiles written for', Object.keys(D.benchmark.deviceProfiles).join(','));
