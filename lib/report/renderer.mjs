/**
 * 報告渲染引擎
 *
 * 職責：組織 HTML 報告的結構，包括 Tab 導航、圖表、搜尋功能。
 * 匯出：generateReport(data) / saveReport(html, dir) / openInBrowser(path)
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getDescription } from "../config/descriptions.mjs";
import {
	esc,
	badge,
	section,
	getStyles,
	renderOverview,
	renderEcc,
	renderInstalled,
	renderStacks,
	renderBackup,
} from "./formatters.mjs";

// ── Tab 區塊渲染 ────────────────────────────────────────────────

/**
 * 渲染 Tab 概覽頁籤
 */
function renderTabOverview(data) {
	return `
<div id="tab-overview" class="tab-content active">
  ${renderOverview(data)}
  <div class="card" style="margin-bottom:16px">
    <p class="section-desc" style="margin:0">概覽顯示安裝的總體統計。使用頂部 Tab 導航查看技術棧、專案、安裝詳情、審計日誌。</p>
  </div>
</div>`;
}

/**
 * 渲染 Tab 技術棧頁籤
 */
function renderTabTechStacks(data) {
	const stacks = data.stacks || [];
	const totalRepos = (data.repos || []).length;

	const stackRepoCount = {};
	if (data.repos && data.repos.length > 0) {
		for (const repo of data.repos) {
			const stackData = (data.perRepoReasoning?.[repo] || {}).stacks || {};
			for (const stacks of Object.values(stackData)) {
				for (const tech of stacks || []) {
					stackRepoCount[tech] = (stackRepoCount[tech] || 0) + 1;
				}
			}
		}
	}

	const topCount = Math.min(20, Object.keys(stackRepoCount).length);
	const topStacks = Object.entries(stackRepoCount)
		.sort((a, b) => b[1] - a[1])
		.slice(0, topCount)
		.map(([tech, count]) => ({
			name: tech,
			value: count,
			percentage: ((count / totalRepos) * 100).toFixed(1),
		}));

	const topStacksData = JSON.stringify(topStacks);
	const freqHeight = Math.max(300, 100 + topCount * 20);

	return `
<div id="tab-stacks" class="tab-content">
  <div class="card" style="margin-bottom:16px">
    <p class="section-desc" style="margin:0">技術棧統計展示團隊使用的所有技術及其採用頻率。單位為「Repo 數量」。</p>
  </div>
  <div class="card">
    <h2 class="section-title">所有技術棧</h2>
    ${stacks.length > 0 ? `<div>${stacks.map((s) => badge(s, "blue", getDescription(s))).join("")}</div>` : "<p style=\"color:#8b949e\">無技術棧資料</p>"}
  </div>
  ${
		topCount > 0
			? `
  <div class="card">
    <h2 class="section-title">技術棧使用頻率（Top 20）</h2>
    <p class="section-desc">統計每個技術出現在多少個 repo 中，頻率越高表示該技術在團隊中越普及。</p>
    <div id="chart-tech-freq" style="height:${freqHeight}px"></div>
  </div>`
			: ""
	}
</div>`;
}

/**
 * 渲染 Tab 專案頁籤
 */
