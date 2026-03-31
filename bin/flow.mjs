#!/usr/bin/env node
/**
 * pnpm run flow — 渲染並打開流程圖
 *
 * 從 docs/flowcharts.md 提取 Mermaid 圖表，
 * 生成互動式 HTML 頁面在瀏覽器中查看。
 */

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { getDirname } from '../lib/core/paths.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '..')
const FLOWCHART_MD = path.join(REPO, 'docs', 'flowcharts.md')
const OUTPUT_HTML = path.join(REPO, 'dist', 'flowcharts.html')

// 從 markdown 提取所有 mermaid blocks 和對應標題
function extractCharts(md) {
  const charts = []
  const lines = md.split('\n')
  let currentTitle = ''
  let inBlock = false
  let block = ''

  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentTitle = line.replace('## ', '').trim()
    } else if (line.trim() === '```mermaid') {
      inBlock = true
      block = ''
    } else if (line.trim() === '```' && inBlock) {
      inBlock = false
      charts.push({ title: currentTitle, mermaid: block.trim() })
    } else if (inBlock) {
      block += line + '\n'
    }
  }
  return charts
}

// 生成 HTML（使用 Mermaid.js CDN 在瀏覽器端渲染）
function generateHTML(charts) {
  const chartSections = charts.map((c, i) => `
    <section class="chart-section">
      <h2>${c.title}</h2>
      <div class="mermaid" id="chart-${i}">
${c.mermaid}
      </div>
    </section>
  `).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ab-dotfiles — 流程圖</title>
  <style>
    :root {
      --bg: #0d1117;
      --card: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --accent: #58a6ff;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 2rem;
    }
    h1 {
      text-align: center;
      font-size: 1.8rem;
      margin-bottom: 0.5rem;
      color: var(--accent);
    }
    .subtitle {
      text-align: center;
      color: #8b949e;
      margin-bottom: 2rem;
      font-size: 0.9rem;
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: center;
      margin-bottom: 2rem;
      position: sticky;
      top: 0;
      background: var(--bg);
      padding: 1rem 0;
      z-index: 10;
      border-bottom: 1px solid var(--border);
    }
    nav a {
      color: var(--accent);
      text-decoration: none;
      padding: 0.4rem 0.8rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 0.85rem;
      transition: all 0.2s;
    }
    nav a:hover {
      background: var(--card);
      border-color: var(--accent);
    }
    .chart-section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      overflow-x: auto;
    }
    .chart-section h2 {
      font-size: 1.2rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
    }
    .mermaid {
      display: flex;
      justify-content: center;
      min-height: 200px;
    }
    .mermaid svg {
      max-width: 100%;
      height: auto;
    }
    footer {
      text-align: center;
      color: #8b949e;
      font-size: 0.8rem;
      padding: 2rem 0;
    }
  </style>
</head>
<body>
  <h1>ab-dotfiles v2.1 — 流程圖</h1>
  <p class="subtitle">所有流程和分支的完整視覺化</p>

  <nav>
    ${charts.map((c, i) => `<a href="#chart-${i}">${c.title}</a>`).join('\n    ')}
  </nav>

  ${chartSections}

  <footer>
    Generated from docs/flowcharts.md · ${new Date().toISOString().slice(0, 19)}
  </footer>

  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      themeVariables: {
        primaryColor: '#1f6feb',
        primaryTextColor: '#e6edf3',
        primaryBorderColor: '#388bfd',
        lineColor: '#8b949e',
        secondaryColor: '#161b22',
        tertiaryColor: '#21262d',
        fontSize: '14px',
      },
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',
      },
    });
  </script>
</body>
</html>`
}

// Main
if (!fs.existsSync(FLOWCHART_MD)) {
  console.error('找不到 docs/flowcharts.md')
  process.exit(1)
}

const md = fs.readFileSync(FLOWCHART_MD, 'utf8')
const charts = extractCharts(md)

if (charts.length === 0) {
  console.error('docs/flowcharts.md 中沒有找到 mermaid 圖表')
  process.exit(1)
}

fs.mkdirSync(path.dirname(OUTPUT_HTML), { recursive: true })
fs.writeFileSync(OUTPUT_HTML, generateHTML(charts))

console.log(`✔ 已生成 ${charts.length} 張流程圖 → dist/flowcharts.html`)

// 開啟瀏覽器
exec(`open "${OUTPUT_HTML}"`)
