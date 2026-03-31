#!/usr/bin/env node
/**
 * pnpm run flow — 渲染並打開流程圖
 *
 * 用 @mermaid-js/mermaid-cli (mmdc) 預渲染 .mmd → SVG，
 * 生成 HTML viewer 在瀏覽器中查看。
 */

import fs from 'fs'
import path from 'path'
import { exec, execFileSync } from 'child_process'
import { getDirname } from '../lib/core/paths.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '..')
const FLOWS_DIR = path.join(REPO, 'docs', 'flows')
const OUTPUT_DIR = path.join(REPO, 'dist', 'flows')
const OUTPUT_HTML = path.join(REPO, 'dist', 'flowcharts.html')

// 解析 .mmd frontmatter
function parseFrontmatter(content) {
  const meta = { title: '', description: '', links: [] }
  if (!content.startsWith('---')) return { meta, body: content }
  const endIdx = content.indexOf('---', 3)
  if (endIdx === -1) return { meta, body: content }
  const fm = content.slice(3, endIdx)
  const body = content.slice(endIdx + 3).trim()
  const t = fm.match(/title:\s*(.+)/); if (t) meta.title = t[1].trim()
  const d = fm.match(/description:\s*(.+)/); if (d) meta.description = d[1].trim()
  const ls = fm.match(/links:\n([\s\S]*?)(?=\n\w|$)/)
  if (ls) {
    for (const m of (ls[1].match(/- (\S+):\s*(.+)/g) || [])) {
      const p = m.match(/- (\S+):\s*(.+)/)
      if (p) meta.links.push({ target: p[1], label: p[2] })
    }
  }
  return { meta, body }
}