function renderTabRepos(data) {
	const perRepoReasoning = data.perRepoReasoning || {};
	const repos = data.repos || [];
	const roles = data.repoRoles || {};
	const projects = data.projects || [];

	const repoKeys = repos.length > 0 ? repos : Object.keys(perRepoReasoning);
	if (!repoKeys.length)
		return '<div id="tab-repos" class="tab-content"><p style="color:#8b949e">無 Repo 資料</p></div>';

	const roleIcon = { main: "⭐ 主力", temp: "🔄 臨時", tool: "🔧 工具" };
	const typeLabel = { full: "AI 生成", concise: "靜態模板", minimal: "最小" };

	const cards = repoKeys
		.map((repo) => {
			const shortName = repo.split("/")[1];
			const repoData =
				perRepoReasoning[repo] || perRepoReasoning[shortName] || {};
			const roleInfo = roles[repo] || {};
			const proj = projects.find((p) => p.repo === repo);
			const role = roleInfo.role || "temp";
			const categories = Object.keys(repoData.stacks || {}).join(",");

			const roleBadge = badge(
				roleIcon[role] || role,
				role === "main" ? "green" : "grey",
			);

			let stackBadges = "";
			for (const [cat, techs] of Object.entries(repoData.stacks || {})) {
				if (!techs?.length) continue;
				stackBadges += `<div style="margin-top:6px"><span style="font-size:.78rem;color:#8b949e;margin-right:4px">${esc(cat)}:</span>${techs
					.map((t) => {
						const d = getDescription(t);
						return d ? badge(t, "blue", d) : badge(t, "blue");
					})
					.join("")}</div>`;
			}

			const localPath = roleInfo.localPath
				? roleInfo.localPath.replace(process.env.HOME, "~")
				: "未找到";
			const claudeMd = proj ? typeLabel[proj.claudeMdType] || "—" : "—";
			const roleDesc =
				role === "main"
					? "完整 AI 分析 + 技術棧上下文"
					: role === "tool"
						? "最小配置"
						: "精簡模板";

			return `<div class="repo-card" data-categories="${esc(categories)}">
      <div class="name">${roleBadge} ${esc(repo)}</div>
      ${repoData.reasoning ? `<div class="reasoning">${esc(repoData.reasoning)}</div>` : ""}
      <table style="margin-top:8px;font-size:.85rem">
        <tr><td style="color:#8b949e;width:90px">路徑</td><td class="mono">${esc(localPath)}</td></tr>
        <tr><td style="color:#8b949e">CLAUDE.md</td><td>${esc(claudeMd)}</td></tr>
        <tr><td style="color:#8b949e">配置</td><td>${esc(roleDesc)}</td></tr>
      </table>
      ${stackBadges}
    </div>`;
		})
		.join("");

	return `
<div id="tab-repos" class="tab-content">
  <div class="card" style="margin-bottom:16px">
    <p class="section-desc" style="margin:0">每個 Repo 卡片顯示角色、本機路徑、CLAUDE.md 狀態和 AI 分析的技術棧。使用搜尋框過濾，或從技術棧 Tab 的圖表點擊分類來篩選。</p>
  </div>
  <input type="text" id="search" class="search-box" placeholder="搜尋技術棧、Repo...">
  <div id="repos-filter-hint" class="filter-hint"></div>
  ${cards}
</div>`;
}

/**
 * 渲染 Tab 安裝頁籤
 */
function renderTabInstall(data) {
	const hasEcc = (data.ecc?.sources?.length || 0) > 0;

	return `
<div id="tab-install" class="tab-content">
  <div class="card" style="margin-bottom:16px">
    <p class="section-desc" style="margin:0">所有安裝到 ~/.claude/ 的配置項目。每個 Command 是一個 Slash 指令（/xxx），Agent 是一個可 @mention 的 AI 助手，Rule 是自動載入的行為規範。</p>
  </div>
  ${renderInstalled(data.installed)}
  ${
		hasEcc
			? `
  <div class="card">
    <h2 class="section-title">Source 融合統計圖表</h2>
    <div class="chart-box" id="chart-ecc-install"></div>
  </div>`
			: ""
	}
  ${renderEcc(data.ecc)}
  ${renderStacks(data.stacks)}
</div>`;
}

/**
 * 渲染 Tab 審計頁籤
 */
function renderTabAudit(data) {
	const auditHtml = data.auditSummary
		? section(
				"審計日誌",
				`<table>${Object.entries(data.auditSummary)
					.map(
						([k, v]) =>
							`<tr><td style="color:#8b949e">${esc(k)}</td><td>${esc(String(v))}</td></tr>`,
					)
					.join("")}</table>`,
			)
		: "";

	const backupHtml = renderBackup(data.backupDir);

	return `
<div id="tab-audit" class="tab-content">
  ${auditHtml}
  ${backupHtml}
</div>`;
}

// ── 圖表及互動腳本 ────────────────────────────────────────────────

/**
 * 渲染 ECharts 圖表及互動腳本
 */
