/**
 * 安裝報告產生器（含 ECharts 圖表 + Tab 導航 + 互動功能）
 *
 * 職責：
 *   setup 完成後產生自包含 HTML 報告，用 ECharts CDN 繪製圖表。
 *   報告包含五個 Tab：概覽、技術棧、Repos、安裝、審計。
 *
 * 匯出：generateReport(data) / saveReport(html, dir) / openInBrowser(path)
 */

import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { sumBy, size } from 'lodash-es'
import { getDescription } from './descriptions.mjs'

// ── 輔助 ──────────────────────────────────────────────────────────

function esc(str) {
  if (typeof str !== 'string') return String(str ?? '')
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function badge(text, variant = 'blue', desc = '') {
  const tooltip = desc ? ` title="${esc(desc)}"` : ''
  return `<span class="badge badge-${variant}"${tooltip}>${esc(text)}</span>`
}

function badgeWithDesc(name, variant, type, claudeDir) {
  const desc = getDescription(name, type, claudeDir)
  return desc
    ? `<div class="item-row"><span class="badge badge-${variant}">${esc(name)}</span><span class="item-desc">${esc(desc)}</span></div>`
    : `<span class="badge badge-${variant}">${esc(name)}</span>`
}

function section(title, content) {
  return `<div class="card"><h2 class="section-title">${esc(title)}</h2>${content}</div>`
}

// ── CSS ──────────────────────────────────────────────────────────

function getStyles() {
  return `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  background:#0d1117;color:#c9d1d9;line-height:1.6;padding:24px 16px}
.container{max-width:1100px;margin:0 auto}
header{text-align:center;margin-bottom:24px}
header h1{font-size:1.75rem;color:#58a6ff;margin-bottom:4px}
header .ts{font-size:.85rem;color:#8b949e}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;
  padding:20px 24px;margin-bottom:20px}
.overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.overview .item{text-align:center}
.overview .item .value{font-size:1.5rem;font-weight:700;color:#58a6ff;transition:transform 0.3s}
.overview .item:hover .value{transform:scale(1.1)}
.overview .item .label{font-size:.8rem;color:#8b949e}
.section-title{font-size:1.1rem;font-weight:600;color:#c9d1d9;
  border-bottom:1px solid #30363d;padding-bottom:6px;margin-bottom:12px}
.chart-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.chart-box{height:300px}
@media(max-width:700px){.chart-row{grid-template-columns:1fr} .chart-box{height:250px}}
table{width:100%;border-collapse:collapse;font-size:.88rem}
table th,table td{text-align:left;padding:7px 10px;border-bottom:1px solid #21262d}
table th{font-weight:600;color:#8b949e;font-size:.78rem;text-transform:uppercase;letter-spacing:.03em}
table tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:.78rem;font-weight:500;margin:3px 4px 3px 0;cursor:default;transition:outline 0.15s}
.badge-blue{background:#1f3a5f;color:#58a6ff}
.badge-green{background:#1a3a2a;color:#3fb950}
.badge-grey{background:#21262d;color:#8b949e}
.badge-pink{background:#3d1a2a;color:#f78166}
.item-row{display:flex;align-items:center;gap:6px;margin:3px 0}
.item-desc{font-size:.75rem;color:#8b949e}
.badge-purple{background:#2d1f4e;color:#bc8cff}
.group-label{font-weight:600;font-size:.85rem;color:#c9d1d9;margin:10px 0 4px}
.source-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.source-header .name{font-weight:600;color:#58a6ff}
.source-header .meta{font-size:.78rem;color:#8b949e}
.mono{font-family:SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;font-size:.85rem;color:#8b949e}
footer{text-align:center;font-size:.75rem;color:#484f58;margin-top:32px}
/* Tab 導航 */
.tabs{display:flex;gap:0;border-bottom:1px solid #30363d;margin-bottom:20px;overflow-x:auto}
.tab{padding:10px 20px;cursor:pointer;color:#8b949e;border-bottom:2px solid transparent;
  transition:all 0.2s;white-space:nowrap;font-size:.9rem;background:none;border-top:none;
  border-left:none;border-right:none;outline:none}
.tab:hover{color:#c9d1d9}
.tab.active{color:#58a6ff;border-bottom-color:#58a6ff}
.tab-content{display:none}
.tab-content.active{display:block}
/* 搜索框 */
.search-box{width:100%;padding:10px 16px;background:#0d1117;border:1px solid #30363d;
  border-radius:6px;color:#c9d1d9;font-size:14px;margin-bottom:16px}
.search-box:focus{outline:none;border-color:#58a6ff}
/* Repo 卡片 */
.repo-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;
  margin-bottom:12px;transition:border-color 0.2s}
.repo-card:hover{border-color:#58a6ff}
.repo-card .name{font-weight:600;color:#58a6ff;font-size:1rem}
.repo-card .reasoning{color:#8b949e;font-size:.85rem;margin:6px 0}
.repo-card.hidden{display:none}
/* 過濾狀態提示 */
.filter-hint{font-size:.82rem;color:#8b949e;margin-bottom:8px;min-height:1.2em}
`
}

// ── Tab 概覽區塊 ──────────────────────────────────────────────────

function renderOverview(data) {
  const eccAdded = sumBy(data.ecc?.sources || [], r =>
    (r.added?.commands?.length || 0) + (r.added?.agents?.length || 0) + (r.added?.rules?.length || 0))
  const items = [
    { label: '使用者', value: esc(data.username) },
    { label: '組織', value: esc(data.org) },
    { label: '模式', value: data.mode === 'auto' ? '自動' : '手動' },
    { label: 'Repos', value: data.repos?.length ?? 0 },
    { label: '技術棧', value: data.stacks?.length ?? 0 },
    { label: 'ECC 融合', value: `+${eccAdded}` },
  ]
  const inner = items.map(i =>
    `<div class="item"><div class="value">${i.value}</div><div class="label">${i.label}</div></div>`
  ).join('')
  return `<div class="card"><div class="overview">${inner}</div></div>`
}

// ── Tab 安裝區塊 ──────────────────────────────────────────────────

function renderEcc(ecc) {
  if (!ecc?.sources?.length) return ''
  let inner = ''
  for (const src of ecc.sources) {
    inner += `<div class="source-header">
      <span class="name">${esc(src.name)}</span>
      <span class="meta">${esc(src.repo)} · ${src.version || '?'}${src.cached ? ' · 快取' : ''}</span>
    </div>`
    for (const [key, arr] of Object.entries(src.added || {})) {
      if (!arr?.length) continue
      const HOME = process.env.HOME
      const claudeDir = path.join(HOME, '.claude')
      inner += `<div class="group-label">+ ${esc(key)}（${arr.length}）</div><div>${arr.map(v => badgeWithDesc(v, 'green', key, claudeDir)).join('')}</div>`
    }
    const skippedTotal = sumBy(Object.values(src.skipped || {}), a => a?.length || 0)
    if (skippedTotal > 0) {
      inner += `<div class="group-label" style="color:#8b949e">跳過（本地優先）${skippedTotal} 個</div>`
    }
    inner += '<hr style="border:none;border-top:1px solid #21262d;margin:12px 0">'
  }
  return section('Source 融合', inner)
}

function renderInstalled(installed) {
  if (!installed) return ''
  const HOME = process.env.HOME
  const claudeDir = path.join(HOME, '.claude')
  let inner = ''
  const groups = [
    ['Commands', installed.commands, 'blue', 'commands'],
    ['Agents', installed.agents, 'purple', 'agents'],
    ['Rules', installed.rules, 'blue', 'rules'],
    ['Zsh Modules', installed.modules, 'pink', null],
  ]
  for (const [label, items, variant, type] of groups) {
    if (!items?.length) continue
    inner += `<div class="group-label">${label}（${items.length}）</div><div>`
    if (type) {
      inner += items.map(v => badgeWithDesc(v, variant, type, claudeDir)).join('')
    } else {
      inner += items.map(v => badge(v, variant)).join('')
    }
    inner += '</div>'
  }
  if (installed.hooks) inner += `<div class="group-label">Hooks</div><div>${badge('已啟用', 'green')}</div>`
  return section('已安裝項目', inner)
}

function renderStacks(stacks) {
  if (!stacks?.length) return ''
  return section('Generated Stacks', `<div>${stacks.map(s => badge(s, 'pink', s)).join('')}</div>`)
}

// ── Tab 審計區塊 ──────────────────────────────────────────────────

function renderAuditTrail(auditSummary) {
  if (!auditSummary?.length) return ''
  const rows = auditSummary.map(line =>
    `<tr><td class="mono" style="font-size:12px">${esc(line)}</td></tr>`
  ).join('')
  return section('決策審計鏈', `<table><tbody>${rows}</tbody></table>`)
}

function renderBackup(backupDir) {
  if (!backupDir) return ''
  return section('備份', `<p class="mono">${esc(backupDir)}</p>`)
}

// ── ECharts 圖表（全部 Tab）─────────────────────────────────────

function renderCharts(data) {
  const techStacks = data.techStacks || {}
  const perRepoReasoning = data.perRepoReasoning || {}
  const installed = data.installed || {}
  const eccSources = data.ecc?.sources || []

  // 安裝項目分佈
  const installPie = [
    { name: 'Commands', value: installed.commands?.length || 0 },
    { name: 'Agents', value: installed.agents?.length || 0 },
    { name: 'Rules', value: installed.rules?.length || 0 },
    { name: 'Zsh Modules', value: installed.modules?.length || 0 },
  ].filter(i => i.value > 0)

  // ECC 融合資料
  const eccData = eccSources.map(s => ({
    name: s.name,
    added: (s.added?.commands?.length || 0) + (s.added?.agents?.length || 0) + (s.added?.rules?.length || 0),
    skipped: Object.values(s.skipped || {}).reduce((sum, a) => sum + (a?.length || 0), 0),
  }))

  // AI 分析成本圓餅（perRepoReasoning 中每個 repo 的 $cost）
  const costPie = Object.entries(perRepoReasoning)
    .filter(([, v]) => v?.cost != null && v.cost > 0)
    .map(([repo, v]) => ({ name: repo, value: Number(v.cost.toFixed(6)) }))

  // 矩陣熱力圖資料：Y = repos, X = 技術棧分類
  const repoNames = Object.keys(perRepoReasoning)
  const allCategories = Array.from(
    new Set([
      ...Object.keys(techStacks),
      ...Object.values(perRepoReasoning).flatMap(v => Object.keys(v?.stacks || {})),
    ])
  )

  // heatmap value: [xIdx, yIdx, count]
  const heatmapData = []
  const heatmapTooltipMap = {} // key = "xIdx,yIdx" -> tech names
  for (let yi = 0; yi < repoNames.length; yi++) {
    const repoData = perRepoReasoning[repoNames[yi]] || {}
    for (let xi = 0; xi < allCategories.length; xi++) {
      const cat = allCategories[xi]
      const techs = repoData.stacks?.[cat] || []
      const count = techs.length
      heatmapData.push([xi, yi, count])
      heatmapTooltipMap[`${xi},${yi}`] = techs
    }
  }

  // 技術棧使用頻率：每個技術出現在幾個 repo
  const techFreqMap = {}
  for (const repoData of Object.values(perRepoReasoning)) {
    const seen = new Set()
    for (const techs of Object.values(repoData?.stacks || {})) {
      for (const t of techs) {
        if (!seen.has(t)) {
          techFreqMap[t] = (techFreqMap[t] || 0) + 1
          seen.add(t)
        }
      }
    }
  }
  const topTechs = Object.entries(techFreqMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
  const freqNames = topTechs.map(([n]) => n).reverse()
  const freqCounts = topTechs.map(([, c]) => c).reverse()

  const hasHeatmap = repoNames.length > 0 && allCategories.length > 0
  const hasFreq = topTechs.length > 0
  const hasCost = costPie.length > 0
  const hasEcc = eccData.length > 0
  const heatmapHeight = Math.max(300, repoNames.length * 24 + 80)
  const freqHeight = Math.max(300, freqNames.length * 28 + 60)

  // 技術棧分類統計（概覽 Tab 用）
  const catNamesOverview = Object.keys(techStacks).reverse()
  const catCountsOverview = Object.values(techStacks).map(v => v?.length || 0).reverse()
  const techChartHeight = Math.max(300, catNamesOverview.length * 28 + 60)

  return `
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"><\/script>
<script>
(function() {
  var _charts = [];
  function _reg(c) { _charts.push(c); }
  window.__reportCharts = _charts;

  var dark = { backgroundColor: 'transparent', textStyle: { color: '#8b949e' } };

  document.addEventListener('DOMContentLoaded', function() {

    // ── 概覽 Tab：技術棧分類統計柱狀圖 ──
    var techEl = document.getElementById('chart-tech-overview');
    if (techEl) {
      techEl.style.height = ${techChartHeight} + 'px';
      var techChart = echarts.init(techEl);
      _reg(techChart);
      techChart.setOption(Object.assign({}, dark, {
        title: { text: '技術棧分類統計', textStyle: { color: '#c9d1d9', fontSize: 14 } },
        tooltip: { trigger: 'axis', formatter: function(p) { return p[0].name + ': ' + p[0].value + ' 個'; } },
        grid: { left: 10, right: 40, top: 50, bottom: 10, containLabel: true },
        xAxis: { type: 'value', splitLine: { lineStyle: { color: '#21262d' } } },
        yAxis: { type: 'category', data: ${JSON.stringify(catNamesOverview)}, axisLabel: { color: '#8b949e', fontSize: 11 } },
        series: [{ type: 'bar', data: ${JSON.stringify(catCountsOverview)},
          itemStyle: { color: '#58a6ff', borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 20,
          label: { show: true, position: 'right', color: '#8b949e', fontSize: 11 } }]
      }));
      techChart.on('click', function(params) {
        var cat = params.name;
        document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
        var reposTab = document.querySelector('.tab[data-tab="repos"]');
        var reposContent = document.getElementById('tab-repos');
        if (reposTab) reposTab.classList.add('active');
        if (reposContent) reposContent.classList.add('active');
        window.dispatchEvent(new Event('resize'));
        var hint = document.getElementById('repos-filter-hint');
        document.querySelectorAll('.repo-card').forEach(function(card) {
          var cats = (card.dataset.categories || '').split(',');
          var match = cats.indexOf(cat) !== -1;
          card.classList.toggle('hidden', !match);
        });
        if (hint) hint.textContent = '篩選分類：' + cat + '（點擊空白處重置）';
      });
    }

    // ── 概覽 Tab：安裝項目分佈圓餅 ──
    var installEl = document.getElementById('chart-install-overview');
    if (installEl) {
      var installChart = echarts.init(installEl);
      _reg(installChart);
      installChart.setOption(Object.assign({}, dark, {
        title: { text: '安裝項目分佈', textStyle: { color: '#c9d1d9', fontSize: 14 } },
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        series: [{ type: 'pie', radius: ['35%', '65%'], center: ['50%', '55%'],
          data: ${JSON.stringify(installPie)},
          label: { color: '#c9d1d9', fontSize: 11 },
          itemStyle: { borderColor: '#161b22', borderWidth: 2 },
          emphasis: { label: { fontSize: 13, fontWeight: 'bold' } } }],
        color: ['#58a6ff', '#bc8cff', '#3fb950', '#f78166', '#d2a8ff']
      }));
    }

    ${hasCost ? `
    // ── 概覽 Tab：AI 分析成本圓餅 ──
    var costEl = document.getElementById('chart-cost-overview');
    if (costEl) {
      var costChart = echarts.init(costEl);
      _reg(costChart);
      costChart.setOption(Object.assign({}, dark, {
        title: { text: 'AI 分析成本（$）', textStyle: { color: '#c9d1d9', fontSize: 14 } },
        tooltip: { trigger: 'item', formatter: function(p) { return p.name + ': $' + p.value.toFixed(6) + ' (' + p.percent + '%)'; } },
        series: [{ type: 'pie', radius: ['35%', '65%'], center: ['50%', '55%'],
          data: ${JSON.stringify(costPie)},
          label: { color: '#c9d1d9', fontSize: 10 },
          itemStyle: { borderColor: '#161b22', borderWidth: 2 },
          emphasis: { label: { fontSize: 12, fontWeight: 'bold' } } }],
        color: ['#58a6ff', '#bc8cff', '#3fb950', '#f78166', '#d2a8ff', '#ffa657', '#79c0ff']
      }));
    }` : ''}

    ${hasHeatmap ? `
    // ── 技術棧 Tab：矩陣熱力圖 ──
    var heatEl = document.getElementById('chart-heatmap');
    if (heatEl) {
      heatEl.style.height = ${heatmapHeight} + 'px';
      var heatChart = echarts.init(heatEl);
      _reg(heatChart);
      var tooltipMap = ${JSON.stringify(heatmapTooltipMap)};
      heatChart.setOption(Object.assign({}, dark, {
        title: { text: 'Repo × 技術棧矩陣', textStyle: { color: '#c9d1d9', fontSize: 14 } },
        tooltip: {
          position: 'top',
          formatter: function(params) {
            var key = params.data[0] + ',' + params.data[1];
            var techs = tooltipMap[key] || [];
            var repo = ${JSON.stringify(repoNames)}[params.data[1]];
            var cat = ${JSON.stringify(allCategories)}[params.data[0]];
            if (!techs.length) return repo + ' / ' + cat + ': 無';
            return repo + ' / ' + cat + '<br>' + techs.join(', ');
          }
        },
        grid: { left: 20, right: 80, top: 60, bottom: 40, containLabel: true },
        xAxis: {
          type: 'category',
          data: ${JSON.stringify(allCategories)},
          splitArea: { show: true },
          axisLabel: { color: '#8b949e', fontSize: 10, rotate: 30, interval: 0 }
        },
        yAxis: {
          type: 'category',
          data: ${JSON.stringify(repoNames)},
          splitArea: { show: true },
          axisLabel: { color: '#8b949e', fontSize: 10 }
        },
        visualMap: {
          min: 0, max: 10, calculable: true, orient: 'vertical', right: 0, top: 60,
          inRange: { color: ['#1a2a3a', '#1f3a5f', '#2d5fa0', '#58a6ff'] },
          textStyle: { color: '#8b949e' }
        },
        series: [{ type: 'heatmap', data: ${JSON.stringify(heatmapData)},
          label: { show: true, color: '#c9d1d9', fontSize: 9,
            formatter: function(p) { return p.data[2] > 0 ? p.data[2] : ''; } },
          emphasis: { itemStyle: { shadowBlur: 8, shadowColor: '#58a6ff' } } }]
      }));
    }` : ''}

    ${hasFreq ? `
    // ── 技術棧 Tab：技術棧使用頻率水平柱狀圖 ──
    var freqEl = document.getElementById('chart-tech-freq');
    if (freqEl) {
      freqEl.style.height = ${freqHeight} + 'px';
      var freqChart = echarts.init(freqEl);
      _reg(freqChart);
      freqChart.setOption(Object.assign({}, dark, {
        title: { text: '技術使用頻率（Top 20）', textStyle: { color: '#c9d1d9', fontSize: 14 } },
        tooltip: { trigger: 'axis', formatter: function(p) { return p[0].name + ': ' + p[0].value + ' 個 repo'; } },
        grid: { left: 10, right: 50, top: 50, bottom: 10, containLabel: true },
        xAxis: { type: 'value', splitLine: { lineStyle: { color: '#21262d' } } },
        yAxis: { type: 'category', data: ${JSON.stringify(freqNames)}, axisLabel: { color: '#8b949e', fontSize: 11 } },
        series: [{ type: 'bar', data: ${JSON.stringify(freqCounts)},
          itemStyle: { color: '#3fb950', borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 18,
          label: { show: true, position: 'right', color: '#8b949e', fontSize: 11 } }]
      }));
    }` : ''}

    ${hasEcc ? `
    // ── 安裝 Tab：ECC 融合堆疊柱狀圖 ──
    var eccEl = document.getElementById('chart-ecc-install');
    if (eccEl) {
      var eccChart = echarts.init(eccEl);
      _reg(eccChart);
      eccChart.setOption(Object.assign({}, dark, {
        title: { text: 'Source 融合統計', textStyle: { color: '#c9d1d9', fontSize: 14 } },
        tooltip: { trigger: 'axis' },
        legend: { data: ['新增', '跳過'], textStyle: { color: '#8b949e' }, top: 5, right: 10 },
        grid: { left: 60, right: 20, top: 40, bottom: 20 },
        xAxis: { type: 'category', data: ${JSON.stringify(eccData.map(d => d.name))}, axisLabel: { color: '#8b949e' } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: '#21262d' } } },
        series: [
          { name: '新增', type: 'bar', stack: 'total', data: ${JSON.stringify(eccData.map(d => d.added))}, itemStyle: { color: '#3fb950' } },
          { name: '跳過', type: 'bar', stack: 'total', data: ${JSON.stringify(eccData.map(d => d.skipped))}, itemStyle: { color: '#484f58' } }
        ]
      }));
    }` : ''}

    // ── 統一 resize ──
    window.addEventListener('resize', function() {
      _charts.forEach(function(c) { try { c.resize(); } catch(e) {} });
    });

  }); // DOMContentLoaded
}());
<\/script>`
}

// ── Tab 導航 JS ───────────────────────────────────────────────────

function renderTabScript() {
  return `
<script>
(function() {
  document.addEventListener('DOMContentLoaded', function() {

    // Tab 切換
    document.querySelectorAll('.tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
        tab.classList.add('active');
        var target = document.getElementById('tab-' + tab.dataset.tab);
        if (target) target.classList.add('active');
        window.dispatchEvent(new Event('resize'));
      });
    });

    // 搜索過濾（Repos Tab）
    var searchEl = document.getElementById('search');
    if (searchEl) {
      searchEl.addEventListener('input', function(e) {
        var q = e.target.value.toLowerCase();
        document.querySelectorAll('.repo-card').forEach(function(card) {
          var text = card.textContent.toLowerCase();
          card.classList.toggle('hidden', q.length > 0 && !text.includes(q));
        });
        // 高亮匹配的 badge
        document.querySelectorAll('.badge').forEach(function(b) {
          if (q && b.textContent.toLowerCase().includes(q)) {
            b.style.outline = '2px solid #58a6ff';
          } else {
            b.style.outline = '';
          }
        });
        var hint = document.getElementById('repos-filter-hint');
        if (hint && !hint.textContent.includes('篩選分類')) hint.textContent = '';
      });
    }

    // 點擊空白處重置 Repos 篩選
    document.addEventListener('click', function(e) {
      var hint = document.getElementById('repos-filter-hint');
      if (!hint || !hint.textContent.includes('篩選分類')) return;
      if (e.target.closest('.repo-card') || e.target.closest('[id^="chart-tech"]')) return;
      document.querySelectorAll('.repo-card').forEach(function(card) { card.classList.remove('hidden'); });
      hint.textContent = '';
    });

  });
}());
<\/script>`
}

// ── Tab 各區塊 HTML ───────────────────────────────────────────────

function renderTabOverview(data) {
  const techStacks = data.techStacks || {}
  const hasCost = Object.values(data.perRepoReasoning || {}).some(v => v?.cost != null && v.cost > 0)
  const installed = data.installed || {}
  const hasInstall = ['commands', 'agents', 'rules', 'modules'].some(k => installed[k]?.length)

  const overviewHtml = renderOverview(data)
  const techHeight = Math.max(300, Object.keys(techStacks).length * 28 + 60)

  return `
<div id="tab-overview" class="tab-content active">
  ${overviewHtml}
  <div class="card">
    <h2 class="section-title">圖表總覽</h2>
    <div class="chart-row">
      ${Object.keys(techStacks).length > 0 ? `<div id="chart-tech-overview" style="height:${techHeight}px"></div>` : '<div></div>'}
      ${hasInstall ? '<div class="chart-box" id="chart-install-overview"></div>' : '<div></div>'}
    </div>
    ${hasCost ? '<div class="chart-box" id="chart-cost-overview" style="margin-top:16px"></div>' : ''}
  </div>
</div>`
}

function renderTabTechStacks(data) {
  const techStacks = data.techStacks || {}
  const perRepoReasoning = data.perRepoReasoning || {}
  const repoCount = Object.keys(perRepoReasoning).length
  const allCategories = Array.from(
    new Set([
      ...Object.keys(techStacks),
      ...Object.values(perRepoReasoning).flatMap(v => Object.keys(v?.stacks || {})),
    ])
  )
  const hasHeatmap = repoCount > 0 && allCategories.length > 0
  const heatmapHeight = Math.max(300, repoCount * 24 + 80)

  const techFreqMap = {}
  for (const repoData of Object.values(perRepoReasoning)) {
    const seen = new Set()
    for (const techs of Object.values(repoData?.stacks || {})) {
      for (const t of techs) {
        if (!seen.has(t)) {
          techFreqMap[t] = (techFreqMap[t] || 0) + 1
          seen.add(t)
        }
      }
    }
  }
  const topCount = Math.min(20, Object.keys(techFreqMap).length)
  const freqHeight = Math.max(300, topCount * 28 + 60)

  let techStacksHtml = ''
  for (const [cat, items] of Object.entries(techStacks)) {
    if (!items?.length) continue
    techStacksHtml += `<div class="group-label">${esc(cat)}</div><div>${items.map(t => badge(t, 'blue')).join('')}</div>`
  }

  return `
<div id="tab-stacks" class="tab-content">
  ${techStacksHtml ? `<div class="card"><h2 class="section-title">AI 辨識技術棧</h2>${techStacksHtml}</div>` : ''}
  ${hasHeatmap ? `
  <div class="card">
    <h2 class="section-title">Repo × 技術棧矩陣熱力圖</h2>
    <div id="chart-heatmap" style="height:${heatmapHeight}px"></div>
  </div>` : ''}
  ${topCount > 0 ? `
  <div class="card">
    <h2 class="section-title">技術棧使用頻率（Top 20）</h2>
    <div id="chart-tech-freq" style="height:${freqHeight}px"></div>
  </div>` : ''}
</div>`
}

function renderTabRepos(data) {
  const perRepoReasoning = data.perRepoReasoning || {}
  const repos = data.repos || []

  // 建立 repo card：優先用 perRepoReasoning，fallback 到 repos 清單
  const repoKeys = Object.keys(perRepoReasoning).length > 0
    ? Object.keys(perRepoReasoning)
    : repos

  if (!repoKeys.length) return '<div id="tab-repos" class="tab-content"><p style="color:#8b949e">無 Repo 資料</p></div>'

  const cards = repoKeys.map(repo => {
    const repoData = perRepoReasoning[repo] || {}
    const categories = Object.keys(repoData.stacks || {}).join(',')
    let stackBadges = ''
    for (const [cat, techs] of Object.entries(repoData.stacks || {})) {
      if (!techs?.length) continue
      stackBadges += `<div style="margin-top:6px"><span style="font-size:.78rem;color:#8b949e;margin-right:4px">${esc(cat)}:</span>${techs.map(t => badge(t, 'blue')).join('')}</div>`
    }
    return `<div class="repo-card" data-categories="${esc(categories)}">
      <div class="name">${esc(repo)}</div>
      ${repoData.reasoning ? `<div class="reasoning">${esc(repoData.reasoning)}</div>` : ''}
      ${stackBadges}
    </div>`
  }).join('')

  return `
<div id="tab-repos" class="tab-content">
  <input type="text" id="search" class="search-box" placeholder="搜尋技術棧、Repo...">
  <div id="repos-filter-hint" class="filter-hint"></div>
  ${cards}
</div>`
}

function renderTabInstall(data) {
  const hasEcc = (data.ecc?.sources?.length || 0) > 0

  return `
<div id="tab-install" class="tab-content">
  ${renderInstalled(data.installed)}
  ${hasEcc ? `
  <div class="card">
    <h2 class="section-title">Source 融合統計圖表</h2>
    <div class="chart-box" id="chart-ecc-install"></div>
  </div>` : ''}
  ${renderEcc(data.ecc)}
  ${renderStacks(data.stacks)}
</div>`
}

function renderTabAudit(data) {
  return `
<div id="tab-audit" class="tab-content">
  ${renderAuditTrail(data.auditSummary)}
  ${renderBackup(data.backupDir)}
</div>`
}

// ── 主要匯出 ──────────────────────────────────────────────────────

/**
 * 產生完整 HTML 報告
 * @param {Object} data - 安裝資料
 * @returns {string} HTML
 */
export function generateReport(data) {
  const ts = data.timestamp ?? new Date().toISOString().replace('T', ' ').slice(0, 19)

  const tabNav = `
<nav class="tabs">
  <button class="tab active" data-tab="overview">概覽</button>
  <button class="tab" data-tab="stacks">技術棧</button>
  <button class="tab" data-tab="repos">Repos</button>
  <button class="tab" data-tab="install">安裝</button>
  <button class="tab" data-tab="audit">審計</button>
</nav>`

  const body = [
    tabNav,
    renderTabOverview(data),
    renderTabTechStacks(data),
    renderTabRepos(data),
    renderTabInstall(data),
    renderTabAudit(data),
    renderCharts(data),
    renderTabScript(),
  ].join('\n')

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ab-dotfiles 安裝報告</title>
<style>${getStyles()}</style>
</head>
<body>
<div class="container">
<header>
  <h1>ab-dotfiles 安裝報告</h1>
  <div class="ts">${esc(ts)}</div>
</header>
${body}
<footer>Generated by ab-dotfiles · Powered by ECharts</footer>
</div>
</body>
</html>`
}

/** 儲存報告到檔案 */
export function saveReport(html, outputDir) {
  const dir = path.resolve(outputDir)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, 'report.html')
  fs.writeFileSync(filePath, html, 'utf-8')
  return filePath
}

/** 在預設瀏覽器開啟 */
export function openInBrowser(filePath) {
  return new Promise((resolve, reject) => {
    const abs = path.resolve(filePath)
    const cmd = process.platform === 'darwin' ? `open "${abs}"`
      : process.platform === 'win32' ? `start "" "${abs}"`
      : `xdg-open "${abs}"`
    exec(cmd, err => err ? reject(err) : resolve())
  })
}
