/**
 * 安裝報告產生器（含 ECharts 圖表）
 *
 * 職責：
 *   setup 完成後產生自包含 HTML 報告，用 ECharts CDN 繪製圖表。
 *   報告包含：總覽、倉庫、技術棧分佈圖、Source 融合詳情、安裝項目、備份。
 *
 * 匯出：generateReport(data) / saveReport(html, dir) / openInBrowser(path)
 */

import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'

// ── 輔助 ──────────────────────────────────────────────────────────

function esc(str) {
  if (typeof str !== 'string') return String(str ?? '')
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function badge(text, variant = 'blue') {
  return `<span class="badge badge-${variant}">${esc(text)}</span>`
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
.container{max-width:960px;margin:0 auto}
header{text-align:center;margin-bottom:32px}
header h1{font-size:1.75rem;color:#58a6ff;margin-bottom:4px}
header .ts{font-size:.85rem;color:#8b949e}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;
  padding:20px 24px;margin-bottom:20px}
.overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.overview .item{text-align:center}
.overview .item .value{font-size:1.5rem;font-weight:700;color:#58a6ff}
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
.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:.78rem;font-weight:500;margin:3px 4px 3px 0}
.badge-blue{background:#1f3a5f;color:#58a6ff}
.badge-green{background:#1a3a2a;color:#3fb950}
.badge-grey{background:#21262d;color:#8b949e}
.badge-pink{background:#3d1a2a;color:#f78166}
.badge-purple{background:#2d1f4e;color:#bc8cff}
.group-label{font-weight:600;font-size:.85rem;color:#c9d1d9;margin:10px 0 4px}
.source-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.source-header .name{font-weight:600;color:#58a6ff}
.source-header .meta{font-size:.78rem;color:#8b949e}
.mono{font-family:SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;font-size:.85rem;color:#8b949e}
footer{text-align:center;font-size:.75rem;color:#484f58;margin-top:32px}
`
}

// ── 區塊渲染 ──────────────────────────────────────────────────────

function renderOverview(data) {
  const eccAdded = data.ecc?.sources?.reduce((s, r) =>
    s + (r.added?.commands?.length || 0) + (r.added?.agents?.length || 0) + (r.added?.rules?.length || 0), 0) || 0
  const items = [
    { label: '使用者', value: esc(data.username) },
    { label: '組織', value: esc(data.org) },
    { label: '模式', value: data.mode === 'auto' ? '自動' : '手動' },
    { label: 'Repos', value: data.repos?.length ?? 0 },
    { label: '技術棧', value: data.stacks?.length ?? 0 },
    { label: 'ECC 融合', value: `+${eccAdded}` },
  ]
  const inner = items.map(i => `<div class="item"><div class="value">${i.value}</div><div class="label">${i.label}</div></div>`).join('')
  return `<div class="card"><div class="overview">${inner}</div></div>`
}

function renderRepos(repos) {
  if (!repos?.length) return ''
  const rows = repos.map((r, i) => `<tr><td>${i + 1}</td><td class="mono">${esc(r)}</td></tr>`).join('')
  return section('選取的 Repos', `<table><thead><tr><th>#</th><th>Repository</th></tr></thead><tbody>${rows}</tbody></table>`)
}

function renderTechStacks(techStacks) {
  if (!techStacks || !Object.keys(techStacks).length) return ''
  let inner = ''
  for (const [cat, items] of Object.entries(techStacks)) {
    if (!items?.length) continue
    inner += `<div class="group-label">${esc(cat)}</div><div>${items.map(t => badge(t, 'blue')).join('')}</div>`
  }
  return section('AI 辨識技術棧', inner)
}

function renderEcc(ecc) {
  if (!ecc?.sources?.length) return ''
  let inner = ''
  for (const src of ecc.sources) {
    inner += `<div class="source-header">
      <span class="name">${esc(src.name)}</span>
      <span class="meta">${esc(src.repo)} · ${src.version || '?'}${src.cached ? ' · 快取' : ''}</span>
    </div>`
    // 新增
    for (const [key, arr] of Object.entries(src.added || {})) {
      if (!arr?.length) continue
      inner += `<div class="group-label">+ ${esc(key)}（${arr.length}）</div><div>${arr.map(v => badge(v, 'green')).join('')}</div>`
    }
    // 跳過
    const skippedTotal = Object.values(src.skipped || {}).reduce((s, a) => s + (a?.length || 0), 0)
    if (skippedTotal > 0) {
      inner += `<div class="group-label" style="color:#8b949e">跳過（本地優先）${skippedTotal} 個</div>`
    }
    inner += '<hr style="border:none;border-top:1px solid #21262d;margin:12px 0">'
  }
  return section('Source 融合', inner)
}

function renderInstalled(installed) {
  if (!installed) return ''
  let inner = ''
  const groups = [
    ['Commands', installed.commands, 'blue'],
    ['Agents', installed.agents, 'purple'],
    ['Rules', installed.rules, 'blue'],
    ['Zsh Modules', installed.modules, 'pink'],
  ]
  for (const [label, items, variant] of groups) {
    if (!items?.length) continue
    inner += `<div class="group-label">${label}（${items.length}）</div><div>${items.map(v => badge(v, variant)).join('')}</div>`
  }
  if (installed.hooks) inner += `<div class="group-label">Hooks</div><div>${badge('已啟用', 'green')}</div>`
  return section('已安裝項目', inner)
}

function renderStacks(stacks) {
  if (!stacks?.length) return ''
  return section('Generated Stacks', `<div>${stacks.map(s => badge(s, 'pink')).join('')}</div>`)
}

function renderPerRepo(perRepoReasoning) {
  if (!perRepoReasoning || !Object.keys(perRepoReasoning).length) return ''
  let inner = ''
  for (const [repo, data] of Object.entries(perRepoReasoning)) {
    inner += `<div class="source-header"><span class="name">${esc(repo)}</span></div>`
    if (data.reasoning) inner += `<p style="color:#58a6ff;margin:4px 0 8px">${esc(data.reasoning)}</p>`
    if (data.stacks) {
      for (const [cat, items] of Object.entries(data.stacks)) {
        if (!items?.length) continue
        inner += `<div class="group-label">${esc(cat)}</div><div>${items.map(t => badge(t, 'blue')).join('')}</div>`
      }
    }
    inner += '<hr style="border:none;border-top:1px solid #21262d;margin:12px 0">'
  }
  return section('Per-Repo AI 分析', inner)
}

function renderAuditTrail(auditSummary) {
  if (!auditSummary?.length) return ''
  const rows = auditSummary.map(line => `<tr><td class="mono" style="font-size:12px">${esc(line)}</td></tr>`).join('')
  return section('決策審計鏈', `<table><tbody>${rows}</tbody></table>`)
}

function renderBackup(backupDir) {
  if (!backupDir) return ''
  return section('備份', `<p class="mono">${esc(backupDir)}</p>`)
}

// ── ECharts 圖表（CDN）──────────────────────────────────────────

function renderCharts(data) {
  // 準備圖表資料 — 技術棧用具體名稱
  const techStacks = data.techStacks || {}
  const allTechNames = []
  for (const items of Object.values(techStacks)) {
    if (Array.isArray(items)) allTechNames.push(...items)
  }
  // 取前 20 個顯示在圖表裡（太多會擠）
  const techForChart = allTechNames.slice(0, 20)
  const techCounts = techForChart.map(() => 1) // 每個技術計 1

  const eccSources = data.ecc?.sources || []
  const eccData = eccSources.map(s => ({
    name: s.name,
    added: (s.added?.commands?.length || 0) + (s.added?.agents?.length || 0) + (s.added?.rules?.length || 0),
    skipped: Object.values(s.skipped || {}).reduce((sum, a) => sum + (a?.length || 0), 0),
  }))

  // 安裝項目分佈（不含 Stacks — 那是本地技能庫，不是安裝項目）
  const installed = data.installed || {}
  const installPie = [
    { name: 'Commands', value: installed.commands?.length || 0 },
    { name: 'Agents', value: installed.agents?.length || 0 },
    { name: 'Rules', value: installed.rules?.length || 0 },
    { name: 'Zsh Modules', value: installed.modules?.length || 0 },
  ].filter(i => i.value > 0)

  return `
<div class="card">
  <h2 class="section-title">圖表分析</h2>
  <div class="chart-row">
    <div class="chart-box" id="chart-tech"></div>
    <div class="chart-box" id="chart-install"></div>
  </div>
  ${eccData.length > 0 ? '<div class="chart-box" id="chart-ecc" style="height:250px;margin-top:16px"></div>' : ''}
</div>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"><\/script>
<script>
document.addEventListener('DOMContentLoaded', function() {
  var dark = { backgroundColor: 'transparent', textStyle: { color: '#8b949e' } };

  // 技術棧（按分類統計柱狀圖）
  var catNames = ${JSON.stringify(Object.keys(techStacks).reverse())};
  var catCounts = ${JSON.stringify(Object.values(techStacks).map(v => v?.length || 0).reverse())};
  var techChart = echarts.init(document.getElementById('chart-tech'));
  techChart.setOption(Object.assign({}, dark, {
    title: { text: '技術棧分類統計', textStyle: { color: '#c9d1d9', fontSize: 14 } },
    tooltip: { trigger: 'axis', formatter: function(p) { return p[0].name + ': ' + p[0].value + ' 個'; } },
    grid: { left: 90, right: 30, top: 40, bottom: 20 },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#21262d' } } },
    yAxis: { type: 'category', data: catNames, axisLabel: { color: '#8b949e', fontSize: 11 } },
    series: [{ type: 'bar', data: catCounts,
               itemStyle: { color: '#58a6ff', borderRadius: [0, 4, 4, 0] },
               barMaxWidth: 20, label: { show: true, position: 'right', color: '#8b949e', fontSize: 11 } }]
  }));

  // 安裝項目分佈（圓餅圖）
  var installChart = echarts.init(document.getElementById('chart-install'));
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

  ${eccData.length > 0 ? `
  // ECC 融合堆疊柱狀圖
  var eccChart = echarts.init(document.getElementById('chart-ecc'));
  eccChart.setOption(Object.assign({}, dark, {
    title: { text: 'Source 融合統計', textStyle: { color: '#c9d1d9', fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    legend: { data: ['新增', '跳過'], textStyle: { color: '#8b949e' }, top: 5, right: 10 },
    grid: { left: 60, right: 20, top: 40, bottom: 20 },
    xAxis: { type: 'category', data: ${JSON.stringify(eccData.map(d => d.name))},
             axisLabel: { color: '#8b949e' } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#21262d' } } },
    series: [
      { name: '新增', type: 'bar', stack: 'total', data: ${JSON.stringify(eccData.map(d => d.added))},
        itemStyle: { color: '#3fb950' } },
      { name: '跳過', type: 'bar', stack: 'total', data: ${JSON.stringify(eccData.map(d => d.skipped))},
        itemStyle: { color: '#484f58' } }
    ]
  }));` : ''}

  window.addEventListener('resize', function() {
    techChart.resize(); installChart.resize();
    ${eccData.length > 0 ? 'eccChart.resize();' : ''}
  });
});
<\/script>`
}

// ── 主要匯出 ──────────────────────────────────────────────────────

/**
 * 產生完整 HTML 報告
 * @param {Object} data - 安裝資料
 * @returns {string} HTML
 */
export function generateReport(data) {
  const ts = data.timestamp ?? new Date().toISOString().replace('T', ' ').slice(0, 19)

  const body = [
    renderOverview(data),
    renderCharts(data),
    renderRepos(data.repos),
    renderPerRepo(data.perRepoReasoning),
    renderTechStacks(data.techStacks),
    renderAuditTrail(data.auditSummary),
    renderEcc(data.ecc),
    renderInstalled(data.installed),
    renderStacks(data.stacks),
    renderBackup(data.backupDir),
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
  <h1>🛠 ab-dotfiles 安裝報告</h1>
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