// 用 mmdc 渲染 .mmd → SVG（先去掉 frontmatter）
function renderSvg(body, svgPath) {
  const tmpPath = svgPath.replace('.svg', '.tmp.mmd')
  try {
    fs.writeFileSync(tmpPath, body)
    execFileSync('npx', [
      '@mermaid-js/mermaid-cli', '-i', tmpPath, '-o', svgPath,
      '-t', 'dark', '-b', '#0d1117',
    ], {
      cwd: REPO, timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    try { fs.unlinkSync(tmpPath) } catch {}
    return true
  } catch {
    try { fs.unlinkSync(tmpPath) } catch {}
    return false
  }
}

function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

function generateHTML(charts) {
  const navItems = charts.map(c =>
    `<a href="#${c.name}" class="nav-item" data-target="${c.name}">
      <span class="nav-title">${escHtml(c.title)}</span>
      <span class="nav-desc">${escHtml(c.description)}</span>
    </a>`
  ).join('\n    ')

  const sections = charts.map(c => {
    const linkHTML = c.links.length > 0
      ? `<div class="chart-links">${c.links.map(l =>
          `<a href="#${l.target}" class="link-btn">${escHtml(l.label)} →</a>`
        ).join(' ')}</div>` : ''

    // 嵌入 SVG inline（如果渲染成功）或 fallback 到 mermaid CDN
    const svgPath = path.join(OUTPUT_DIR, `${c.name}.svg`)
    const hasSvg = fs.existsSync(svgPath)
    let chartContent
    if (hasSvg) {
      let svgContent = fs.readFileSync(svgPath, 'utf8')
      // 確保 SVG 響應式
      svgContent = svgContent.replace(/<svg /, '<svg style="max-width:100%;height:auto;" ')
      chartContent = `<div class="svg-wrap" id="svg-${c.name}">${svgContent}</div>`
    } else {
      chartContent = `<div class="mermaid" id="mmd-${c.name}">\n${c.body}\n</div>`
    }

    return `
    <section class="chart-section" id="${c.name}">
      <div class="chart-header">
        <h2>${escHtml(c.title)}</h2>
        <p class="chart-desc">${escHtml(c.description)}</p>
        ${linkHTML}
      </div>
      <div class="chart-body" onclick="openModal('${c.name}')" title="點擊放大">
        ${chartContent}
      </div>
    </section>`
  }).join('\n')

  // No svgMap needed — SVGs are inline

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ab-dotfiles — 流程圖</title>
  <script src="https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.6.1/dist/panzoom.min.js"></script>
  <style>
    :root {
      --bg: #0d1117; --card: #161b22; --border: #30363d;
      --text: #e6edf3; --dim: #8b949e; --accent: #58a6ff;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); }
    .container { display: flex; min-height: 100vh; }

    .sidebar {
      width: 280px; min-width: 280px; background: var(--card);
      border-right: 1px solid var(--border); padding: 1.5rem 0;
      position: sticky; top: 0; height: 100vh; overflow-y: auto;
    }
    .sidebar h1 { font-size: 1.1rem; padding: 0 1.2rem 1rem; color: var(--accent); border-bottom: 1px solid var(--border); margin-bottom: 0.5rem; }
    .sidebar .subtitle { font-size: 0.75rem; color: var(--dim); padding: 0 1.2rem 1rem; }
    .nav-item {
      display: block; padding: 0.6rem 1.2rem; text-decoration: none;
      border-left: 3px solid transparent; transition: all 0.15s;
    }
    .nav-item:hover { background: rgba(88,166,255,0.08); border-left-color: var(--accent); }
    .nav-item.active { background: rgba(88,166,255,0.12); border-left-color: var(--accent); }
    .nav-title { display: block; color: var(--text); font-size: 0.9rem; font-weight: 500; }
    .nav-desc { display: block; color: var(--dim); font-size: 0.75rem; margin-top: 2px; }

    .main { flex: 1; padding: 2rem; max-width: calc(100vw - 280px); }

    .chart-section { margin-bottom: 2.5rem; scroll-margin-top: 1rem; }
    .chart-header {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 12px 12px 0 0; padding: 1.2rem 1.5rem;
    }
    .chart-header h2 { font-size: 1.2rem; margin-bottom: 0.3rem; }
    .chart-desc { color: var(--dim); font-size: 0.85rem; }
    .chart-links { margin-top: 0.8rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .link-btn {
      color: var(--accent); text-decoration: none; font-size: 0.8rem;
      padding: 0.25rem 0.6rem; border: 1px solid var(--border);
      border-radius: 4px; transition: all 0.15s;
    }
    .link-btn:hover { background: rgba(88,166,255,0.1); border-color: var(--accent); }

    .chart-body {
      background: var(--card); border: 1px solid var(--border);
      border-top: none; border-radius: 0 0 12px 12px;
      padding: 1.5rem; overflow: hidden; cursor: pointer; text-align: center;
    }
    .chart-body:hover { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: 0 0 12px 12px; }
    .chart-body::after {
      content: '點擊放大'; position: absolute; top: 8px; right: 12px;
      font-size: 0.7rem; color: var(--dim); background: var(--card);
      padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border);
      opacity: 0; transition: opacity 0.2s; position: relative; display: none;
    }
    .chart-body:hover::after { display: inline-block; opacity: 1; }
    .svg-wrap { display: flex; justify-content: center; }
    .svg-wrap svg { max-width: 100%; height: auto; }

    /* Modal */
    .modal-overlay { display: none; position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.9); }
    .modal-overlay.active { display: flex; flex-direction: column; }
    .modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.6rem 1.2rem; background: var(--card); border-bottom: 1px solid var(--border);
    }
    .modal-header h3 { font-size: 1rem; color: var(--text); }
    .modal-controls { display: flex; gap: 6px; }
    .modal-controls button {
      width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 4px;
      background: var(--card); color: var(--text); cursor: pointer; font-size: 16px;
    }
    .modal-controls button:hover { border-color: var(--accent); color: var(--accent); }
    .modal-body {
      flex: 1; overflow: hidden; cursor: grab;
      display: flex; align-items: center; justify-content: center;
    }
    .modal-body:active { cursor: grabbing; }
    #modal-inner { display: inline-block; transform-origin: center center; }

    footer { text-align: center; color: var(--dim); font-size: 0.75rem; padding: 2rem 0; }
    @media (max-width: 768px) {
      .container { flex-direction: column; }
      .sidebar { width: 100%; min-width: 100%; height: auto; position: static; }
      .main { max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="container">
    <nav class="sidebar">
      <h1>ab-dotfiles v2.1</h1>
      <div class="subtitle">${charts.length} 張流程圖</div>
      ${navItems}
    </nav>
    <main class="main">
      ${sections}
      <footer>Generated ${new Date().toISOString().slice(0, 19)}</footer>
    </main>
  </div>

  <div class="modal-overlay" id="modal">
    <div class="modal-header">
      <h3 id="modal-title"></h3>
      <div class="modal-controls">
        <button onclick="mZoomIn()" title="放大">+</button>
        <button onclick="mZoomOut()" title="縮小">−</button>
        <button onclick="mReset()" title="重置">⟲</button>
        <button onclick="mClose()" title="關閉 ESC">✕</button>
      </div>
    </div>
    <div class="modal-body" id="modal-body">
      <div id="modal-inner"></div>
    </div>
  </div>

  ${charts.some(c => !fs.existsSync(path.join(OUTPUT_DIR, c.name + '.svg')))
    ? '<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>\n  <script>mermaid.initialize({ startOnLoad:true, theme:"dark", securityLevel:"loose", themeVariables:{ primaryColor:"#1f6feb", primaryTextColor:"#e6edf3", lineColor:"#8b949e" } });</script>' : ''}

  <script>
    // Nav
    const secs = document.querySelectorAll('.chart-section');
    const navs = document.querySelectorAll('.nav-item');
    new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) {
        navs.forEach(n => n.classList.remove('active'));
        const a = document.querySelector('.nav-item[data-target="'+e.target.id+'"]');
        if (a) a.classList.add('active');
      }});
    }, { rootMargin: '-20% 0px -70% 0px' }).observe && secs.forEach(s => new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) {
        navs.forEach(n => n.classList.remove('active'));
        const a = document.querySelector('.nav-item[data-target="'+e.target.id+'"]');
        if (a) a.classList.add('active');
      }});
    }, { rootMargin: '-20% 0px -70% 0px' }).observe(s));

    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior:'smooth', block:'start' });
      });
    });

    // Modal
    let pz = null, wheelH = null;
    function openModal(id) {
      const inner = document.getElementById('modal-inner');
      const body = document.getElementById('modal-body');
      document.getElementById('modal-title').textContent =
        document.getElementById(id)?.querySelector('h2')?.textContent || id;

      inner.innerHTML = '';
      if (wheelH) { body.removeEventListener('wheel', wheelH); wheelH = null; }
      if (pz) { pz.destroy(); pz = null; }

      // 從 inline SVG 克隆
      const source = document.querySelector('#svg-' + id + ' svg') || document.querySelector('#mmd-' + id + ' svg');
      if (!source) return;
      const clone = source.cloneNode(true);
      inner.appendChild(clone);

      document.getElementById('modal').classList.add('active');
      document.body.style.overflow = 'hidden';

      // fit-to-screen：直接設定 SVG 尺寸填滿，panzoom 從 1x 開始
      requestAnimationFrame(() => {
        const vw = body.clientWidth;
        const vh = body.clientHeight;
        const vb = clone.viewBox?.baseVal;
        const natW = vb?.width || clone.getBoundingClientRect().width || 800;
        const natH = vb?.height || clone.getBoundingClientRect().height || 600;
        const fit = Math.min((vw * 0.92) / natW, (vh * 0.92) / natH);
        clone.setAttribute('width', natW * fit);
        clone.setAttribute('height', natH * fit);
        clone.style.display = 'block';

        pz = Panzoom(inner, { maxScale:8, minScale:0.2, step:0.12, contain:false, cursor:'grab' });
      });
      wheelH = e => { if (e.ctrlKey||e.metaKey) { e.preventDefault(); pz.zoomWithWheel(e,{animate:false}); } };
      body.addEventListener('wheel', wheelH, {passive:false});
      body.addEventListener('gesturestart', e=>e.preventDefault(), {passive:false});
      body.addEventListener('gesturechange', e=>{
        e.preventDefault();
        pz.zoom(Math.min(Math.max(pz.getScale()*(e.scale>1?1.04:0.96),0.3),5),{animate:false});
      }, {passive:false});
    }
    function mClose() {
      document.getElementById('modal').classList.remove('active');
      document.body.style.overflow = '';
      if (wheelH) { document.getElementById('modal-body').removeEventListener('wheel',wheelH); wheelH=null; }
      if (pz) { pz.destroy(); pz=null; }
    }
    function mFocal() { const r=document.getElementById('modal-body'); return {x:r.clientWidth/2, y:r.clientHeight/2}; }
    function mZoomIn() { if(pz) pz.zoomIn({focal:mFocal(),animate:false}); }
    function mZoomOut() { if(pz) pz.zoomOut({focal:mFocal(),animate:false}); }
    function mReset() { if(pz) pz.reset(); }

    document.addEventListener('keydown', e => { if(e.key==='Escape') mClose(); });
    document.getElementById('modal').addEventListener('click', e => { if(e.target===e.currentTarget) mClose(); });
  </script>
