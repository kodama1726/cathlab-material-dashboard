(function () {
  const D = window.DASHBOARD_DATA;

  // ---------------- テーマ ----------------
  const THEME = {
    light: { series: ['#73a9f1', '#db6f47', '#51cb97', '#cb8e27', '#f886b1', '#59ab54', '#8d8ae0', '#de857e'],
             text: '#0b0b0b', textSec: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', surface: '#fcfcfb' },
    dark:  { series: ['#5289ce', '#a84926', '#46a47d', '#9d5a00', '#c3718a', '#297e25', '#847dc8', '#c4716f'],
             text: '#ffffff', textSec: '#c3c2b7', muted: '#898781', grid: '#2c2c2a', axis: '#383835', surface: '#1a1a19' }
  };
  const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

  function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function colors() { return THEME[currentTheme()]; }

  const themeToggle = document.getElementById('themeToggle');
  themeToggle.addEventListener('click', () => {
    const now = currentTheme();
    const next = now === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('cathlab-theme', next); } catch (e) {}
    renderActiveTab();
  });
  (function initTheme() {
    try {
      const saved = localStorage.getItem('cathlab-theme');
      if (saved) document.documentElement.setAttribute('data-theme', saved);
    } catch (e) {}
  })();

  Chart.defaults.font.family = "system-ui,-apple-system,'Segoe UI','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif";
  Chart.defaults.font.size = 12;

  function baseFont() { return { family: Chart.defaults.font.family }; }

  function applyChartDefaults() {
    const c = colors();
    Chart.defaults.color = c.textSec;
    Chart.defaults.borderColor = c.grid;
  }

  // ---------------- 共通フォーマッタ ----------------
  const fmtNum = (n) => Math.round(n).toLocaleString('ja-JP');
  const fmtYen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
  const fmtPct = (n, d = 1) => (n * 100).toFixed(d) + '%';
  const fmtYm = (ym) => ym ? (ym.slice(0, 4) + '/' + ym.slice(4, 6)) : '';

  // ---------------- チャート管理 ----------------
  const chartRegistry = {};
  function makeChart(id, config) {
    if (chartRegistry[id]) { chartRegistry[id].destroy(); }
    const el = document.getElementById(id);
    if (!el) return null;
    const ch = new Chart(el.getContext('2d'), config);
    chartRegistry[id] = ch;
    return ch;
  }

  function gridOpt() {
    const c = colors();
    return { color: c.grid, drawTicks: false };
  }
  function tickOpt() {
    const c = colors();
    return { color: c.textSec, font: baseFont() };
  }
  function legendOpt(show) {
    const c = colors();
    return { display: show, position: 'bottom', labels: { color: c.textSec, usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 14, font: baseFont() } };
  }
  function tooltipOpt() {
    const c = colors();
    return {
      backgroundColor: c.surface, titleColor: c.text, bodyColor: c.textSec,
      borderColor: c.grid, borderWidth: 1, padding: 10, boxPadding: 4,
      titleFont: { weight: '700' }, cornerRadius: 8
    };
  }

  // ---------------- 手技(処置)まわり ----------------
  const PROC_ORDER = ['PCI（待機的）', 'PCI（緊急）', '経皮的カテーテル心筋焼灼術', 'ペースメーカー移植術', '植込型除細動器移植術', '両心室ペースメーカー移植術']
    .filter(p => D.meta.procedures.includes(p));
  const PROC_SHORT = {
    'PCI（待機的）': 'PCI(待機的)', 'PCI（緊急）': 'PCI(緊急)',
    '経皮的カテーテル心筋焼灼術': 'アブレーション', 'ペースメーカー移植術': 'PM植込',
    '植込型除細動器移植術': 'ICD植込', '両心室ペースメーカー移植術': 'CRT植込'
  };
  function shortProc(p) { return PROC_SHORT[p] || p; }

  function countBy(arr, key) {
    const m = new Map();
    for (const r of arr) { const k = r[key]; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }

  // ---------------- 対象年(全タブ共通、在庫情報は対象外) ----------------
  const yearSel = document.getElementById('yearSel');
  const YEARS = [...new Set(D.cases.map(c => c.date.slice(0, 4)))].sort();
  yearSel.innerHTML = '<option value="all">全期間</option>' + YEARS.map(y => `<option value="${y}">${y}年</option>`).join('');
  let ROWS = D.rawRows, CASES = D.cases, MONTHLY = D.overview.monthlyByProc;
  function applyYear() {
    const y = yearSel.value;
    ROWS = y === 'all' ? D.rawRows : D.rawRows.filter(r => r.date.startsWith(y));
    CASES = y === 'all' ? D.cases : D.cases.filter(c => c.date.startsWith(y));
    MONTHLY = y === 'all' ? D.overview.monthlyByProc : D.overview.monthlyByProc.filter(e => e.ym.startsWith(y));
    const procsInYear = new Set(CASES.map(c => c.procedure));
    fillProcSelect(ovProcSel, 'すべて', procsInYear);
    fillProcSelect(bmProcSel, 'すべて(全処置加重平均)', procsInYear);
    fillProcSelect(dmProcSel, 'すべて', procsInYear);
    const missing = PROC_ORDER.filter(p => !procsInYear.has(p)).map(shortProc);
    document.getElementById('yearHint').textContent = missing.length ? `${periodLabel()}は ${missing.join('・')} のデータがありません` : '';
    document.getElementById('ovPeriodHint').textContent = `対象期間: ${periodLabel()}(${fmtNum(ROWS.length)}件)`;
    document.getElementById('footPeriod').textContent = periodLabel();
  }
  // 選択中の年にデータのある処置のみ選択肢に出す(選択中の処置が無ければ「すべて」に戻す)
  function fillProcSelect(sel, allLabel, procs) {
    const cur = sel.value;
    const list = PROC_ORDER.filter(p => procs.has(p));
    sel.innerHTML = `<option value="all">${allLabel}</option>` + list.map(p => `<option value="${p}">${shortProc(p)}</option>`).join('');
    sel.value = list.includes(cur) ? cur : 'all';
  }
  function periodLabel() {
    return yearSel.value === 'all' ? `${D.meta.dateFrom} 〜 ${D.meta.dateTo}` : `${yearSel.value}年`;
  }
  // 年換算用の期間(年)。年指定時はデータセットの対象期間と重なる日数で換算
  function periodYears() {
    if (yearSel.value === 'all') return D.meta.spanDays / 365;
    const y = +yearSel.value;
    const from = Math.max(new Date(y, 0, 1), new Date(D.meta.dateFrom + 'T00:00:00'));
    const to = Math.min(new Date(y, 11, 31), new Date(D.meta.dateTo + 'T00:00:00'));
    return ((to - from) / 86400000 + 1) / 365;
  }
  yearSel.addEventListener('change', () => { applyYear(); renderActiveTab(); });

  // ================================================================
  // TAB 1: データ概観
  // ================================================================
  const ovProcSel = document.getElementById('ovProc');
  ovProcSel.addEventListener('change', renderOverview);

  document.getElementById('footGenerated').textContent = new Date(D.meta.generatedAt).toLocaleString('ja-JP');

  function renderOverview() {
    applyChartDefaults();
    const c = colors();
    const proc = ovProcSel.value;
    const rows = proc === 'all' ? ROWS : ROWS.filter(r => r.procedure === proc);
    const cases = proc === 'all' ? CASES : CASES.filter(cs => cs.procedure === proc);

    // KPI
    const totalReimburse = rows.reduce((s, r) => s + r.price, 0);
    const deptRatio = rows.length ? rows.filter(r => r.dept === '循環器内科').length / rows.length : 0;
    const kpis = [
      { label: '対象レコード数', value: fmtNum(rows.length), sub: proc === 'all' ? '全処置合計' : shortProc(proc) },
      { label: '推定症例数', value: fmtNum(cases.length), sub: '日付×処置内容から推定', info: '症例日と処置内容の組み合わせを1症例相当として推定した参考値です。2025年のPCI・植込みデバイスは症例番号により患者単位で集計しています' },
      { label: '総材料償還額', value: fmtYen(totalReimburse), sub: '対象期間合計' },
      { label: '循環器内科の割合', value: fmtPct(deptRatio), sub: '診療科内訳' }
    ];
    document.getElementById('ovKpis').innerHTML = kpis.map(k => `
      <div class="kpi"><div class="label">${k.label}${k.info ? `<span class="info-dot" title="${k.info}">i</span>` : ''}</div>
      <div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');

    // 処置内訳(全体・フィルタの影響を受けない)
    const procAll = countBy(CASES, 'procedure').sort((a, b) => PROC_ORDER.indexOf(a.name) - PROC_ORDER.indexOf(b.name));
    makeChart('chartProcBreakdown', {
      type: 'bar',
      data: {
        labels: procAll.map(p => shortProc(p.name)),
        datasets: [{ label: '推定症例数', data: procAll.map(p => p.count), backgroundColor: c.series[0], borderRadius: 4, borderSkipped: false, barPercentage: 0.6 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(false), tooltip: tooltipOpt() },
        scales: { x: { grid: gridOpt(), ticks: tickOpt(), beginAtZero: true }, y: { grid: { display: false }, ticks: tickOpt() } }
      }
    });

    // 月別推移
    document.getElementById('ovTrendSub').textContent = proc === 'all' ? '全処置合計の推定症例数' : shortProc(proc) + 'の推定症例数';
    const monthly = MONTHLY.map(e => ({ ym: e.ym, v: proc === 'all' ? e._total : (e[proc] || 0) }));
    makeChart('chartMonthlyTrend', {
      type: 'line',
      data: {
        labels: monthly.map(e => fmtYm(e.ym)),
        datasets: [{ label: '推定症例数', data: monthly.map(e => e.v), borderColor: c.series[0], backgroundColor: c.series[0], borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.25, fill: false }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(false), tooltip: { ...tooltipOpt(), mode: 'index', intersect: false } },
        interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false }, ticks: { ...tickOpt(), maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { grid: gridOpt(), ticks: tickOpt(), beginAtZero: true } }
      }
    });

    // 在庫区分
    const stockType = countBy(rows, 'stockType');
    makeChart('chartStockType', {
      type: 'doughnut',
      data: { labels: stockType.map(s => s.name), datasets: [{ data: stockType.map(s => s.count), backgroundColor: c.series.slice(0, stockType.length), borderColor: c.surface, borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: legendOpt(true), tooltip: tooltipOpt() } }
    });

    // 使用区分(患者消費 vs 破棄破損は件数差が非常に大きいため、比率バー+直接ラベルで表示)
    const useType = countBy(rows, 'useType');
    const useTotal = useType.reduce((s, u) => s + u.count, 0) || 1;
    const useColors = [c.series[2], c.series[7]];
    const barSegs = useType.map((u, i) => {
      const pct = u.count / useTotal * 100;
      return `<div style="width:${Math.max(pct, 2)}%;background:${useColors[i]}">${pct >= 8 ? pct.toFixed(1) + '%' : ''}</div>`;
    }).join('');
    const legendRows = useType.map((u, i) => `
      <div class="row"><span class="name"><span class="dot" style="background:${useColors[i]}"></span>${u.name}</span><span class="num">${fmtNum(u.count)}件(${fmtPct(u.count / useTotal)})</span></div>`).join('');
    document.getElementById('useTypeStat').innerHTML = `<div class="usetype-bar">${barSegs}</div><div class="usetype-legend">${legendRows}</div>`;

    // メーカーTOP10
    const makerTop = countBy(rows, 'maker').slice(0, 10).reverse();
    makeChart('chartMakerTop10', {
      type: 'bar',
      data: { labels: makerTop.map(m => m.name), datasets: [{ label: '件数', data: makerTop.map(m => m.count), backgroundColor: c.series[0], borderRadius: 4, borderSkipped: false, barPercentage: 0.65 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(false), tooltip: tooltipOpt() },
        scales: { x: { grid: gridOpt(), ticks: tickOpt(), beginAtZero: true }, y: { grid: { display: false }, ticks: tickOpt() } }
      }
    });

    // 材料カテゴリTOP10
    const matTop = countBy(rows, 'material').slice(0, 10).reverse();
    makeChart('chartMaterialTop10', {
      type: 'bar',
      data: { labels: matTop.map(m => m.name.length > 14 ? m.name.slice(0, 14) + '…' : m.name), datasets: [{ label: '件数', data: matTop.map(m => m.count), backgroundColor: c.series[2], borderRadius: 4, borderSkipped: false, barPercentage: 0.65 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: legendOpt(false),
          tooltip: { ...tooltipOpt(), callbacks: { title: (items) => matTop[items[0].dataIndex].name } }
        },
        scales: { x: { grid: gridOpt(), ticks: tickOpt(), beginAtZero: true }, y: { grid: { display: false }, ticks: tickOpt() } }
      }
    });
  }

  // ================================================================
  // TAB 2: 他施設ベンチマーク
  // ================================================================
  const bmProcSel = document.getElementById('bmProc');
  bmProcSel.addEventListener('change', renderBenchmark);

  const FAC_KEYS = ['A', 'B', 'C', 'D', 'E'];
  const FAC_COLOR_IDX = { A: 0, B: 1, C: 2, D: 3, E: 4 };
  function facShort(k) { return D.benchmark.facilities[k].shortLabel || (k + '病院'); }

  // アブレーションのB〜E病院は、1症例あたり償還額を「アブレーションカテーテルの方式構成」と整合させる。
  //   償還額/症例 = カテーテル以外の材料費(A病院と同水準と仮定) + カテーテル本数/症例 × 方式構成で加重した平均単価
  // カテーテル本数/症例 = A病院の本数 + (各施設の追加焼灼率 − A病院の追加焼灼率)。方式別単価はA病院の実績平均。
  // 高額な方式(PFA等)の比率や追加焼灼率が高い施設ほど償還額が高くなる。
  const ABL_PROC = '経皮的カテーテル心筋焼灼術';
  function ablationCostModel(k) {
    const dom = DEVICE_DOMAINS.find(d => d.key === 'abl');
    const g = dom.groups[0];
    const s = summarizeGroup(g, dom.procs);
    const perCaseA = s.rows.length / CASES.filter(c => c.procedure === ABL_PROC).length;
    const touchup = USAGE_INDICATORS.find(ind => ind.key === 'touchup');
    const perCase = perCaseA + facilityUsage(k, touchup) - facilityUsage('A', touchup);
    const typePrice = s.types.map(t => {
      const rs = s.rows.filter(r => classifyType(g, r) === t);
      return rs.length ? rs.reduce((a, r) => a + r.price, 0) / rs.length : 0;
    });
    const meanPrice = (shares) => shares.reduce((a, sh, i) => a + sh * typePrice[i], 0);
    const otherCost = ownProcStat(ABL_PROC).avgReimburse - perCaseA * meanPrice(facilityDeviceStats('A', dom, g).shares);
    const catheterCost = perCase * meanPrice(facilityDeviceStats(k, dom, g).shares);
    return { avgReimburse: otherCost + catheterCost, catheterCost, otherCost, perCase };
  }

  // A病院の処置別統計(選択中の対象年で集計)。データが無ければ null
  function ownProcStat(p) {
    const cs = CASES.filter(c => c.procedure === p);
    if (!cs.length) return null;
    const nCases = cs.length / periodYears();
    const avgItems = cs.reduce((s, c) => s + c.items, 0) / cs.length;
    const avgReimburse = cs.reduce((s, c) => s + c.reimburse, 0) / cs.length;
    return { nCases, avgItems, avgReimburse, totalReimburse: avgReimburse * nCases };
  }

  // B〜E病院は、全期間のA病院に対する比率を対象年のA病院に適用する。
  // 症例数もA病院の年次変動(対象年÷全期間)を同率で反映し、全処置加重平均の処置構成を揃える。
  // A病院にデータが無い処置は全施設で比較対象外(null)
  function procStat(k, p) {
    const own = ownProcStat(p);
    if (!own) return null;
    if (k === 'A') return own;
    const s = D.benchmark.facilities[k].procStats[p];
    const baseA = D.benchmark.facilities.A.procStats[p];
    const nCases = s.nCases * own.nCases / baseA.nCases;
    const avgItems = s.avgItems / baseA.avgItems * own.avgItems;
    const avgReimburse = p === ABL_PROC ? ablationCostModel(k).avgReimburse : s.avgReimburse / baseA.avgReimburse * own.avgReimburse;
    return { nCases, avgItems, avgReimburse, totalReimburse: avgReimburse * nCases };
  }

  function facMetric(k, proc) {
    if (proc === 'all') {
      let n = 0, itemsW = 0, reimburse = 0;
      for (const p of D.benchmark.procedures) {
        const s = procStat(k, p);
        if (!s) continue;
        n += s.nCases; itemsW += s.avgItems * s.nCases; reimburse += s.totalReimburse;
      }
      return { nCases: n, avgItems: n ? itemsW / n : 0, avgReimburse: n ? reimburse / n : 0 };
    }
    const s = procStat(k, proc);
    return { nCases: s.nCases, avgItems: s.avgItems, avgReimburse: s.avgReimburse };
  }

  function renderProfiles() {
    const html = FAC_KEYS.map(k => {
      const f = D.benchmark.facilities[k];
      const c = colors();
      return `<div class="profile-card ${f.own ? 'own' : ''}">
        <div class="letter" style="background:${c.series[FAC_COLOR_IDX[k]]}">${k}</div>
        <div class="fname">${f.label}</div>
        <div class="frow"><span>病床数</span><b>${f.beds}床</b></div>
        <div class="frow"><span>機能区分</span><b style="text-align:right;">${f.function}</b></div>
        <div class="frow"><span>循環器内科医師数</span><b>${f.cardiologists}名</b></div>
        <div class="frow"><span>年間症例数</span><b>${fmtNum(f.annualCases)}件</b></div>
        <div class="note">${f.note}</div>
      </div>`;
    }).join('');
    document.getElementById('bmProfiles').innerHTML = html;
  }

  function renderPositioning(metrics) {
    const c = colors();
    const sorted = [...metrics].sort((a, b) => a.avgReimburse - b.avgReimburse);
    const rank = sorted.findIndex(m => m.k === 'A') + 1;
    const own = metrics.find(m => m.k === 'A');
    const cheapest = sorted[0];
    const avgAll = metrics.reduce((s, m) => s + m.avgReimburse, 0) / metrics.length;

    const min = sorted[0].avgReimburse, max = sorted[sorted.length - 1].avgReimburse;
    const range = (max - min) || 1;
    const track = document.getElementById('bmPositionTrack');
    track.innerHTML = metrics.map(m => {
      const leftPct = 6 + (88 * (m.avgReimburse - min) / range);
      const isOwn = m.k === 'A';
      return `
        <div class="dot-value" style="left:${leftPct}%">${fmtYen(m.avgReimburse)}</div>
        <div class="dot ${isOwn ? 'own' : ''}" style="left:${leftPct}%;background:${c.series[FAC_COLOR_IDX[m.k]]}"></div>
        <div class="dot-label" style="left:${leftPct}%">${facShort(m.k)}${isOwn ? '(自施設)' : ''}</div>`;
    }).join('');

    function diffBox(title, base, baseLabel) {
      const diff = own.avgReimburse - base;
      const pct = base ? diff / base : 0;
      if (Math.abs(diff) < base * 0.005) {
        return `<div class="box"><div class="t">${title}</div><div class="v good">同水準</div><div class="s">${baseLabel}とほぼ同じ</div></div>`;
      }
      const cls = diff > 0 ? 'critical' : 'good';
      const sign = diff > 0 ? '+' : '';
      return `<div class="box"><div class="t">${title}</div><div class="v ${cls}">${sign}${fmtYen(diff)}</div><div class="s">${baseLabel}比 ${sign}${(pct * 100).toFixed(1)}% ${diff > 0 ? '(材料費が高め)' : '(材料費が低め・経済的)'}</div></div>`;
    }

    const rankBox = `<div class="box"><div class="t">材料費(円/症例)の順位</div><div class="v">5施設中 ${rank}位</div><div class="s">${rank === 1 ? '5施設で最も材料コスト効率が高い' : '値が低い順(1位が最も経済的)'}</div></div>`;
    const cheapestBox = own.k === cheapest.k
      ? `<div class="box"><div class="t">最も経済的な施設との差</div><div class="v good">自施設が最安</div><div class="s">他4施設は自施設より材料費が高い水準</div></div>`
      : diffBox('最も経済的な施設(' + facShort(cheapest.k) + ')との差', cheapest.avgReimburse, facShort(cheapest.k));
    const avgBox = diffBox('5施設平均との差', avgAll, '5施設平均');

    document.getElementById('bmPositionSummary').innerHTML = rankBox + cheapestBox + avgBox;
  }

  function renderBenchmark() {
    applyChartDefaults();
    const c = colors();
    const proc = bmProcSel.value;
    renderProfiles();

    const scope = `${periodLabel()}・${proc === 'all' ? '全処置の加重平均' : shortProc(proc)}で比較`;
    document.getElementById('bmSub1').textContent = scope
      + (proc === ABL_PROC || proc === 'all' ? '(アブレーションのB〜E病院はカテーテル方式構成から算出)' : '');
    document.getElementById('bmSub2').textContent = scope;
    document.getElementById('bmDevMixSub').textContent = `施設別の方式構成比(使用件数ベース・${periodLabel()})。ホバーで採用製品数を表示`;

    const metrics = FAC_KEYS.map(k => ({ k, ...facMetric(k, proc) }));
    const facColors = FAC_KEYS.map(k => c.series[FAC_COLOR_IDX[k]]);
    renderPositioning(metrics);

    makeChart('chartBmReimburse', {
      type: 'bar',
      data: { labels: FAC_KEYS.map(facShort), datasets: [{ label: '平均償還額/症例', data: metrics.map(m => Math.round(m.avgReimburse)), backgroundColor: facColors, borderRadius: 4, borderSkipped: false, barPercentage: 0.55 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(false), tooltip: { ...tooltipOpt(), callbacks: {
          label: (it) => fmtYen(it.raw),
          afterLabel: (it) => {
            if (proc !== ABL_PROC) return '';
            const m = ablationCostModel(FAC_KEYS[it.dataIndex]);
            return `うちアブレーションカテーテル ${fmtYen(m.catheterCost)}(平均${m.perCase.toFixed(1)}本)\nその他の材料 ${fmtYen(m.otherCost)}`;
          }
        } } },
        scales: { x: { grid: { display: false }, ticks: tickOpt() }, y: { grid: gridOpt(), ticks: { ...tickOpt(), callback: (v) => (v / 1000) + 'k' }, beginAtZero: true } }
      }
    });

    makeChart('chartBmItems', {
      type: 'bar',
      data: { labels: FAC_KEYS.map(facShort), datasets: [{ label: '平均機材点数/症例', data: metrics.map(m => +m.avgItems.toFixed(1)), backgroundColor: facColors, borderRadius: 4, borderSkipped: false, barPercentage: 0.55 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(false), tooltip: tooltipOpt() },
        scales: { x: { grid: { display: false }, ticks: tickOpt() }, y: { grid: gridOpt(), ticks: tickOpt(), beginAtZero: true } }
      }
    });

    makeChart('chartBmVolume', {
      type: 'bar',
      data: { labels: FAC_KEYS.map(facShort), datasets: [{ label: '年間症例数', data: metrics.map(m => Math.round(m.nCases)), backgroundColor: facColors, borderRadius: 4, borderSkipped: false, barPercentage: 0.55 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(false), tooltip: tooltipOpt() },
        scales: { x: { grid: { display: false }, ticks: tickOpt() }, y: { grid: gridOpt(), ticks: tickOpt(), beginAtZero: true } }
      }
    });

    const simEntries = ['B', 'C', 'D', 'E'].map(k => ({ k, v: D.benchmark.similarity[k] })).sort((a, b) => a.v - b.v);
    makeChart('chartBmSimilarity', {
      type: 'bar',
      data: { labels: simEntries.map(e => facShort(e.k)), datasets: [{ label: '類似度', data: simEntries.map(e => +e.v.toFixed(3)), backgroundColor: simEntries.map(e => c.series[FAC_COLOR_IDX[e.k]]), borderRadius: 4, borderSkipped: false, barPercentage: 0.5 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(false), tooltip: { ...tooltipOpt(), callbacks: { label: (it) => '類似度 ' + it.raw } } },
        scales: { x: { min: 0, max: 1, grid: gridOpt(), ticks: tickOpt() }, y: { grid: { display: false }, ticks: tickOpt() } }
      }
    });

    // 処置構成比(100%積み上げ、横棒の上からA〜Eの順になるよう表示用に逆順で渡す)
    const mixFacKeys = [...FAC_KEYS].reverse();
    const mixDatasets = PROC_ORDER.map((p, i) => ({
      label: shortProc(p),
      data: mixFacKeys.map(k => +(D.benchmark.facilities[k].procShare[p] * 100).toFixed(1)),
      backgroundColor: c.series[i],
      borderColor: c.surface, borderWidth: 2,
      stack: 'mix'
    }));
    makeChart('chartBmMix', {
      type: 'bar',
      data: { labels: mixFacKeys.map(facShort), datasets: mixDatasets },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(true), tooltip: { ...tooltipOpt(), callbacks: { label: (it) => `${it.dataset.label}: ${it.raw}%` } } },
        scales: {
          x: { stacked: true, min: 0, max: 100, grid: gridOpt(), ticks: { ...tickOpt(), callback: (v) => v + '%' } },
          y: { stacked: true, grid: { display: false }, ticks: tickOpt() }
        }
      }
    });

    // サマリ表
    const theadCols = ['施設', '病床数', '機能区分', '年間症例数', '平均償還額/症例', '平均機材点数/症例', '自施設との類似度'];
    document.getElementById('bmTable').querySelector('thead').innerHTML = '<tr>' + theadCols.map(h => `<th>${h}</th>`).join('') + '</tr>';
    const tbody = FAC_KEYS.map(k => {
      const f = D.benchmark.facilities[k];
      const m = facMetric(k, proc);
      const sim = f.own ? '基準(自施設)' : D.benchmark.similarity[k].toFixed(3);
      return `<tr>
        <td><b style="color:${colors().series[FAC_COLOR_IDX[k]]}">●</b> ${f.label}</td>
        <td>${f.beds}床</td><td>${f.function}</td>
        <td>${fmtNum(f.annualCases)}件</td>
        <td>${fmtYen(m.avgReimburse)}</td>
        <td>${m.avgItems.toFixed(1)}点</td>
        <td>${sim}</td>
      </tr>`;
    }).join('');
    document.getElementById('bmTable').querySelector('tbody').innerHTML = tbody;

    renderDeviceBenchmark(proc);
    renderUsageBenchmark(proc);
    renderFunnel(proc);
    renderAdoption();
  }

  // ================================================================
  // TAB 3: ディーラー・メーカー市場戦略
  // ================================================================
  const dmProcSel = document.getElementById('dmProc');
  dmProcSel.addEventListener('change', renderDealer);

  function computeCategoryConcentration(rows) {
    const cats = [...new Set(rows.map(r => r.material))];
    return cats.map(cat => {
      const catRows = rows.filter(r => r.material === cat);
      const totalVal = catRows.reduce((s, r) => s + r.price, 0);
      const totalCount = catRows.length;
      const byMaker = new Map();
      for (const r of catRows) byMaker.set(r.maker, (byMaker.get(r.maker) || 0) + 1);
      const shares = [...byMaker.values()].map(cnt => cnt / totalCount);
      const hhi = Math.round(shares.reduce((s, sh) => s + sh * sh, 0) * 10000);
      const top = [...byMaker.entries()].sort((a, b) => b[1] - a[1])[0];
      return { category: cat, count: totalCount, totalValue: totalVal, hhi, topMaker: top ? top[0] : null, topShare: top ? +(top[1] / totalCount).toFixed(3) : 0 };
    }).filter(cat => cat.count >= 5).sort((a, b) => b.totalValue - a.totalValue);
  }

  function renderDealer() {
    applyChartDefaults();
    const c = colors();
    const proc = dmProcSel.value;
    const procLabel = proc === 'all' ? '全処置' : shortProc(proc);
    const rows = proc === 'all' ? ROWS : ROWS.filter(r => r.procedure === proc);

    document.getElementById('dmSubShare').textContent = `材料償還額ベース・${periodLabel()}・${procLabel}`;
    document.getElementById('dmSubTrend').textContent = `上位6社・材料償還額ベース(自施設実績・${procLabel})`;
    document.getElementById('dmSubHHI').textContent = `自施設データ(${procLabel})における、特定保険医療材料カテゴリ別のメーカー集中度(ハーフィンダール・ハーシュマン指数)。専用カテーテル・リード類は院内で銘柄統一されやすく、単独メーカー(HHI=10,000)になりやすい点に留意`;

    // メーカー別シェア(償還額ベース、選択中の処置内容・自施設実績)
    const valueByMaker = new Map();
    let totalValue = 0;
    for (const r of rows) { valueByMaker.set(r.maker, (valueByMaker.get(r.maker) || 0) + r.price); totalValue += r.price; }
    const sortedMakers = [...valueByMaker.entries()].sort((a, b) => b[1] - a[1]);
    const top8 = sortedMakers.slice(0, 8);
    const otherSum = sortedMakers.slice(8).reduce((s, [, v]) => s + v, 0);
    const shareLabels = top8.map(m => m[0]).concat(otherSum > 0 ? ['その他'] : []);
    const shareData = top8.map(m => m[1]).concat(otherSum > 0 ? [otherSum] : []);

    const categoryConcentration = computeCategoryConcentration(rows);
    const uniqMakerCount = valueByMaker.size;
    const top3Share = totalValue ? sortedMakers.slice(0, 3).reduce((s, [, v]) => s + v, 0) / totalValue : 0;
    const oligopolyCount = categoryConcentration.filter(cat => cat.hhi > 2500).length;

    document.getElementById('dmKpis').innerHTML = [
      { label: '取扱メーカー数', value: fmtNum(uniqMakerCount), sub: `自施設実績・${procLabel}` },
      { label: '上位3社シェア', value: fmtPct(top3Share), sub: '材料償還額ベース' },
      { label: '寡占カテゴリ数', value: fmtNum(oligopolyCount) + ' / ' + fmtNum(categoryConcentration.length), sub: 'HHI > 2500の材料カテゴリ' },
      { label: '総市場規模(自施設)', value: fmtYen(totalValue), sub: `材料償還額合計・${periodLabel()}・${procLabel}` }
    ].map(k => `<div class="kpi"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');

    makeChart('chartMakerShare', {
      type: 'doughnut',
      data: { labels: shareLabels, datasets: [{ data: shareData, backgroundColor: c.series.concat([c.muted]).slice(0, shareLabels.length), borderColor: c.surface, borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '58%',
        plugins: {
          legend: legendOpt(true),
          tooltip: { ...tooltipOpt(), callbacks: { label: (it) => `${it.label}: ${fmtYen(it.raw)} (${fmtPct(it.raw / totalValue)})` } }
        }
      }
    });

    // 月別トレンド(選択中の処置内容における上位6社)
    const dynTopMakers = sortedMakers.slice(0, 6).map(m => m[0]);
    const monthsList = MONTHLY.map(e => e.ym);
    const monthlyMap = new Map(monthsList.map(ym => [ym, Object.fromEntries(dynTopMakers.map(m => [m, 0]))]));
    for (const r of rows) { if (dynTopMakers.includes(r.maker)) monthlyMap.get(r.ym)[r.maker] += r.price; }
    const makerMonthly = monthsList.map(ym => ({ ym, ...monthlyMap.get(ym) }));

    makeChart('chartMakerTrend', {
      type: 'line',
      data: {
        labels: makerMonthly.map(e => fmtYm(e.ym)),
        datasets: dynTopMakers.map((mk, i) => ({
          label: mk, data: makerMonthly.map(e => Math.round(e[mk])),
          borderColor: c.series[i], backgroundColor: c.series[i], borderWidth: 2, pointRadius: 2, pointHoverRadius: 5, tension: 0.25, fill: false
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(true), tooltip: { ...tooltipOpt(), mode: 'index', intersect: false, callbacks: { label: (it) => `${it.dataset.label}: ${fmtYen(it.raw)}` } } },
        interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false }, ticks: { ...tickOpt(), maxTicksLimit: 8 } }, y: { grid: gridOpt(), ticks: { ...tickOpt(), callback: (v) => (v / 1000) + 'k' }, beginAtZero: true } }
      }
    });

    // 施設別メーカー浸透度(ヒートマップ的テーブル、模擬データの制約により全処置合計のみ)
    const makers8 = D.dealerMaker.topMakersForMatrix;
    const penThead = '<tr><th>施設</th>' + makers8.map(m => `<th>${m}</th>`).join('') + '</tr>';
    const maxShare = Math.max(...FAC_KEYS.flatMap(k => makers8.map(m => D.dealerMaker.makerPenetration[k][m])));
    const penTbody = FAC_KEYS.map(k => {
      const f = D.benchmark.facilities[k];
      const cells = makers8.map(m => {
        const v = D.dealerMaker.makerPenetration[k][m];
        const alpha = 0.12 + 0.78 * (v / maxShare);
        return `<td><div class="heatcell" style="background:color-mix(in srgb, var(--s1) ${(alpha * 100).toFixed(0)}%, transparent);color:${alpha > 0.5 ? '#fff' : 'var(--text)'}">${(v * 100).toFixed(1)}%</div></td>`;
      }).join('');
      return `<tr><td><b>${f.label}</b></td>${cells}</tr>`;
    }).join('');
    document.getElementById('penetrationTable').querySelector('thead').innerHTML = penThead;
    document.getElementById('penetrationTable').querySelector('tbody').innerHTML = penTbody;

    // HHIチャート(償還額の大きいカテゴリが上に来るよう、昇順に並べ替えて描画)
    const top15Cat = categoryConcentration.slice(0, 15).reverse();
    function hhiColor(h) { return h > 2500 ? STATUS.critical : h > 1500 ? STATUS.warning : STATUS.good; }
    makeChart('chartHHI', {
      type: 'bar',
      data: {
        labels: top15Cat.map(cat => cat.category.length > 16 ? cat.category.slice(0, 16) + '…' : cat.category),
        datasets: [{ label: 'HHI', data: top15Cat.map(cat => cat.hhi), backgroundColor: top15Cat.map(cat => hhiColor(cat.hhi)), borderRadius: 4, borderSkipped: false, barPercentage: 0.65 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: legendOpt(false),
          tooltip: { ...tooltipOpt(), callbacks: { title: (items) => top15Cat[items[0].dataIndex].category, label: (it) => `HHI ${it.raw}(首位:${top15Cat[it.dataIndex].topMaker} ${fmtPct(top15Cat[it.dataIndex].topShare)})` } }
        },
        scales: { x: { grid: gridOpt(), ticks: tickOpt(), beginAtZero: true }, y: { grid: { display: false }, ticks: tickOpt() } }
      }
    });

    // HHI詳細表
    const hhiThead = ['材料カテゴリ', '件数', '償還額合計', '首位メーカー', '首位シェア', 'HHI', '評価'];
    document.getElementById('hhiTable').querySelector('thead').innerHTML = '<tr>' + hhiThead.map(h => `<th>${h}</th>`).join('') + '</tr>';
    document.getElementById('hhiTable').querySelector('tbody').innerHTML = categoryConcentration.map(cat => {
      const badge = cat.hhi > 2500 ? '<span class="badge critical">寡占的</span>' : cat.hhi > 1500 ? '<span class="badge warning">やや集中</span>' : '<span class="badge good">競争的</span>';
      return `<tr><td>${cat.category}</td><td>${fmtNum(cat.count)}</td><td>${fmtYen(cat.totalValue)}</td><td>${cat.topMaker || '-'}</td><td>${fmtPct(cat.topShare)}</td><td>${cat.hhi}</td><td>${badge}</td></tr>`;
    }).join('');
  }

  // ================================================================
  // TAB 4: 在庫情報
  // ================================================================
  const invCategorySel = document.getElementById('invCategory');
  const invConsignmentSel = document.getElementById('invConsignment');
  const invRiskOnly = document.getElementById('invRiskOnly');
  const invSearch = document.getElementById('invSearch');

  const invCategories = [...new Set(D.inventory.items.map(i => i.material))].sort();
  invCategorySel.innerHTML = '<option value="all">すべて</option>' + invCategories.map(c => `<option value="${c}">${c}</option>`).join('');
  [invCategorySel, invConsignmentSel, invRiskOnly, invSearch].forEach(el => el.addEventListener('input', renderInventory));

  function fillColor(rate) {
    if (rate < 0.3) return STATUS.critical;
    if (rate < 0.6) return STATUS.warning;
    return STATUS.good;
  }

  function renderInventory() {
    applyChartDefaults();
    const c = colors();
    let items = D.inventory.items;
    if (invCategorySel.value !== 'all') items = items.filter(i => i.material === invCategorySel.value);
    if (invConsignmentSel.value !== 'all') items = items.filter(i => (i.consignment ? '1' : '0') === invConsignmentSel.value);
    if (invRiskOnly.checked) items = items.filter(i => i.stockoutRisk);
    const q = invSearch.value.trim().toLowerCase();
    if (q) items = items.filter(i => i.name.toLowerCase().includes(q) || i.maker.toLowerCase().includes(q));

    const riskCount = items.filter(i => i.stockoutRisk).length;
    const avgFill = items.length ? items.reduce((s, i) => s + i.fillRate, 0) / items.length : 0;
    const consignValue = items.filter(i => i.consignment).reduce((s, i) => s + i.stockValue, 0);
    const purchaseValue = items.filter(i => !i.consignment).reduce((s, i) => s + i.stockValue, 0);

    document.getElementById('invKpis').innerHTML = [
      { label: '対象アイテム数', value: fmtNum(items.length), sub: '定数品(RFIDラック管理対象)' },
      { label: '平均充足率', value: fmtPct(avgFill), sub: '現在庫 ÷ 定数' },
      { label: '欠品リスク件数', value: fmtNum(riskCount), sub: '週間予測 > 現在庫', info: '直近8週の使用実績から算出した週間使用予測が、現在の模擬在庫数を上回るアイテム' },
      { label: '預託品 評価額', value: fmtYen(consignValue), sub: '現在庫 × 償還価格' },
      { label: '買取品 評価額', value: fmtYen(purchaseValue), sub: '現在庫 × 償還価格' }
    ].map(k => `<div class="kpi"><div class="label">${k.label}${k.info ? `<span class="info-dot" title="${k.info}">i</span>` : ''}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');

    document.getElementById('invTableSub').textContent = `表示中 ${items.length}件 / 全${D.inventory.items.length}件`;

    // 充足率分布
    const bins = [{ label: '〜25%', min: 0, max: 0.25 }, { label: '25〜50%', min: 0.25, max: 0.5 }, { label: '50〜75%', min: 0.5, max: 0.75 }, { label: '75〜100%', min: 0.75, max: 1.0 }, { label: '100%〜', min: 1.0, max: Infinity }];
    const binCounts = bins.map(b => items.filter(i => i.fillRate >= b.min && i.fillRate < b.max).length);
    const binColors = bins.map(b => fillColor((b.min + Math.min(b.max, 1.3)) / 2));
    makeChart('chartFillDist', {
      type: 'bar',
      data: { labels: bins.map(b => b.label), datasets: [{ label: 'アイテム数', data: binCounts, backgroundColor: binColors, borderRadius: 4, borderSkipped: false, barPercentage: 0.6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(false), tooltip: tooltipOpt() },
        scales: { x: { grid: { display: false }, ticks: tickOpt() }, y: { grid: gridOpt(), ticks: tickOpt(), beginAtZero: true } }
      }
    });

    makeChart('chartConsignValue', {
      type: 'doughnut',
      data: { labels: ['預託品', '買取品'], datasets: [{ data: [consignValue, purchaseValue], backgroundColor: [c.series[0], c.series[2]], borderColor: c.surface, borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: legendOpt(true), tooltip: { ...tooltipOpt(), callbacks: { label: (it) => `${it.label}: ${fmtYen(it.raw)}` } } } }
    });

    // テーブル(充足率の低い順)
    const sorted = [...items].sort((a, b) => a.fillRate - b.fillRate);
    const thead = ['品名', '規格', 'メーカー', 'カテゴリ', '区分', '定数', '現在庫', '充足率(対定数)', '週間使用予測', '今週の欠品リスク'];
    document.getElementById('invTable').querySelector('thead').innerHTML = '<tr>' + thead.map(h => `<th>${h}</th>`).join('') + '</tr>';
    document.getElementById('invTable').querySelector('tbody').innerHTML = sorted.map(i => {
      const fc = fillColor(i.fillRate);
      const consignBadge = i.consignment ? '<span class="badge good">預託</span>' : '<span class="badge" style="color:var(--muted);background:var(--surface-2)">買取</span>';
      const riskBadge = i.stockoutRisk ? '<span class="badge critical">要補充</span>' : '<span class="badge good">正常</span>';
      return `<tr>
        <td>${i.name}</td><td>${i.spec || ''}</td><td>${i.maker}</td>
        <td>${i.material.length > 12 ? i.material.slice(0, 12) + '…' : i.material}</td>
        <td>${consignBadge}</td>
        <td>${i.parLevel}</td><td>${i.currentStock}</td>
        <td><span class="fill-bar"><span style="width:${Math.min(100, i.fillRate * 100)}%;background:${fc}"></span></span>${fmtPct(i.fillRate)}</td>
        <td>${i.forecastNextWeek}/週</td>
        <td>${riskBadge}</td>
      </tr>`;
    }).join('');
  }

  // ================================================================
  // TAB 5: デバイス多様性
  // ================================================================
  // 方式(タイプ)は品名・規格・材料区分の文字列から判定する。上から順に評価し最初に一致したものを採用。
  // 自施設で実績のない方式も「実績なし」として表示し、採用状況の全体像を把握できるようにする。
  const DEVICE_DOMAINS = [
    { key: 'abl', label: 'アブレーション', procs: ['経皮的カテーテル心筋焼灼術'], groups: [
      { name: 'アブレーションカテーテル', materials: ['心臓用カテーテル(アブレーション用)'], types: [
        { label: '高周波(RF)カテーテル', test: /TactiCath|ThermoCool|SmartTouch|FlexAbility|IntellaNav|QDOT|高周波/, desc: '先端電極から高周波通電し点状に焼灼(コンタクトフォースセンサー付き等)' },
        { label: 'クライオバルーン', test: /クライオ|Arctic|POLARx/i, desc: 'バルーン内で冷凍し肺静脈を一括隔離' },
        { label: 'ホットバルーン', test: /ホットバルーン|SATAKE/, desc: 'バルーン内の液体を高周波で加温し一括隔離' },
        { label: 'パルスフィールド(PFA)', test: /パルス|PFA|FARAPULSE|PulseSelect|VARIPULSE|Sphere/i, desc: '高電圧パルスによる不可逆的電気穿孔で心筋選択的に焼灼' }
      ] },
      { name: 'マッピング・診断用電極カテーテル', materials: ['心臓用カテーテル(診断用 複数電極)'], types: [
        { label: '高密度マッピング', test: /Orion|PentaRay|OctaRay|Advisor HD|HD Grid/, desc: '多数の小電極で詳細な電位マップを作成' },
        { label: '円状(リング)マッピング', test: /Achieve|Lasso|円状/, desc: '肺静脈入口部の電位を円周状に記録' },
        { label: '多極診断(固定電極)', test: /DecaNav|Inquiry|診断用電極/, desc: '冠静脈洞・右心系などに留置する標準的な電極カテーテル' }
      ] }
    ] },
    { key: 'pci', label: 'PCI', procs: ['PCI（待機的）', 'PCI（緊急）'], groups: [
      { name: 'PTCAバルーン', materials: ['PTCAダイレーテーションカテーテル（一般型）', 'PTCAダイレーテーションカテーテル（高圧型）'], types: [
        { label: 'セミコンプライアント', test: /Semi-NC|セミコンプライアント/, desc: '前拡張などに用いる標準的なバルーン' },
        { label: 'ノンコンプライアント(NC)', test: /NC|高圧/, desc: '高圧でも径が変化しにくく後拡張に用いる' },
        { label: 'スコアリング/カッティング', test: /スコアリング|カッティング|Scoreflex|Wolverine/i, desc: 'ブレード・ワイヤーで石灰化病変に切れ目を入れる' },
        { label: '薬剤コーティング(DCB)', test: /薬剤コーティング|DCB|SeQuent|Agent/i, desc: 'ステントを留置せず薬剤を血管壁に塗布する' }
      ] },
      { name: '冠動脈イメージング', materials: ['血管内超音波カテーテル', '血管内光干渉断層用カテーテル'], types: [
        { label: 'IVUS(血管内超音波)', test: /IVUS|超音波/, desc: '超音波で血管壁・プラークを観察' },
        { label: 'OCT/OFDI(光干渉断層)', test: /OCT|OFDI|光干渉/, desc: '近赤外光で高解像度に観察' }
      ] },
      { name: 'デバルキング(石灰化・プラーク切除)', materials: ['アテローム切除用カテーテル', '高速回転式経皮経管アテレクトミーカテーテル'], types: [
        { label: 'ロータブレーター(高速回転式)', test: /ロータブレーター|Rota/, desc: 'ダイヤモンド粒子付きバーの高速回転で石灰化を切削' },
        { label: '方向性アテレクトミー(DCA)', test: /ハンター|切削式|DCA/, desc: 'カッターでプラークを切除・回収' },
        { label: 'オービタル(OAD)', test: /オービタル|Diamondback/i, desc: '偏心クラウンの軌道回転で石灰化を切削' },
        { label: '血管内砕石術(IVL)', test: /砕石|IVL|Shockwave/i, desc: '音圧波で石灰化を破砕' }
      ] },
      { name: 'PTCAガイドワイヤー', materials: ['PTCAガイドワイヤー（標準型）', 'PTCAガイドワイヤー（貫通型）'], types: [
        { label: '標準型(ワークホース)', test: /標準型/, desc: '一般病変の通過に用いる柔軟なワイヤー' },
        { label: '貫通型(CTO用)', test: /貫通型/, desc: '慢性完全閉塞などの通過用の硬いワイヤー' }
      ] },
      { name: '止血デバイス', materials: ['経皮的血管穿刺部止血材料'], types: [
        { label: '縫合型', test: /パークローズ|Perclose/, desc: '縫合糸で穿刺部を閉鎖' },
        { label: 'コラーゲンプラグ型', test: /アンギオシール|Angio-Seal/, desc: 'アンカーとコラーゲンで穿刺部を閉鎖' }
      ] }
    ] },
    { key: 'cied', label: '植込みデバイス(PM/ICD)', procs: ['ペースメーカー移植術', '植込型除細動器移植術'], groups: [
      { name: 'ペースメーカ本体', materials: ['ペースメーカ'], types: [
        { label: '経静脈 デュアルチャンバ', test: /デュアル/, desc: '心房・心室の2本のリードを使用' },
        { label: '経静脈 シングルチャンバ', test: /シングル/, desc: '1本のリードを使用' },
        { label: 'リードレス', test: /リードレス|Micra|AVEIR/i, desc: '右室内に直接留置するカプセル型' }
      ] },
      { name: '植込型除細動器(ICD)本体', materials: ['植込型除細動器'], types: [
        { label: '皮下植込型(S-ICD)', test: /S-ICD|EMBLEM|皮下/, desc: '経静脈リードを用いず皮下に植込み' },
        { label: '経静脈 シングルチャンバ', test: /シングル/, desc: '右室リード1本' },
        { label: '経静脈 デュアルチャンバ', test: /デュアル/, desc: '心房・心室リードを使用' }
      ] }
    ] }
  ];
  const OTHER_TYPE = { label: '未分類', desc: '分類ルールに一致しなかった製品' };

  const dvDomainSel = document.getElementById('dvDomain');
  const dvGroupSel = document.getElementById('dvGroup');
  dvDomainSel.innerHTML = DEVICE_DOMAINS.map(d => `<option value="${d.key}">${d.label}</option>`).join('');
  function fillGroupOptions() {
    const dom = DEVICE_DOMAINS.find(d => d.key === dvDomainSel.value);
    dvGroupSel.innerHTML = dom.groups.map((g, i) => `<option value="${i}">${g.name}</option>`).join('');
  }
  fillGroupOptions();
  dvDomainSel.addEventListener('change', () => { fillGroupOptions(); renderDevice(); });
  dvGroupSel.addEventListener('change', renderDevice);

  function classifyType(group, r) {
    const p = D.products[r.code] || { name: '', spec: '' };
    const text = `${p.name} ${p.spec} ${r.material}`;
    return group.types.find(t => t.test.test(text)) || OTHER_TYPE;
  }

  // 群ごとに方式別・製品別の件数を集計
  function summarizeGroup(group, procs) {
    const rows = ROWS.filter(r => procs.includes(r.procedure) && group.materials.includes(r.material));
    const types = rows.some(r => classifyType(group, r) === OTHER_TYPE) ? group.types.concat([OTHER_TYPE]) : group.types;
    const byType = new Map(types.map(t => [t, 0]));
    const byProduct = new Map();
    for (const r of rows) {
      const t = classifyType(group, r);
      byType.set(t, byType.get(t) + 1);
      const pr = byProduct.get(r.code) || { code: r.code, type: t, maker: r.maker, price: r.price, count: 0, value: 0 };
      pr.count++; pr.value += r.price;
      byProduct.set(r.code, pr);
    }
    return { rows, types, byType, products: [...byProduct.values()].sort((a, b) => b.count - a.count) };
  }

  function typeColor(types, t) {
    return t === OTHER_TYPE ? colors().muted : colors().series[types.indexOf(t) % colors().series.length];
  }

  // ---- 他施設ベンチマーク: 主要デバイスの多様性 ----
  // A病院は実績から集計。B〜Eは A病院の方式別シェアに施設プロファイル(data.js benchmark.deviceProfiles)を適用した模擬値
  const ALL_DEVICE_GROUPS = DEVICE_DOMAINS.flatMap(dom => dom.groups.map(g => ({ dom, g })));
  const bmDevGroupSel = document.getElementById('bmDevGroup');
  bmDevGroupSel.addEventListener('change', () => renderDeviceBenchmark(bmProcSel.value));

  // A病院の方式別シェアに施設プロファイル(mult/add)を適用し、合計1に正規化する
  function applyDeviceProfile(k, g, types, aShares) {
    const pf = D.benchmark.deviceProfiles[k][g.name] || {};
    const mult = pf.mult || {}, add = pf.add || {};
    const raw = types.map((t, i) => aShares[i] * (mult[t.label] !== undefined ? mult[t.label] : 1) + (add[t.label] || 0));
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map(v => v / sum);
  }

  function facilityDeviceStats(k, dom, g) {
    const s = summarizeGroup(g, dom.procs);
    const n = s.rows.length;
    const aShares = s.types.map(t => n ? s.byType.get(t) / n : 0);
    const aEff = n ? 1 / s.products.reduce((acc, p) => acc + (p.count / n) ** 2, 0) : 0;
    let shares = aShares, nProducts = s.products.length, eff = aEff;
    if (k !== 'A' && n) {
      const pf = D.benchmark.deviceProfiles[k][g.name] || {};
      shares = applyDeviceProfile(k, g, s.types, aShares);
      const used = shares.filter(v => v > 0).length;
      nProducts = Math.max(used, s.products.length + (pf.productDelta || 0));
      eff = Math.min(nProducts, Math.max(1, aEff * nProducts / s.products.length));
    }
    const used = s.types.filter((t, i) => t !== OTHER_TYPE && shares[i] > 0).length;
    return { types: s.types, shares, used, nTypes: g.types.length, nProducts, eff };
  }

  function renderDeviceBenchmark(proc) {
    const c = colors();
    const list = ALL_DEVICE_GROUPS.filter(x => proc === 'all' || x.dom.procs.includes(proc));
    const card = document.getElementById('bmDevCards');
    card.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const cur = bmDevGroupSel.value;
    bmDevGroupSel.innerHTML = list.map(x => `<option value="${x.g.name}">${x.g.name}</option>`).join('');
    if (list.some(x => x.g.name === cur)) bmDevGroupSel.value = cur;
    const sel = list.find(x => x.g.name === bmDevGroupSel.value);

    // 施設×デバイス群の多様性表(色の濃さ=列内での実効製品数の相対値)
    const stats = FAC_KEYS.map(k => list.map(x => facilityDeviceStats(k, x.dom, x.g)));
    const colMax = list.map((x, j) => Math.max(...stats.map(row => row[j].eff)) || 1);
    const thead = '<tr><th>施設</th>' + list.map(x => `<th class="dev-col ${x === sel ? 'active' : ''}" data-group="${x.g.name}">${x.g.name}</th>`).join('') + '</tr>';
    const tbody = FAC_KEYS.map((k, i) => '<tr><td><b>' + facShort(k) + (k === 'A' ? '(自施設)' : '') + '</b></td>' + stats[i].map((st, j) => {
      const alpha = 0.1 + 0.75 * (st.eff / colMax[j]);
      return `<td><div class="heatcell" data-group="${list[j].g.name}" style="cursor:pointer;background:color-mix(in srgb, var(--s1) ${(alpha * 100).toFixed(0)}%, transparent);color:${alpha > 0.7 ? '#fff' : 'var(--text)'}">${st.used}/${st.nTypes}方式<br><span style="font-weight:400">${st.nProducts}製品・実効${st.eff.toFixed(1)}</span></div></td>`;
    }).join('') + '</tr>').join('');
    const table = document.getElementById('bmDevTable');
    table.querySelector('thead').innerHTML = thead;
    table.querySelector('tbody').innerHTML = tbody;

    // 選択中デバイス群の方式構成(100%積み上げ、上からA〜E)
    const facKeys = [...FAC_KEYS].reverse();
    const selStats = facKeys.map(k => facilityDeviceStats(k, sel.dom, sel.g));
    const types = selStats[0].types;
    document.getElementById('bmDevTitle').textContent = `方式構成の比較: ${sel.g.name}`;
    makeChart('chartBmDevMix', {
      type: 'bar',
      data: {
        labels: facKeys.map(k => facShort(k) + (k === 'A' ? '(自施設)' : '')),
        datasets: types.map((t, i) => ({
          label: t.label,
          data: selStats.map(st => +(st.shares[i] * 100).toFixed(1)),
          backgroundColor: typeColor(types, t), borderColor: c.surface, borderWidth: 2, stack: 'dev'
        }))
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: legendOpt(true),
          tooltip: { ...tooltipOpt(), callbacks: {
            label: (it) => `${it.dataset.label}: ${it.raw}%`,
            footer: (items) => {
              const st = selStats[items[0].dataIndex];
              const lines = [`採用 ${st.used}/${st.nTypes}方式・${st.nProducts}製品・実効製品数 ${st.eff.toFixed(1)}`];
              if (sel.g === DEVICE_DOMAINS.find(d => d.key === 'abl').groups[0]) {
                const m = ablationCostModel(facKeys[items[0].dataIndex]);
                lines.push(`アブレーションカテーテル費/症例 ${fmtYen(m.catheterCost)}・材料償還額/症例 ${fmtYen(m.avgReimburse)}`);
              }
              return lines;
            }
          } }
        },
        scales: {
          x: { stacked: true, min: 0, max: 100, grid: gridOpt(), ticks: { ...tickOpt(), callback: (v) => v + '%' } },
          y: { stacked: true, grid: { display: false }, ticks: tickOpt() }
        }
      }
    });
  }

  document.getElementById('bmDevTable').addEventListener('click', (e) => {
    const el = e.target.closest('[data-group]');
    if (!el) return;
    bmDevGroupSel.value = el.dataset.group;
    renderDeviceBenchmark(bmProcSel.value);
  });

  // ---- 他施設ベンチマーク: 1症例あたり材料使用量 ----
  // A病院は対象年の実績から集計。B〜Eは A病院の値 × 施設係数(data.js benchmark.usageProfiles)の模擬値(使用率は100%上限)
  const PCI_PROCS = ['PCI（待機的）', 'PCI（緊急）'];
  const inMaterials = (...mats) => (r) => mats.includes(r.material);
  const USAGE_INDICATORS = [
    { key: 'stents', procs: PCI_PROCS, label: 'ステント本数', kind: 'count', match: inMaterials('冠動脈ステント（薬剤溶出型）') },
    { key: 'balloons', procs: PCI_PROCS, label: 'PTCAバルーン本数', kind: 'count', match: inMaterials('PTCAダイレーテーションカテーテル（一般型）', 'PTCAダイレーテーションカテーテル（高圧型）') },
    { key: 'guidewires', procs: PCI_PROCS, label: 'PTCAガイドワイヤー本数', kind: 'count', match: inMaterials('PTCAガイドワイヤー（標準型）', 'PTCAガイドワイヤー（貫通型）') },
    { key: 'imaging', procs: PCI_PROCS, label: '血管内イメージング使用率', kind: 'rate', match: inMaterials('血管内超音波カテーテル', '血管内光干渉断層用カテーテル') },
    { key: 'closure', procs: PCI_PROCS, label: '止血デバイス使用率', kind: 'rate', match: inMaterials('経皮的血管穿刺部止血材料') },
    { key: 'debulking', procs: PCI_PROCS, label: 'デバルキング使用率', kind: 'rate', match: inMaterials('アテローム切除用カテーテル', '高速回転式経皮経管アテレクトミーカテーテル') },
    { key: 'touchup', procs: [ABL_PROC], label: '追加焼灼率(治療用カテーテル2本以上)', kind: 'rate2', match: inMaterials('心臓用カテーテル(アブレーション用)') },
    { key: 'hdMapping', procs: [ABL_PROC], label: '高密度マッピング使用率', kind: 'rate', match: (r) => r.material === '心臓用カテーテル(診断用 複数電極)' && /Orion|PentaRay|Advisor HD/.test(D.products[r.code].name) },
    { key: 'ice', procs: [ABL_PROC], label: '心腔内エコー(ICE)使用率', kind: 'rate', match: inMaterials('血管内超音波カテーテル') },
    { key: 'diagCath', procs: [ABL_PROC], label: '診断用電極カテーテル本数', kind: 'count', match: inMaterials('心臓用カテーテル(診断用 複数電極)') },
    { key: 'pmLeads', procs: ['ペースメーカー移植術'], label: 'リード本数', kind: 'count', match: inMaterials('ペースメーカ用リード') },
    { key: 'icdLeads', procs: ['植込型除細動器移植術'], label: 'リード・電極本数', kind: 'count', match: (r) => /リード/.test(r.material) },
    { key: 'discardsPci', procs: PCI_PROCS, area: '破棄・破損', label: 'PCI: 償還対象材料の破棄・破損本数', kind: 'count', match: (r) => r.useType === '破棄破損' && r.price > 0 },
    { key: 'discardsDevice', procs: ['ペースメーカー移植術', '植込型除細動器移植術', '両心室ペースメーカー移植術'], area: '破棄・破損', label: '植込みデバイス: 償還対象材料の破棄・破損本数', kind: 'count', match: (r) => r.useType === '破棄破損' && r.price > 0 }
  ];
  const caseKey = (r) => r.date + '|' + r.procedure + '|' + (r.cid || '');
  const indGroup = (ind) => ind.area || (ind.procs === PCI_PROCS ? 'PCI' : shortProc(ind.procs[0]));

  // A病院の実績値(対象年)。症例が無ければ null
  function ownUsage(ind) {
    const n = CASES.filter(c => ind.procs.includes(c.procedure)).length;
    if (!n) return null;
    const rows = ROWS.filter(r => ind.procs.includes(r.procedure) && ind.match(r));
    if (ind.kind === 'count') return rows.length / n;
    const perCase = new Map();
    for (const r of rows) perCase.set(caseKey(r), (perCase.get(caseKey(r)) || 0) + 1);
    return [...perCase.values()].filter(v => v >= (ind.kind === 'rate2' ? 2 : 1)).length / n;
  }
  function facilityUsage(k, ind) {
    const own = ownUsage(ind);
    if (own === null || k === 'A') return own;
    const v = own * (D.benchmark.usageProfiles[k].mult[ind.key] || 1);
    return ind.kind === 'count' ? v : Math.min(1, v);
  }
  const fmtUsage = (ind, v) => v === null ? '-' : ind.kind === 'count' ? v.toFixed(2) + '本' : (v * 100).toFixed(1) + '%';

  function renderUsageBenchmark(proc) {
    const list = USAGE_INDICATORS.filter(ind => (proc === 'all' || ind.procs.includes(proc)) && ownUsage(ind) !== null);
    document.getElementById('bmUsageSub').textContent = `${periodLabel()}・1症例あたり。色の濃さ=指標内での相対値、右端=他4施設の中央値に対するA病院の差(±5%未満は同水準)。施設B〜Eは施設特性を反映した模擬値`;
    const table = document.getElementById('bmUsageTable');
    table.querySelector('thead').innerHTML = '<tr><th>領域</th><th>指標</th>' + FAC_KEYS.map(k => `<th>${facShort(k)}</th>`).join('') + '<th>他4施設中央値</th><th>A病院 vs 中央値</th></tr>';
    let prevGroup = '';
    table.querySelector('tbody').innerHTML = list.map(ind => {
      const vals = FAC_KEYS.map(k => facilityUsage(k, ind));
      const max = Math.max(...vals) || 1;
      const peers = vals.slice(1).sort((a, b) => a - b);
      const median = (peers[1] + peers[2]) / 2;
      const diff = median ? (vals[0] - median) / median : 0;
      const group = indGroup(ind);
      const groupCell = group === prevGroup ? '' : group;
      prevGroup = group;
      const cells = vals.map((v, i) => {
        const alpha = 0.1 + 0.6 * (v / max);
        return `<td><div class="heatcell" style="background:color-mix(in srgb, var(--s1) ${(alpha * 100).toFixed(0)}%, transparent);${i === 0 ? 'box-shadow:inset 0 0 0 1.5px var(--s1);' : ''}">${fmtUsage(ind, v)}</div></td>`;
      }).join('');
      const diffTxt = Math.abs(diff) < 0.05 ? '<span style="color:var(--muted)">同水準</span>'
        : `<b style="color:${diff > 0 ? 'var(--serious)' : 'var(--s1)'}">${diff > 0 ? '+' : ''}${(diff * 100).toFixed(0)}%</b> ${diff > 0 ? '多い' : '少ない'}`;
      return `<tr><td><b>${groupCell}</b></td><td>${ind.label}</td>${cells}<td>${fmtUsage(ind, median)}</td><td>${diffTxt}</td></tr>`;
    }).join('') || `<tr><td colspan="9" style="color:var(--muted)">${periodLabel()}は対象となる指標のデータがありません</td></tr>`;
  }

  // ---- 他施設ベンチマーク: ファンネルプロット(症例数 × 1症例あたり材料償還額) ----
  // 管理限界 = 5施設の症例数加重平均 ± z × SD/√n(SDはA病院の症例間標準偏差を全施設に適用)
  function funnelStats(proc) {
    const own = CASES.filter(cs => cs.procedure === proc).map(cs => cs.reimburse);
    const mean = own.reduce((a, b) => a + b, 0) / own.length;
    const sd = Math.sqrt(own.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, own.length - 1));
    const pts = FAC_KEYS.map(k => { const m = facMetric(k, proc); return { k, n: m.nCases * periodYears(), y: m.avgReimburse }; });
    const center = pts.reduce((a, p) => a + p.n * p.y, 0) / pts.reduce((a, p) => a + p.n, 0);
    pts.forEach(p => { p.z = sd ? (p.y - center) / (sd / Math.sqrt(p.n)) : 0; });
    return { pts, center, sd };
  }

  function renderFunnel(proc) {
    const wrap = document.getElementById('bmFunnelWrap');
    const note = document.getElementById('bmFunnelNote');
    if (proc === 'all') {
      wrap.style.display = 'none';
      note.innerHTML = '左の「処置内容」で処置を選択すると表示します(処置により材料費の水準が大きく異なるため、全処置合算では作成しません)';
      return;
    }
    wrap.style.display = '';
    const c = colors();
    const { pts, center, sd } = funnelStats(proc);
    const nMax = Math.max(...pts.map(p => p.n)) * 1.25, nMin = Math.max(1, Math.min(...pts.map(p => p.n)) * 0.5);
    const xs = Array.from({ length: 60 }, (_, i) => nMin + (nMax - nMin) * i / 59);
    const limit = (z, sign) => xs.map(x => ({ x, y: center + sign * z * sd / Math.sqrt(x) }));
    const lineDs = (label, data, color, dash) => ({ type: 'line', label, data, borderColor: color, borderWidth: 1.5, borderDash: dash, pointRadius: 0, fill: false, tension: 0 });
    makeChart('chartBmFunnel', {
      type: 'scatter',
      data: {
        datasets: [
          ...pts.map(p => ({ label: facShort(p.k) + (p.k === 'A' ? '(自施設)' : ''), data: [{ x: p.n, y: p.y }], backgroundColor: c.series[FAC_COLOR_IDX[p.k]], borderColor: p.k === 'A' ? c.text : c.surface, borderWidth: 2, pointRadius: p.k === 'A' ? 9 : 7, pointHoverRadius: 10 })),
          lineDs('平均', xs.map(x => ({ x, y: center })), c.muted, []),
          lineDs('95%管理限界', limit(1.96, 1), STATUS.warning, [6, 4]),
          lineDs('95%管理限界(下)', limit(1.96, -1), STATUS.warning, [6, 4]),
          lineDs('99.8%管理限界', limit(3.09, 1), STATUS.critical, [2, 3]),
          lineDs('99.8%管理限界(下)', limit(3.09, -1), STATUS.critical, [2, 3])
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { ...legendOpt(true), labels: { ...legendOpt(true).labels, filter: (item) => !/\(下\)/.test(item.text) } },
          tooltip: { ...tooltipOpt(), filter: (it) => it.datasetIndex < pts.length, callbacks: { label: (it) => `${it.dataset.label}: ${fmtNum(it.raw.x)}症例・${fmtYen(it.raw.y)}/症例` } }
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: `症例数(${periodLabel()})`, color: c.textSec }, grid: gridOpt(), ticks: tickOpt() },
          y: { title: { display: true, text: '1症例あたり材料償還額', color: c.textSec }, grid: gridOpt(), ticks: { ...tickOpt(), callback: (v) => (v / 1000).toFixed(0) + 'k' } }
        }
      }
    });
    note.innerHTML = pts.map(p => {
      const z = (p.y - center) / (sd / Math.sqrt(p.n));
      const status = Math.abs(z) > 3.09 ? `<span class="badge critical">${z > 0 ? '高い' : '低い'}(99.8%限界外)</span>`
        : Math.abs(z) > 1.96 ? `<span class="badge warning">${z > 0 ? 'やや高い' : 'やや低い'}(95%限界外)</span>`
        : '<span class="badge good">限界内(偶然の範囲)</span>';
      return `<span class="funnel-item"><b>${facShort(p.k)}</b> ${status}</span>`;
    }).join('');
  }

  // ---- 他施設ベンチマーク: 新しい方式の導入推移 ----
  // A病院は実績(全期間・四半期)。B〜Eは導入時期の差(adoptionLag、四半期)だけずらしたA病院の方式構成に施設プロファイルを適用した模擬値
  const ADOPTION_TARGETS = [
    { domain: 'abl', group: 0, type: 'パルスフィールド(PFA)', label: 'パルスフィールド(PFA) / アブレーションカテーテル' },
    { domain: 'pci', group: 1, type: 'OCT/OFDI(光干渉断層)', label: 'OCT/OFDI / 冠動脈イメージング' },
    { domain: 'cied', group: 0, type: 'リードレス', label: 'リードレス / ペースメーカ本体' },
    { domain: 'cied', group: 1, type: '皮下植込型(S-ICD)', label: '皮下植込型(S-ICD) / ICD本体' }
  ];
  const bmAdoptSel = document.getElementById('bmAdoptTarget');
  bmAdoptSel.innerHTML = ADOPTION_TARGETS.map((t, i) => `<option value="${i}">${t.label}</option>`).join('');
  bmAdoptSel.addEventListener('change', renderAdoption);

  function renderAdoption() {
    const c = colors();
    const target = ADOPTION_TARGETS[+bmAdoptSel.value];
    const dom = DEVICE_DOMAINS.find(d => d.key === target.domain);
    const g = dom.groups[target.group];
    const types = g.types;
    const ti = types.findIndex(t => t.label === target.type);
    const quarterOf = (ym) => ym.slice(0, 4) + 'Q' + Math.ceil(+ym.slice(4, 6) / 3);
    const rows = D.rawRows.filter(r => dom.procs.includes(r.procedure) && g.materials.includes(r.material));
    const byQ = new Map();
    for (const r of rows) {
      const q = quarterOf(r.ym);
      if (!byQ.has(q)) byQ.set(q, types.map(() => 0));
      const t = classifyType(g, r);
      const i = types.indexOf(t);
      if (i >= 0) byQ.get(q)[i]++;
    }
    const qs = [...byQ.keys()].sort();
    const quarters = [];
    for (let y = +qs[0].slice(0, 4), q = +qs[0].slice(5); `${y}Q${q}` <= qs[qs.length - 1]; q === 4 ? (y++, q = 1) : q++) quarters.push(`${y}Q${q}`);
    const aShares = quarters.map(q => { const v = byQ.get(q); if (!v) return null; const n = v.reduce((a, b) => a + b, 0); return n ? v.map(x => x / n) : null; });
    const series = FAC_KEYS.map(k => {
      const lag = k === 'A' ? 0 : D.benchmark.usageProfiles[k].adoptionLag;
      return quarters.map((q, i) => {
        const j = Math.min(quarters.length - 1, Math.max(0, i - lag));
        const sh = aShares[j];
        if (!sh || !aShares[i]) return null;
        return +((k === 'A' ? sh : applyDeviceProfile(k, g, types, sh))[ti] * 100).toFixed(1);
      });
    });
    makeChart('chartBmAdopt', {
      type: 'line',
      data: {
        labels: quarters,
        datasets: FAC_KEYS.map((k, i) => ({
          label: facShort(k) + (k === 'A' ? '(自施設)' : ''), data: series[i],
          borderColor: c.series[FAC_COLOR_IDX[k]], backgroundColor: c.series[FAC_COLOR_IDX[k]],
          borderWidth: k === 'A' ? 3 : 1.8, pointRadius: k === 'A' ? 3 : 2, tension: 0.25, spanGaps: false
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(true), tooltip: { ...tooltipOpt(), mode: 'index', intersect: false, callbacks: { label: (it) => `${it.dataset.label}: ${it.raw}%` } } },
        interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false }, ticks: { ...tickOpt(), maxRotation: 0, autoSkip: true } }, y: { min: 0, grid: gridOpt(), ticks: { ...tickOpt(), callback: (v) => v + '%' } } }
      }
    });
  }

  function renderDevice() {
    applyChartDefaults();
    const c = colors();
    const dom = DEVICE_DOMAINS.find(d => d.key === dvDomainSel.value);
    const gi = +dvGroupSel.value;
    const group = dom.groups[gi];
    const sum = summarizeGroup(group, dom.procs);
    const total = sum.rows.length;

    // KPI
    const usedTypes = sum.types.filter(t => sum.byType.get(t) > 0 && t !== OTHER_TYPE).length;
    const makers = new Set(sum.rows.map(r => r.maker)).size;
    const effective = total ? 1 / sum.products.reduce((s, p) => s + (p.count / total) ** 2, 0) : 0;
    document.getElementById('dvKpis').innerHTML = [
      { label: '使用件数', value: fmtNum(total), sub: `${group.name}・${periodLabel()}` },
      { label: '採用している方式', value: `${usedTypes} / ${group.types.length}`, sub: '実績のある方式 / 主な方式' },
      { label: '採用製品数', value: fmtNum(sum.products.length), sub: `メーカー ${makers}社` },
      { label: '実効製品数', value: effective.toFixed(1), sub: '使用の偏りを考慮した製品の多様性', info: '逆シンプソン指数(1 ÷ 各製品シェアの2乗和)。全製品を均等に使うと採用製品数と一致し、1製品に偏るほど1に近づきます' }
    ].map(k => `<div class="kpi"><div class="label">${k.label}${k.info ? `<span class="info-dot" title="${k.info}">i</span>` : ''}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');

    // 領域内の全デバイス群の方式構成(行クリックで群を切替)
    document.getElementById('dvMixSub').textContent = `${dom.label}で使用するデバイス群ごとの方式構成(使用件数ベース)。行をクリックすると下の詳細が切り替わります`;
    document.getElementById('dvMix').innerHTML = dom.groups.map((g, i) => {
      const s = summarizeGroup(g, dom.procs);
      const n = s.rows.length || 1;
      const segs = s.types.filter(t => s.byType.get(t) > 0).map(t => {
        const pct = s.byType.get(t) / n * 100;
        return `<div style="width:${pct}%;background:${typeColor(s.types, t)}" title="${t.label}: ${s.byType.get(t)}件(${pct.toFixed(1)}%)">${pct >= 12 ? pct.toFixed(0) + '%' : ''}</div>`;
      }).join('');
      const chips = s.types.map(t => {
        const v = s.byType.get(t);
        return v > 0
          ? `<span class="chip"><span class="dot" style="background:${typeColor(s.types, t)}"></span>${t.label} ${fmtNum(v)}件</span>`
          : `<span class="chip none" title="${t.desc}"><span class="dot"></span>${t.label}(実績なし)</span>`;
      }).join('');
      return `<div class="mix-row ${i === gi ? 'active' : ''}" data-gi="${i}">
        <div class="mix-name">${g.name}<small>${fmtNum(s.rows.length)}件・${s.products.length}製品</small></div>
        <div><div class="usetype-bar mix-bar">${segs}</div><div class="chips">${chips}</div></div>
      </div>`;
    }).join('');

    // 方式別 使用件数(実績なしの方式も0件として表示)
    document.getElementById('dvTypeSub').textContent = `${group.name}・使用件数(本数)ベース`;
    const typeLabels = sum.types.map(t => sum.byType.get(t) > 0 ? t.label : t.label + ' ※実績なし');
    makeChart('chartDvType', {
      type: 'bar',
      data: { labels: typeLabels, datasets: [{ label: '使用件数', data: sum.types.map(t => sum.byType.get(t)), backgroundColor: sum.types.map(t => typeColor(sum.types, t)), borderRadius: 4, borderSkipped: false, barPercentage: 0.6 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: legendOpt(false),
          tooltip: { ...tooltipOpt(), callbacks: { label: (it) => `${fmtNum(it.raw)}件(${fmtPct(total ? it.raw / total : 0)})`, afterLabel: (it) => sum.types[it.dataIndex].desc } }
        },
        scales: { x: { grid: gridOpt(), ticks: { ...tickOpt(), precision: 0 }, beginAtZero: true }, y: { grid: { display: false }, ticks: tickOpt() } }
      }
    });

    // 方式別 四半期推移(切替・併用の傾向)
    const quarterOf = (ym) => ym.slice(0, 4) + 'Q' + Math.ceil(+ym.slice(4, 6) / 3);
    // データの無い四半期も軸に含め、時間の間隔を正しく表示する
    const yms = MONTHLY.map(e => e.ym).sort();
    const quarters = [];
    for (let y = +yms[0].slice(0, 4), q = Math.ceil(+yms[0].slice(4, 6) / 3); `${y}Q${q}` <= quarterOf(yms[yms.length - 1]); q === 4 ? (y++, q = 1) : q++) quarters.push(`${y}Q${q}`);
    const qIdx = new Map(quarters.map((q, i) => [q, i]));
    const usedTypeList = sum.types.filter(t => sum.byType.get(t) > 0);
    const qData = new Map(usedTypeList.map(t => [t, quarters.map(() => 0)]));
    for (const r of sum.rows) qData.get(classifyType(group, r))[qIdx.get(quarterOf(r.ym))]++;
    makeChart('chartDvTrend', {
      type: 'bar',
      data: {
        labels: quarters,
        datasets: usedTypeList.map(t => ({ label: t.label, data: qData.get(t), backgroundColor: typeColor(sum.types, t), borderColor: c.surface, borderWidth: 1, stack: 'q' }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(true), tooltip: { ...tooltipOpt(), mode: 'index', intersect: false } },
        interaction: { mode: 'index', intersect: false },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { ...tickOpt(), maxRotation: 0, autoSkip: true } }, y: { stacked: true, grid: gridOpt(), ticks: { ...tickOpt(), precision: 0 }, beginAtZero: true } }
      }
    });

    // 製品一覧(方式順・件数順)。実績のない方式は参考行として末尾に表示
    document.getElementById('dvTableSub').textContent = `${group.name}・${dom.procs.map(shortProc).join(' / ')}・${periodLabel()}`;
    const thead = ['方式', '品名', '規格', 'メーカー', '使用件数', '群内シェア', '償還価格', '償還額合計'];
    document.getElementById('dvTable').querySelector('thead').innerHTML = '<tr>' + thead.map(h => `<th>${h}</th>`).join('') + '</tr>';
    const prodRows = [...sum.products].sort((a, b) => sum.types.indexOf(a.type) - sum.types.indexOf(b.type) || b.count - a.count).map(p => {
      const pd = D.products[p.code];
      const share = total ? p.count / total : 0;
      return `<tr>
        <td title="${p.type.desc}"><span class="chip"><span class="dot" style="background:${typeColor(sum.types, p.type)}"></span>${p.type.label}</span></td>
        <td>${pd.name}</td><td>${pd.spec}</td><td>${p.maker}</td>
        <td>${fmtNum(p.count)}</td>
        <td><span class="fill-bar"><span style="width:${share * 100}%;background:${typeColor(sum.types, p.type)}"></span></span>${fmtPct(share)}</td>
        <td>${fmtYen(p.price)}</td><td>${fmtYen(p.value)}</td>
      </tr>`;
    });
    const noneRows = sum.types.filter(t => sum.byType.get(t) === 0).map(t => `<tr style="color:var(--muted)">
        <td><span class="chip none"><span class="dot"></span>${t.label}</span></td>
        <td colspan="7">自施設での使用実績なし — ${t.desc}</td>
      </tr>`);
    document.getElementById('dvTable').querySelector('tbody').innerHTML = prodRows.concat(noneRows).join('');
  }

  document.getElementById('dvMix').addEventListener('click', (e) => {
    const row = e.target.closest('.mix-row');
    if (!row) return;
    dvGroupSel.value = row.dataset.gi;
    renderDevice();
  });

  // ================================================================
  // TAB 0: 経営サマリー
  // ================================================================
  // 他施設ベンチマーク・使用量・導入推移の結果を、経営判断向けに年間金額と判断事項へ集約する。
  // 金額は対象期間の実績を年換算(÷ periodYears)。差益率の改善幅・破棄削減目標はサイドバーのシナリオ値
  const exMarginPt = document.getElementById('exMarginPt');
  const exDiscardCut = document.getElementById('exDiscardCut');
  [exMarginPt, exDiscardCut].forEach(el => el.addEventListener('input', renderExecutive));
  const DEVICE_IMPLANT_PROCS = ['ペースメーカー移植術', '植込型除細動器移植術', '両心室ペースメーカー移植術'];
  const median = (arr) => { const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const fmtMan = (n) => (n >= 1e8 ? (n / 1e8).toFixed(2) + '億円' : Math.round(n / 1e4).toLocaleString('ja-JP') + '万円');
  const statusBadge = (level, text) => `<span class="badge ${level}">${text}</span>`;

  function typeShare(k, domainKey, groupIdx, typeLabel) {
    const dom = DEVICE_DOMAINS.find(d => d.key === domainKey);
    const g = dom.groups[groupIdx];
    const st = facilityDeviceStats(k, dom, g);
    const i = st.types.findIndex(t => t.label === typeLabel);
    return st.shares.every(v => v === 0) ? null : st.shares[i];
  }

  function renderExecutive() {
    applyChartDefaults();
    const c = colors();
    const yrs = periodYears();
    const marginPt = Math.max(0, +exMarginPt.value || 0);
    const discardCut = Math.min(100, Math.max(0, +exDiscardCut.value || 0)) / 100;
    const procs = PROC_ORDER.filter(p => CASES.some(cs => cs.procedure === p));
    const annual = (v) => v / yrs;
    const totalReimb = CASES.reduce((s, cs) => s + cs.reimburse, 0);
    const scopeLabel = yearSel.value === 'all' ? '全期間の年換算' : (yrs < 0.99 ? `${periodLabel()}・年換算` : periodLabel());

    // ---- 処置別の他施設比較 ----
    const procRows = procs.map(p => {
      const cs = CASES.filter(x => x.procedure === p);
      const total = cs.reduce((s, x) => s + x.reimburse, 0);
      const vals = FAC_KEYS.map(k => facMetric(k, p).avgReimburse);
      const peerMed = median(vals.slice(1));
      const rank = [...vals].sort((a, b) => a - b).indexOf(vals[0]) + 1;
      const z = funnelStats(p).pts[0].z;
      let prev = null;
      if (yearSel.value !== 'all') {
        const pc = D.cases.filter(x => x.procedure === p && x.date.startsWith(String(+yearSel.value - 1)));
        if (pc.length) prev = pc.reduce((s, x) => s + x.reimburse, 0) / pc.length;
      }
      return { p, n: cs.length, annualN: annual(cs.length), annualTotal: annual(total), avg: vals[0], peerMed, diff: (vals[0] - peerMed) / peerMed, rank, z, prev };
    });

    // ---- 全処置の1症例あたり(A病院の症例構成で標準化) ----
    // 比較基準 = 処置ごとの他4施設中央値の単価 × A病院の処置別症例数(=他施設並みだった場合の期待値)
    // 順位 = 各施設の処置別単価をA病院の処置別症例数で加重した値の5施設内順位
    const nA = procRows.reduce((s, r) => s + r.n, 0);
    const allVals = FAC_KEYS.map(k => procs.reduce((s, p, i) => s + procRows[i].n * facMetric(k, p).avgReimburse, 0) / nA);
    const allPeerMed = procRows.reduce((s, r) => s + r.n * r.peerMed, 0) / nA;
    const allDiff = (allVals[0] - allPeerMed) / allPeerMed;
    const allRank = [...allVals].sort((a, b) => a - b).indexOf(allVals[0]) + 1;
    const excessCost = annual((allVals[0] - allPeerMed) * nA);

    // ---- 材料区分別のパレート ----
    const byCat = new Map();
    for (const r of ROWS) if (r.price > 0) byCat.set(r.material, (byCat.get(r.material) || 0) + r.price);
    const cats = [...byCat].sort((a, b) => b[1] - a[1]);
    let cum = 0;
    const pareto = cats.map(([name, v]) => { cum += v; return { name, v, cumPct: cum / totalReimb }; });
    const top80 = pareto.findIndex(x => x.cumPct >= 0.8) + 1;
    const top80Value = pareto.slice(0, top80).reduce((s, x) => s + x.v, 0);
    const deviceCases = CASES.filter(x => DEVICE_IMPLANT_PROCS.includes(x.procedure));
    const deviceShareCases = deviceCases.length / CASES.length;
    const deviceShareValue = deviceCases.reduce((s, x) => s + x.reimburse, 0) / totalReimb;

    // ---- 破棄・破損 ----
    const discards = ROWS.filter(r => r.useType === '破棄破損' && r.price > 0);
    const discardValue = discards.reduce((s, r) => s + r.price, 0);
    const discardTop = [...discards.reduce((m, r) => m.set(r.code, (m.get(r.code) || 0) + r.price), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([code]) => D.products[code].name);

    // ---- 在庫(現時点) ----
    const purchaseStock = D.inventory.items.filter(i => !i.consignment).reduce((s, i) => s + i.stockValue, 0);
    const riskItems = D.inventory.items.filter(i => i.stockoutRisk);

    // ---- 使用量の差(他4施設中央値より5%超多い指標) ----
    const usageGaps = USAGE_INDICATORS.filter(ind => ownUsage(ind) !== null).map(ind => {
      const vals = FAC_KEYS.map(k => facilityUsage(k, ind));
      const med = median(vals.slice(1));
      const nAnnual = annual(CASES.filter(x => ind.procs.includes(x.procedure)).length);
      const matched = ROWS.filter(r => ind.procs.includes(r.procedure) && ind.match(r));
      const unit = matched.length ? matched.reduce((s, r) => s + r.price, 0) / matched.length : 0;
      const diff = med ? (vals[0] - med) / med : 0;
      // 使用率は「使用症例1件あたり平均本数」で本数換算
      const perUse = ind.kind === 'count' ? 1 : (matched.length / Math.max(1, new Set(matched.map(caseKey)).size));
      return { ind, a: vals[0], med, diff, value: Math.max(0, vals[0] - med) * nAnnual * unit * perUse };
    });
    const overUse = usageGaps.filter(g => g.diff > 0.05 && g.ind.area !== '破棄・破損').sort((a, b) => b.value - a.value);
    const discardGaps = usageGaps.filter(g => g.ind.area === '破棄・破損' && g.med > 0);
    const discardTxt = discardGaps.map(g => `${g.ind.label.split(':')[0]} ${(g.a / g.med).toFixed(1)}倍`).join('・');
    const discardHigh = discardGaps.some(g => g.diff > 0.2);

    // ---- 新しい方式の導入状況 ----
    const adoption = [
      { label: 'PFA(アブレーション)', d: 'abl', g: 0, t: 'パルスフィールド(PFA)' },
      { label: 'リードレスペースメーカ', d: 'cied', g: 0, t: 'リードレス' },
      { label: 'S-ICD', d: 'cied', g: 1, t: '皮下植込型(S-ICD)' }
    ].map(x => {
      const vals = FAC_KEYS.map(k => typeShare(k, x.d, x.g, x.t));
      if (vals[0] === null) return null;
      return { ...x, a: vals[0], med: median(vals.slice(1)), rank: [...vals].sort((p, q) => q - p).indexOf(vals[0]) + 1 };
    }).filter(Boolean);
    const pfa = adoption.find(x => x.t === 'パルスフィールド(PFA)');

    // ================= KPI =================
    const costLevel = allDiff > 0.05 ? 'warning' : allDiff < -0.05 ? 'good' : 'good';
    const kpis = [
      { label: '材料償還額(年間)', value: fmtMan(annual(totalReimb)), sub: `${scopeLabel}・${fmtNum(annual(CASES.length))}症例/年`, badge: '' },
      { label: '1症例あたり材料償還額(症例構成調整)', value: fmtYen(allVals[0]), sub: `他施設並みの場合 ${fmtYen(allPeerMed)}・5施設中${allRank}位(低い順)`,
        badge: statusBadge(costLevel, Math.abs(allDiff) <= 0.05 ? '同水準' : `他施設比 ${allDiff > 0 ? '+' : ''}${(allDiff * 100).toFixed(1)}%`),
        info: '症例構成を揃えた比較(間接標準化)。「他施設並みの場合」= 処置ごとの他4施設中央値の単価 × A病院の処置別症例数。順位は各施設の処置別単価をA病院の症例構成で加重した値で比較' },
      { label: '他施設並みとの差額(年間)', value: `${excessCost >= 0 ? '+' : '−'}${fmtMan(Math.abs(excessCost))}`, sub: '症例構成を揃えて他施設中央値の単価で試算した場合との差',
        badge: statusBadge(excessCost > annual(totalReimb) * 0.05 ? 'critical' : excessCost > 0 ? 'warning' : 'good', excessCost > 0 ? '超過コスト' : '他施設より低い'),
        info: '償還額ベース。償還対象材料のため収益も連動しますが、破棄・破損分は請求できず全額が病院負担です' },
      { label: '破棄・破損による損失(年間)', value: fmtMan(annual(discardValue)), sub: `償還対象材料 ${fmtNum(annual(discards.length))}件/年・請求できず病院負担`,
        badge: statusBadge(discardHigh ? 'critical' : annual(discardValue) > 1e6 ? 'warning' : 'good', discardTxt ? `他施設中央値比 ${discardTxt}` : (annual(discardValue) > 1e6 ? '要対策' : '小さい')) },
      { label: '買取在庫(資金拘束)', value: fmtMan(purchaseStock), sub: `現時点・欠品リスク ${riskItems.length}品目`,
        badge: statusBadge(riskItems.length ? 'warning' : 'good', riskItems.length ? '定数見直し' : '良好') }
    ];
    if (pfa) kpis.push({ label: 'PFA比率(新技術の導入)', value: (pfa.a * 100).toFixed(0) + '%', sub: `他4施設中央値 ${(pfa.med * 100).toFixed(0)}%・5施設中${pfa.rank}位(高い順)`,
      badge: statusBadge(pfa.a < pfa.med * 0.9 ? 'warning' : 'good', pfa.a < pfa.med * 0.9 ? '導入が遅れ気味' : '他施設並み以上') });
    document.getElementById('exKpis').innerHTML = kpis.map(k => `<div class="kpi"><div class="label">${k.label}${k.info ? `<span class="info-dot" title="${k.info}">i</span>` : ''}</div>
      <div class="value">${k.value}</div><div class="sub">${k.sub}</div>${k.badge ? `<div style="margin-top:8px">${k.badge}</div>` : ''}</div>`).join('');

    // ================= 改善余地(年間インパクト) =================
    const levers = [
      { title: '償還差益の改善(価格交渉・品目集約)', amount: annual(totalReimb) * marginPt / 100, kind: '年間',
        detail: `材料償還額 ${fmtMan(annual(totalReimb))} × 差益率 +${marginPt}pt(想定)。重点は上位${top80}区分(償還額の80%=${fmtMan(annual(top80Value))})` },
      { title: '破棄・破損の削減', amount: annual(discardValue) * discardCut, kind: '年間',
        detail: `損失 ${fmtMan(annual(discardValue))} の ${Math.round(discardCut * 100)}%削減(想定)。上位: ${discardTop.join('、') || '-'}` },
      { title: '買取在庫の圧縮(預託化・定数見直し)', amount: purchaseStock, kind: '一時的',
        detail: `買取在庫 ${fmtMan(purchaseStock)} を預託化した場合に解放される資金の上限(現時点)` }
    ];
    if (overUse.length) {
      const sum = overUse.reduce((s, g) => s + g.value, 0);
      levers.push({ title: '材料使用量の差(診療科と協議)', amount: sum, kind: '参考', reference: true,
        detail: `他施設中央値より多い指標: ${overUse.map(g => `${g.ind.label} +${(g.diff * 100).toFixed(0)}%`).join('、')}。償還対象材料のため収益も連動し、病院の純効果は差益分のみ` });
    }
    const leverMax = Math.max(...levers.map(l => l.amount)) || 1;
    document.getElementById('exLevers').innerHTML = levers.map(l => `
      <div class="lever ${l.reference ? 'ref' : ''}">
        <div class="lever-head"><span class="lever-title">${l.title}</span><span class="lever-amount">${fmtMan(l.amount)}<small>${l.kind}</small></span></div>
        <div class="lever-bar"><span style="width:${Math.max(2, l.amount / leverMax * 100)}%;background:${l.reference ? c.muted : l.kind === '一時的' ? c.series[2] : c.series[0]}"></span></div>
        <div class="lever-detail">${l.detail}</div>
      </div>`).join('');

    // ================= 処置別の他施設比較 =================
    const thead = ['処置', '症例数/年', '材料償還額/年', '構成比', '1症例あたり(A病院)', '他4施設中央値', '中央値比', '5施設順位(低い順)', '統計的判定(ファンネル)'];
    if (yearSel.value !== 'all') thead.splice(5, 0, '前年比');
    document.getElementById('exProcTable').querySelector('thead').innerHTML = '<tr>' + thead.map(h => `<th>${h}</th>`).join('') + '</tr>';
    document.getElementById('exProcTable').querySelector('tbody').innerHTML = procRows.map(r => {
      const judge = r.z > 3.09 ? statusBadge('critical', '高い(99.8%限界外)') : r.z > 1.96 ? statusBadge('warning', 'やや高い(95%限界外)')
        : r.z < -1.96 ? statusBadge('good', '低い(効率的)') : statusBadge('good', '偶然の範囲内');
      const diffTxt = Math.abs(r.diff) < 0.05 ? '<span style="color:var(--muted)">同水準</span>' : `<b style="color:${r.diff > 0 ? 'var(--serious)' : 'var(--s1)'}">${r.diff > 0 ? '+' : ''}${(r.diff * 100).toFixed(0)}%</b>`;
      const prevCell = yearSel.value === 'all' ? '' : `<td>${r.prev ? `${r.avg >= r.prev ? '+' : ''}${((r.avg - r.prev) / r.prev * 100).toFixed(0)}%` : '<span style="color:var(--muted)">-</span>'}</td>`;
      return `<tr><td><b>${shortProc(r.p)}</b></td><td>${fmtNum(r.annualN)}</td><td>${fmtMan(r.annualTotal)}</td><td>${fmtPct(r.annualTotal / annual(totalReimb))}</td>
        <td>${fmtYen(r.avg)}</td>${prevCell}<td>${fmtYen(r.peerMed)}</td><td>${diffTxt}</td><td>${r.rank}位</td><td>${judge}</td></tr>`;
    }).join('');
    document.getElementById('exProcSub').textContent = `${scopeLabel}。A病院は実績、B〜E病院はA病院から生成した模擬施設。統計的判定は症例数を考慮したファンネルプロットの管理限界による${yearSel.value !== 'all' ? '。前年比は1症例あたり材料償還額(前年のデータ単位が異なる処置は参考値)' : ''}`;

    // ================= パレート図 =================
    const top = pareto.slice(0, 12);
    makeChart('chartExPareto', {
      type: 'bar',
      data: {
        labels: top.map(x => x.name.length > 12 ? x.name.slice(0, 12) + '…' : x.name),
        datasets: [
          { type: 'bar', label: '償還額(年間)', data: top.map(x => Math.round(annual(x.v))), backgroundColor: top.map((x, i) => i < top80 ? c.series[0] : c.grid), borderRadius: 4, yAxisID: 'y', order: 2 },
          { type: 'line', label: '累積構成比', data: top.map(x => +(x.cumPct * 100).toFixed(1)), borderColor: c.series[1], backgroundColor: c.series[1], borderWidth: 2, pointRadius: 3, yAxisID: 'y1', order: 1, tension: 0 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: legendOpt(true),
          tooltip: { ...tooltipOpt(), callbacks: { title: (items) => top[items[0].dataIndex].name, label: (it) => it.dataset.yAxisID === 'y' ? `償還額: ${fmtMan(it.raw)}/年` : `累積: ${it.raw}%` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { ...tickOpt(), maxRotation: 50, minRotation: 50, font: { ...baseFont(), size: 10.5 } } },
          y: { grid: gridOpt(), ticks: { ...tickOpt(), callback: (v) => (v / 1e4).toLocaleString('ja-JP') + '万' }, beginAtZero: true },
          y1: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { ...tickOpt(), callback: (v) => v + '%' } }
        }
      }
    });
    document.getElementById('exParetoSub').textContent = `${scopeLabel}・材料区分別(償還対象材料)。濃い棒=償還額の80%を占める上位${top80}区分(価格交渉の重点)`;

    // ================= 結論(3行) =================
    const highProcs = procRows.filter(r => r.z > 1.96);
    const lines = [
      Math.abs(allDiff) <= 0.05
        ? `1症例あたり材料償還額は ${fmtYen(allVals[0])} で、症例構成を揃えると他施設中央値と<b>同水準</b>(5施設中${allRank}位)。${highProcs.length ? `ただし<b>${highProcs.map(r => shortProc(r.p)).join('・')}</b>は統計的に高く、要因分析が必要です。` : '処置別にも統計的に突出した処置はありません。'}`
        : allDiff > 0
          ? `1症例あたり材料償還額は ${fmtYen(allVals[0])} で、症例構成を揃えると他施設並みの場合より<b>+${(allDiff * 100).toFixed(1)}%高く、年${fmtMan(excessCost)}の超過</b>(5施設中${allRank}位)。${highProcs.length ? `<b>${highProcs.map(r => shortProc(r.p)).join('・')}</b>が統計的に高く、` : ''}要因は${overUse.length ? `<b>${overUse.slice(0, 3).map(g => `${indGroup(g.ind)}の${g.ind.label.replace(/本数|使用率/, '')}`).join('、')}の使用量が多い</b>こと` : '材料使用量'}${discardTxt ? `と、<b>償還対象材料の破棄・破損が多い</b>こと(1症例あたり他施設の${discardTxt})` : ''}です。`
          : `1症例あたり材料償還額は ${fmtYen(allVals[0])} で、症例構成を揃えると他施設並みの場合より<b>低い(${(allDiff * 100).toFixed(1)}%)</b>(5施設中${allRank}位)。${highProcs.length ? `一方で<b>${highProcs.map(r => shortProc(r.p)).join('・')}</b>は統計的に高い水準で、要因分析が必要です。` : ''}`,
      deviceCases.length
        ? `植込みデバイス(PM・ICD・CRT)は症例の<b>${fmtPct(deviceShareCases, 0)}</b>で材料償還額の<b>${fmtPct(deviceShareValue, 0)}</b>を占めます。上位${top80}区分で償還額の80%に達するため、<b>価格交渉はこれらに集中</b>するのが効率的です。`
        : `上位${top80}区分で材料償還額の80%に達するため、<b>価格交渉はこれらに集中</b>するのが効率的です。`,
      `改善余地は、差益率+${marginPt}ptで<b>年${fmtMan(levers[0].amount)}</b>、破棄・破損${Math.round(discardCut * 100)}%削減で<b>年${fmtMan(levers[1].amount)}</b>、買取在庫の預託化で<b>最大${fmtMan(purchaseStock)}の資金解放</b>(いずれも想定値)。`
    ];
    document.getElementById('exHeadline').innerHTML = `<div class="exec-title">結論(${scopeLabel})</div><ol>${lines.map(l => `<li>${l}</li>`).join('')}</ol>`;

    // ================= 経営判断が必要な事項 =================
    const decisions = [];
    highProcs.forEach(r => decisions.push({ level: 'critical', area: '診療・コスト', text: `${shortProc(r.p)}の1症例あたり材料費が他施設比で統計的に高い(中央値比${r.diff > 0 ? '+' : ''}${(r.diff * 100).toFixed(0)}%)。材料使用量の要因分析を診療科と協議することの承認` }));
    decisions.push({ level: 'warning', area: '購買', text: `上位${top80}区分(${pareto.slice(0, Math.min(3, top80)).map(x => x.name.replace(/[（(].*$/, '')).join('、')}等、年${fmtMan(annual(top80Value))})に絞った価格交渉・品目集約の方針承認` });
    if (annual(discardValue) > 1e6) decisions.push({ level: discardHigh ? 'critical' : 'warning', area: '医療安全・コスト', text: `高額品の開封前確認(サイズ・術者確認のダブルチェック)手順の導入。破棄・破損損失 年${fmtMan(annual(discardValue))}${discardTxt ? `(1症例あたり破棄本数は他施設中央値の ${discardTxt})` : ''}。上位: ${discardTop.join('、')}` });
    adoption.filter(x => x.a < x.med * 0.9).forEach(x => decisions.push({ level: 'warning', area: '投資・新技術', text: `${x.label}の比率が他施設中央値を下回る(A病院 ${(x.a * 100).toFixed(0)}% / 中央値 ${(x.med * 100).toFixed(0)}%)。導入・拡大計画(対象患者数・収支・教育体制)の検討` }));
    adoption.filter(x => x.t === 'パルスフィールド(PFA)' && x.a >= x.med * 0.9).forEach(() => decisions.push({ level: 'good', area: '在庫', text: 'PFAへの移行が進行中。クライオ関連品の定数削減・PFA関連品の定数設定(実施状況の確認)' }));
    if (riskItems.length) decisions.push({ level: 'warning', area: '在庫', text: `欠品リスク${riskItems.length}品目(${riskItems.slice(0, 3).map(i => i.name).join('、')})の定数見直し` });
    if (overUse.length) decisions.push({ level: 'good', area: '診療プロセス', text: `材料使用量が他施設より多い指標(${overUse.slice(0, 3).map(g => g.ind.label).join('、')})について、医療の質(合併症・成績)とあわせた診療科との意見交換` });
    document.getElementById('exDecisions').innerHTML = decisions.map((d, i) => `
      <div class="decision"><span class="decision-no">${i + 1}</span><div><div class="decision-area">${statusBadge(d.level, d.area)}</div><div class="decision-text">${d.text}</div></div></div>`).join('');
  }

  // ================================================================
  // タブ切替
  // ================================================================
  const RENDERERS = { exec: renderExecutive, overview: renderOverview, benchmark: renderBenchmark, dealer: renderDealer, inventory: renderInventory, device: renderDevice };
  let activeTab = 'exec';
  function renderActiveTab() { RENDERERS[activeTab](); }

  document.getElementById('tabNav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('section.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
    activeTab = btn.dataset.tab;
    document.getElementById('panel-' + activeTab).classList.add('active');
    document.getElementById('sidebar-' + activeTab).classList.add('active');
    renderActiveTab();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.getAttribute('data-theme')) renderActiveTab();
  });

  applyYear();
  renderExecutive();
})();
