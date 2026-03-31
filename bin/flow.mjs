#!/usr/bin/env node
/**
 * pnpm run flow — 渲染並打開流程圖
 *
 * 掃描 docs/flows/*.mmd，解析 frontmatter，
 * 生成帶導航和跨圖跳轉的互動式 HTML 頁面。
 */

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { getDirname } from '../lib/core/paths.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '..')
const FLOWS_DIR = path.join(REPO, 'docs', 'flows')
const OUTPUT_HTML = path.join(REPO, 'dist', 'flowcharts.html')

// 解析 .mmd 檔案（frontmatter + mermaid body）
function parseFlowFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const name = path.basename(filePath, '.mmd')
  const meta = { title: name, description: '', links: [] }

  let body = content
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3)
    if (endIdx !== -1) {
      const fm = content.slice(3, endIdx)
      body = content.slice(endIdx + 3).trim()

      const titleMatch = fm.match(/title:\s*(.+)/)
      const descMatch = fm.match(/description:\s*(.+)/)
      if (titleMatch) meta.title = titleMatch[1].trim()
      if (descMatch) meta.description = descMatch[1].trim()

      // 解析 links
      const linksSection = fm.match(/links:\n([\s\S]*?)(?=\n\w|$)/)
      if (linksSection) {
        const linkLines = linksSection[1].match(/- (\S+):\s*(.+)/g) || []
        for (const line of linkLines) {
          const m = line.match(/- (\S+):\s*(.+)/)
          if (m) meta.links.push({ target: m[1], label: m[2] })
        }
      }
    }
  }

  return { name, ...meta, mermaid: body }
}