</body>
</html>`
}

// ── Main ──
if (!fs.existsSync(FLOWS_DIR)) { console.error('找不到 docs/flows/'); process.exit(1) }

const order = [
  'setup-main', 'setup-status', 'env-check', 'upgrade-legacy',
  'phase-plan', 'phase-execute', 'config-protection',
  'repo-select', 'role-system', 'feature-map',
  'slack-setup', 'gmail-setup', 'ecc-pipeline', 'session-lifecycle',
]

const files = fs.readdirSync(FLOWS_DIR).filter(f => f.endsWith('.mmd')).sort((a, b) => {
  const ia = order.indexOf(a.replace('.mmd', ''))
  const ib = order.indexOf(b.replace('.mmd', ''))
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
})

if (files.length === 0) { console.error('docs/flows/ 中沒有 .mmd 檔案'); process.exit(1) }

// 渲染 SVG
fs.mkdirSync(OUTPUT_DIR, { recursive: true })
console.log(`渲染 ${files.length} 張流程圖...`)
let rendered = 0, fallback = 0

const charts = files.map(f => {
  const filePath = path.join(FLOWS_DIR, f)
  const name = f.replace('.mmd', '')
  const content = fs.readFileSync(filePath, 'utf8')
  const { meta, body } = parseFrontmatter(content)

  const svgPath = path.join(OUTPUT_DIR, `${name}.svg`)
  if (renderSvg(body, svgPath)) {
    rendered++
    console.log(`  ✔ ${name}`)
  } else {
    fallback++
    console.log(`  ⚠ ${name}（fallback 到 CDN 渲染）`)
  }

  return { name, title: meta.title || name, description: meta.description || '', links: meta.links, body }
})

fs.writeFileSync(OUTPUT_HTML, generateHTML(charts))
console.log(`\n✔ ${rendered} 張 SVG 預渲染 + ${fallback} 張 CDN fallback → dist/flowcharts.html`)

exec(`open "${OUTPUT_HTML}"`)