function renderCharts(data) {
	const stacks = data.stacks || [];
	const perRepoReasoning = data.perRepoReasoning || {};
	const repos = data.repos || [];

	const stackRepoCount = {};
	if (repos.length > 0) {
		for (const repo of repos) {
			const stackData = (perRepoReasoning[repo] || {}).stacks || {};
			for (const techs of Object.values(stackData)) {
				for (const tech of techs || []) {
					stackRepoCount[tech] = (stackRepoCount[tech] || 0) + 1;
				}
			}
		}
	}

	const topCount = Math.min(20, Object.keys(stackRepoCount).length);
	const topStacks = Object.entries(stackRepoCount)
		.sort((a, b) => b[1] - a[1])
		.slice(0, topCount);

	const chartConfig = {
		techFreq: topStacks.map(([name, count]) => ({
			name,
			value: count,
		})),
	};

	if (stacks.length === 0 && repos.length === 0) return "";

	return `
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<script>
const chartConfig = ${JSON.stringify(chartConfig)};

const tabButtons = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    
    setTimeout(() => {
      if (btn.dataset.tab === 'stacks') initTechFreqChart();
      if (btn.dataset.tab === 'install') initEccInstallChart();
    }, 100);
  });
});

function initTechFreqChart() {
  const dom = document.getElementById('chart-tech-freq');
  if (!dom || dom._echarts) return;
  const chart = echarts.init(dom);
  dom._echarts = chart;
  const option = {
    backgroundColor: 'transparent',
    textStyle: { color: '#8b949e' },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 120, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'value', axisLabel: { color: '#8b949e' } },
    yAxis: { type: 'category', data: chartConfig.techFreq.map(d => d.name), axisLabel: { color: '#8b949e' } },
    series: [{
      type: 'bar',
      data: chartConfig.techFreq.map(d => d.value),
      itemStyle: { color: '#58a6ff' },
      label: { show: true, position: 'right', color: '#8b949e' }
    }]
  };
  chart.setOption(option);
  window.addEventListener('resize', () => chart.resize());
}

function initEccInstallChart() {
  const dom = document.getElementById('chart-ecc-install');
  if (!dom || !dom.offsetParent) return;
  const chart = echarts.init(dom);
  const option = {
    backgroundColor: 'transparent',
    textStyle: { color: '#8b949e' },
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: '50%',
      data: [{ value: 1, name: 'ECC Source' }],
      itemStyle: { color: '#3fb950' }
    }]
  };
  chart.setOption(option);
}

// 搜尋功能
const searchInput = document.getElementById('search');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const cards = document.querySelectorAll('.repo-card');
    let matched = 0;
    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      const cats = (card.dataset.categories || '').toLowerCase();
      if (text.includes(query) || cats.includes(query)) {
        card.classList.remove('hidden');
        matched++;
      } else {
        card.classList.add('hidden');
      }
    });
    const hint = document.getElementById('repos-filter-hint');
    if (hint) hint.textContent = query ? \`找到 \${matched} 個匹配\` : '';
  });
}

// 初始化概覽 Tab 圖表
initTechFreqChart();
</script>`;
}

/**
 * 渲染 Tab 切換腳本（基礎版本）
 */
function renderTabScript() {
	return "";
}

// ── 主要匯出 ────────────────────────────────────────────────────

/**
 * 產生完整 HTML 報告
 * @param {Object} data - 安裝資料
 * @returns {string} HTML
 */
export function generateReport(data) {
	const ts =
		data.timestamp ?? new Date().toISOString().replace("T", " ").slice(0, 19);

	const tabNav = `
<nav class="tabs">
  <button class="tab active" data-tab="overview">概覽</button>
  <button class="tab" data-tab="stacks">技術棧</button>
  <button class="tab" data-tab="repos">專案</button>
  <button class="tab" data-tab="install">安裝</button>
  <button class="tab" data-tab="audit">審計</button>
</nav>`;

	const body = [
		tabNav,
		renderTabOverview(data),
		renderTabTechStacks(data),
		renderTabRepos(data),
		renderTabInstall(data),
		renderTabAudit(data),
		renderCharts(data),
		renderTabScript(),
	].join("\n");

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
</html>`;
}

/** 儲存報告到檔案 */
export function saveReport(html, outputDir) {
	const dir = path.resolve(outputDir);
	fs.mkdirSync(dir, { recursive: true });
	const filePath = path.join(dir, "report.html");
	fs.writeFileSync(filePath, html, "utf-8");
	return filePath;
}

/** 在預設瀏覽器開啟 */
export function openInBrowser(filePath) {
	const abs = path.resolve(filePath);
	const cmd =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "start"
				: "xdg-open";
	const args = process.platform === "win32" ? ["", abs] : [abs];
	try {
		execFileSync(cmd, args);
		return Promise.resolve();
	} catch (err) {
		return Promise.reject(err);
	}
}