// 生成 HTML
function generateHTML(charts) {
  const navItems = charts.map(c =>
    `<a href="#${c.name}" class="nav-item" data-target="${c.name}">
      <span class="nav-title">${c.title}</span>
      <span class="nav-desc">${c.description}</span>
    </a>`
  ).join('\n    ')

  const sections = charts.map(c => {
    const linkHTML = c.links.length > 0
      ? `<div class="chart-links">${c.links.map(l =>
          `<a href="#${l.target}" class="link-btn">${l.label} →</a>`
        ).join(' ')}</div>`
      : ''

    return `
    <section class="chart-section" id="${c.name}">
      <div class="chart-header">
        <h2>${c.title}</h2>
        <p class="chart-desc">${c.description}</p>
        ${linkHTML}
      </div>
      <div class="chart-body">
        <div class="zoom-controls">
          <button class="zoom-btn" onclick="openModal('${c.name}')" title="全螢幕">⛶</button>
          <button class="zoom-btn" onclick="zoomIn('${c.name}')" title="放大">+</button>
          <button class="zoom-btn" onclick="zoomOut('${c.name}')" title="縮小">−</button>
          <button class="zoom-btn" onclick="zoomReset('${c.name}')" title="重置">⟲</button>
        </div>
        <div class="panzoom-container" id="pz-${c.name}">
          <div class="mermaid">
${c.mermaid}
          </div>
        </div>
      </div>
    </section>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ab-dotfiles — 流程圖</title>
  <style>
    :root {
      --bg: #0d1117; --card: #161b22; --border: #30363d;
      --text: #e6edf3; --dim: #8b949e; --accent: #58a6ff;
      --green: #3fb950; --red: #f85149;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); }

    /* Layout */
    .container { display: flex; min-height: 100vh; }

    /* Sidebar */
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

    /* Main */
    .main { flex: 1; padding: 2rem; max-width: calc(100vw - 280px); }

    /* Chart sections */
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
      padding: 1.5rem; overflow-x: auto;
    }
    .mermaid { display: flex; justify-content: center; min-height: 200px; }
    .mermaid svg { max-width: 100%; height: auto; }
    .zoom-controls {
      position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; z-index: 5;
    }
    .zoom-btn {
      width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 4px;
      background: var(--card); color: var(--text); cursor: pointer; font-size: 14px;
      display: flex; align-items: center; justify-content: center;
    }
    .zoom-btn:hover { border-color: var(--accent); color: var(--accent); }
    .chart-body { position: relative; overflow: hidden; }
    .panzoom-container { cursor: grab; }

    footer { text-align: center; color: var(--dim); font-size: 0.75rem; padding: 2rem 0; }

    /* Modal 全螢幕彈窗 */
    .modal-overlay {
      display: none; position: fixed; inset: 0; z-index: 100;
      background: rgba(0,0,0,0.85); backdrop-filter: blur(4px);
    }
    .modal-overlay.active { display: flex; flex-direction: column; }
    .modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.8rem 1.5rem; background: var(--card); border-bottom: 1px solid var(--border);
    }
    .modal-header h3 { font-size: 1rem; color: var(--text); }
    .modal-controls { display: flex; gap: 6px; }
    .modal-body {
      flex: 1; overflow: hidden; position: relative; cursor: grab;
    }
    .modal-panzoom { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
    .modal-panzoom svg { max-width: 95vw; max-height: 85vh; }

    @media (max-width: 768px) {
      .container { flex-direction: column; }
      .sidebar { width: 100%; min-width: 100%; height: auto; position: static; display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 1rem; }
      .sidebar h1 { width: 100%; }
      .nav-item { flex: 1; min-width: 120px; border-left: none; border-bottom: 2px solid transparent; }
      .main { max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="container">
    <nav class="sidebar">
      <h1>ab-dotfiles v2.1</h1>
      <div class="subtitle">${charts.length} 張流程圖 · 所有流程和分支</div>
      ${navItems}
    </nav>
    <main class="main">
      ${sections}
      <footer>Generated from docs/flows/*.mmd · ${new Date().toISOString().slice(0, 19)}</footer>
    </main>
  </div>

  <!-- Modal 全螢幕彈窗 -->
  <div class="modal-overlay" id="modal">
    <div class="modal-header">
      <h3 id="modal-title"></h3>
      <div class="modal-controls">
        <button class="zoom-btn" onclick="modalZoomIn()" title="放大">+</button>
        <button class="zoom-btn" onclick="modalZoomOut()" title="縮小">−</button>
        <button class="zoom-btn" onclick="modalZoomReset()" title="重置">⟲</button>
        <button class="zoom-btn" onclick="closeModal()" title="關閉 (ESC)">✕</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="modal-panzoom" id="modal-panzoom"></div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.6.1/dist/panzoom.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true, theme: 'dark',
      securityLevel: 'loose',  // 允許 click 跳轉
      themeVariables: {
        primaryColor: '#1f6feb', primaryTextColor: '#e6edf3', primaryBorderColor: '#388bfd',
        lineColor: '#8b949e', secondaryColor: '#161b22', tertiaryColor: '#21262d', fontSize: '14px',
      },
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
    });

    // Active nav highlight on scroll
    const sections = document.querySelectorAll('.chart-section');
    const navItems = document.querySelectorAll('.nav-item');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          navItems.forEach(n => n.classList.remove('active'));
          const active = document.querySelector('.nav-item[data-target="' + e.target.id + '"]');
          if (active) active.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    sections.forEach(s => observer.observe(s));

    // Smooth scroll for nav links
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // @panzoom/panzoom — 拖動 + 滾輪縮放
    const pzInstances = {};
    function initPanzoom() {
      document.querySelectorAll('.panzoom-container').forEach(el => {
        const id = el.id.replace('pz-', '');
        const instance = Panzoom(el, {
          maxScale: 4, minScale: 0.25, step: 0.15,
          contain: false, cursor: 'grab',
          excludeClass: 'link-btn',
        });
        // Ctrl/Cmd + 滾輪才縮放，普通滾輪正常滾動頁面
        el.parentElement.addEventListener('wheel', e => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            instance.zoomWithWheel(e);
          }
        }, { passive: false });
        pzInstances[id] = instance;
      });
    }

    function zoomIn(id) { const p = pzInstances[id]; if (p) p.zoomIn(); }
    function zoomOut(id) { const p = pzInstances[id]; if (p) p.zoomOut(); }
    function zoomReset(id) { const p = pzInstances[id]; if (p) p.reset(); }

    // Modal 全螢幕
    let modalPz = null;
    function openModal(id) {
      const section = document.getElementById(id);
      if (!section) return;
      const svg = section.querySelector('.mermaid svg');
      if (!svg) return;

      const modal = document.getElementById('modal');
      const container = document.getElementById('modal-panzoom');
      document.getElementById('modal-title').textContent = section.querySelector('h2').textContent;

      container.innerHTML = '';
      const clone = svg.cloneNode(true);
      clone.style.maxWidth = '95vw';
      clone.style.maxHeight = '85vh';
      container.appendChild(clone);

      modal.classList.add('active');
      document.body.style.overflow = 'hidden';

      if (modalPz) modalPz.destroy();
      modalPz = Panzoom(container, { maxScale: 6, minScale: 0.2, step: 0.15, contain: false, cursor: 'grab' });
      document.querySelector('.modal-body').addEventListener('wheel', e => {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); modalPz.zoomWithWheel(e); }
      }, { passive: false });
    }
    function closeModal() {
      document.getElementById('modal').classList.remove('active');
      document.body.style.overflow = '';
      if (modalPz) { modalPz.destroy(); modalPz = null; }
    }
    function modalZoomIn() { if (modalPz) modalPz.zoomIn(); }
    function modalZoomOut() { if (modalPz) modalPz.zoomOut(); }
    function modalZoomReset() { if (modalPz) modalPz.reset(); }

    // ESC 關閉 modal
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    // 點擊背景關閉
    document.getElementById('modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

    // Init after mermaid renders
    setTimeout(initPanzoom, 1500);
  </script>
</body>
</html>`
}

// Main
if (!fs.existsSync(FLOWS_DIR)) {
  console.error('找不到 docs/flows/ 目錄')
  process.exit(1)
}

const files = fs.readdirSync(FLOWS_DIR)
  .filter(f => f.endsWith('.mmd'))
  .sort()

if (files.length === 0) {
  console.error('docs/flows/ 中沒有找到 .mmd 檔案')
  process.exit(1)
}

// 按固定順序排列（主流程在前）
const order = ['setup-main', 'setup-status', 'phase-plan', 'phase-execute', 'config-protection', 'gmail-setup', 'repo-select', 'role-system', 'feature-map']
const sorted = files.sort((a, b) => {
  const ia = order.indexOf(a.replace('.mmd', ''))
  const ib = order.indexOf(b.replace('.mmd', ''))
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
})

const charts = sorted.map(f => parseFlowFile(path.join(FLOWS_DIR, f)))

fs.mkdirSync(path.dirname(OUTPUT_HTML), { recursive: true })
fs.writeFileSync(OUTPUT_HTML, generateHTML(charts))

console.log(`✔ 已生成 ${charts.length} 張流程圖 → dist/flowcharts.html`)
charts.forEach(c => console.log(`  ${c.name}: ${c.title}`))

exec(`open "${OUTPUT_HTML}"`)
