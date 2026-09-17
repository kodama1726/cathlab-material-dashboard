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

  // ================================================================
  // TAB 1: データ概観
  // ================================================================
  const ovProcSel = document.getElementById('ovProc');
  ovProcSel.innerHTML = '<option value="all">すべて</option>' + PROC_ORDER.map(p => `<option value="${p}">${shortProc(p)}</option>`).join('');
  ovProcSel.addEventListener('change', renderOverview);

  document.getElementById('ovPeriodHint').textContent = `対象期間: ${D.meta.dateFrom} 〜 ${D.meta.dateTo}(${D.meta.totalRows.toLocaleString()}件)`;
  document.getElementById('footPeriod').textContent = `${D.meta.dateFrom} 〜 ${D.meta.dateTo}`;
  document.getElementById('footGenerated').textContent = new Date(D.meta.generatedAt).toLocaleString('ja-JP');

  function renderOverview() {
    applyChartDefaults();
    const c = colors();
    const proc = ovProcSel.value;
    const rows = proc === 'all' ? D.rawRows : D.rawRows.filter(r => r.procedure === proc);
    const cases = proc === 'all' ? D.cases : D.cases.filter(cs => cs.procedure === proc);

    // KPI
    const totalReimburse = rows.reduce((s, r) => s + r.price, 0);
    const deptRatio = rows.length ? rows.filter(r => r.dept === '循環器内科').length / rows.length : 0;
    const kpis = [
      { label: '対象レコード数', value: fmtNum(rows.length), sub: proc === 'all' ? '全処置合計' : shortProc(proc) },
      { label: '推定症例数', value: fmtNum(cases.length), sub: '日付×処置内容から推定', info: '症例日と処置内容の組み合わせを1症例相当として簡易推定した参考値です(患者単位の識別IDがないため)' },
      { label: '総材料償還額', value: fmtYen(totalReimburse), sub: '対象期間合計' },
      { label: '循環器内科の割合', value: fmtPct(deptRatio), sub: '診療科内訳' }
    ];
    document.getElementById('ovKpis').innerHTML = kpis.map(k => `
      <div class="kpi"><div class="label">${k.label}${k.info ? `<span class="info-dot" title="${k.info}">i</span>` : ''}</div>
      <div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`).join('');

    // 処置内訳(全体・フィルタの影響を受けない)
    const procAll = countBy(D.cases, 'procedure').sort((a, b) => PROC_ORDER.indexOf(a.name) - PROC_ORDER.indexOf(b.name));
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
    const monthly = D.overview.monthlyByProc.map(e => ({ ym: e.ym, v: proc === 'all' ? e._total : (e[proc] || 0) }));
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
  bmProcSel.innerHTML = '<option value="all">すべて(全処置加重平均)</option>' + PROC_ORDER.map(p => `<option value="${p}">${shortProc(p)}</option>`).join('');
  bmProcSel.addEventListener('change', renderBenchmark);

  const FAC_KEYS = ['A', 'B', 'C', 'D', 'E'];
  const FAC_COLOR_IDX = { A: 0, B: 1, C: 2, D: 3, E: 4 };
  function facShort(k) { return D.benchmark.facilities[k].shortLabel || (k + '病院'); }

  function facMetric(fac, proc) {
    if (proc === 'all') {
      let n = 0, itemsW = 0, reimburse = 0;
      for (const p of D.benchmark.procedures) {
        const s = fac.procStats[p];
        n += s.nCases; itemsW += s.avgItems * s.nCases; reimburse += s.totalReimburse;
      }
      return { nCases: n, avgItems: n ? itemsW / n : 0, avgReimburse: n ? reimburse / n : 0 };
    }
    const s = fac.procStats[proc];
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

    document.getElementById('bmSub1').textContent = (proc === 'all' ? '全処置の加重平均' : shortProc(proc)) + 'で比較';
    document.getElementById('bmSub2').textContent = (proc === 'all' ? '全処置の加重平均' : shortProc(proc)) + 'で比較';

    const metrics = FAC_KEYS.map(k => ({ k, ...facMetric(D.benchmark.facilities[k], proc) }));
    const facColors = FAC_KEYS.map(k => c.series[FAC_COLOR_IDX[k]]);
    renderPositioning(metrics);

    makeChart('chartBmReimburse', {
      type: 'bar',
      data: { labels: FAC_KEYS.map(facShort), datasets: [{ label: '平均償還額/症例', data: metrics.map(m => Math.round(m.avgReimburse)), backgroundColor: facColors, borderRadius: 4, borderSkipped: false, barPercentage: 0.55 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: legendOpt(false), tooltip: { ...tooltipOpt(), callbacks: { label: (it) => fmtYen(it.raw) } } },
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
      const m = facMetric(f, proc);
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
  }

  // ================================================================
  // TAB 3: ディーラー・メーカー市場戦略
  // ================================================================
  const dmProcSel = document.getElementById('dmProc');
  dmProcSel.innerHTML = '<option value="all">すべて</option>' + PROC_ORDER.map(p => `<option value="${p}">${shortProc(p)}</option>`).join('');
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
    const rows = proc === 'all' ? D.rawRows : D.rawRows.filter(r => r.procedure === proc);

    document.getElementById('dmSubShare').textContent = `材料償還額ベース・全期間・${procLabel}`;
    document.getElementById('dmSubTrend').textContent = `上位6社・材料償還額ベース(自施設実績・${procLabel})`;
    document.getElementById('dmSubHHI').textContent = `自施設実績データ(${procLabel})における、特定保険医療材料カテゴリ別のメーカー集中度(ハーフィンダール・ハーシュマン指数)。専用カテーテル・リード類は院内で銘柄統一されやすく、単独メーカー(HHI=10,000)になりやすい点に留意`;

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
      { label: '総市場規模(自施設)', value: fmtYen(totalValue), sub: `材料償還額 全期間合計・${procLabel}` }
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
    const monthsList = D.overview.monthlyByProc.map(e => e.ym);
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
  // タブ切替
  // ================================================================
  const RENDERERS = { overview: renderOverview, benchmark: renderBenchmark, dealer: renderDealer, inventory: renderInventory };
  let activeTab = 'overview';
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

  renderOverview();
})();
