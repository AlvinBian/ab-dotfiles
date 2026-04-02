/**
 * 報告格式化輔助函式
 *
 * 職責：提供報告生成中的 HTML 片段生成和樣式設定。
 * 包括：HTML 逃逸、徽章、卡片、CSS 樣式、安裝/ECC 項目渲染。
 */

import path from "node:path";
import { sumBy } from "lodash-es";
import { getDescription } from "../config/descriptions.mjs";

// ── HTML 轉義及元件 ──────────────────────────────────────────────

/**
 * 逃逸 HTML 特殊字元
 */
export function esc(str) {
	if (typeof str !== "string") return String(str ?? "");
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * 產生徽章 HTML
 */
export function badge(text, variant = "blue", desc = "") {
	const tooltip = desc ? ` title="${esc(desc)}"` : "";
	return `<span class="badge badge-${variant}"${tooltip}>${esc(text)}</span>`;
}

/**
 * 產生帶描述的徽章
 */
export function badgeWithDesc(name, variant, type, claudeDir) {
	const desc = getDescription(name, type, claudeDir);
	return desc
		? `<div class="item-row"><span class="badge badge-${variant}">${esc(name)}</span><span class="item-desc">${esc(desc)}</span></div>`
		: `<span class="badge badge-${variant}">${esc(name)}</span>`;
}

/**
 * 產生卡片容器
 */
export function section(title, content) {
	return `<div class="card"><h2 class="section-title">${esc(title)}</h2>${content}</div>`;
}

// ── CSS 樣式 ──────────────────────────────────────────────────────

/**
 * 取得完整 CSS 樣式表
 */
export function getStyles() {
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
.section-desc{font-size:.82rem;color:#8b949e;margin:-8px 0 12px;line-height:1.5}
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
`;
}

// ── 內容區塊渲染 ────────────────────────────────────────────────────

/**
 * 渲染概覽區塊
 */
export function renderOverview(data) {
	const eccAdded = sumBy(
		data.ecc?.sources || [],
		(r) =>
			(r.added?.commands?.length || 0) +
			(r.added?.agents?.length || 0) +
			(r.added?.rules?.length || 0),
	);
	const items = [
		{ label: "使用者", value: esc(data.username) },
		{ label: "組織", value: esc(data.org) },
		{ label: "模式", value: data.mode === "auto" ? "自動" : "手動" },
		{ label: "Repos", value: data.repos?.length ?? 0 },
		{ label: "技術棧", value: data.stacks?.length ?? 0 },
		{ label: "ECC 融合", value: `+${eccAdded}` },
	];
	const inner = items
		.map(
			(i) =>
				`<div class="item"><div class="value">${i.value}</div><div class="label">${i.label}</div></div>`,
		)
		.join("");
	return `<div class="card"><div class="overview">${inner}</div></div>`;
}

/**
 * 渲染 ECC 融合區塊
 */
export function renderEcc(ecc) {
	if (!ecc?.sources?.length) return "";
	let inner = "";
	for (const src of ecc.sources) {
		inner += `<div class="source-header">
      <span class="name">${esc(src.name)}</span>
      <span class="meta">${esc(src.repo)} · ${src.version || "?"}${src.cached ? " · 快取" : ""}</span>
    </div>`;
		for (const [key, arr] of Object.entries(src.added || {})) {
			if (!arr?.length) continue;
			const HOME = process.env.HOME;
			const claudeDir = path.join(HOME, ".claude");
			inner += `<div class="group-label">+ ${esc(key)}（${arr.length}）</div><div>${arr.map((v) => badgeWithDesc(v, "green", key, claudeDir)).join("")}</div>`;
		}
		const skippedTotal = sumBy(
			Object.values(src.skipped || {}),
			(a) => a?.length || 0,
		);
		if (skippedTotal > 0) {
			inner += `<div class="group-label" style="color:#8b949e">跳過（本地優先）${skippedTotal} 個</div>`;
		}
		inner +=
			'<hr style="border:none;border-top:1px solid #21262d;margin:12px 0">';
	}
	return section(
		"Source 融合",
		'<p class="section-desc">ECC（Everything Claude Code）外部社群資源。「新增」表示本地沒有的項目已融合，「跳過」表示本地已有同名項目優先保留。</p>' +
			inner,
	);
}

/**
 * 渲染已安裝項目區塊
 */
export function renderInstalled(installed) {
	if (!installed) return "";
	const HOME = process.env.HOME;
	const claudeDir = path.join(HOME, ".claude");
	let inner = "";
	const groups = [
		["Commands", installed.commands, "blue", "commands"],
		["Agents", installed.agents, "purple", "agents"],
		["Rules", installed.rules, "blue", "rules"],
		["Zsh Modules", installed.modules, "pink", null],
	];
	for (const [label, items, variant, type] of groups) {
		if (!items?.length) continue;
		inner += `<div class="group-label">${label}（${items.length}）</div><div>`;
		if (type) {
			inner += items
				.map((v) => badgeWithDesc(v, variant, type, claudeDir))
				.join("");
		} else {
			inner += items.map((v) => badge(v, variant)).join("");
		}
		inner += "</div>";
	}
	if (installed.hooks)
		inner += `<div class="group-label">Hooks</div><div>${badge("已啟用", "green")}</div>`;
	return section(
		"已安裝項目",
		'<p class="section-desc">以下配置已安裝到 ~/.claude/ 目錄，對所有專案全局生效。帶描述的項目來自 ab-dotfiles，無描述的可能是 ECC 外部資源。</p>' +
			inner,
	);
}

/**
 * 渲染技術棧統計區塊
 */
export function renderStacks(stacks) {
	if (!stacks?.length) return "";
	const stackList = stacks
		.map((s) => badge(s, "blue", getDescription(s)))
		.join("");
	return section("技術棧總覽", stackList);
}

/**
 * 渲染備份區塊
 */
export function renderBackup(backupDir) {
	if (!backupDir) return "";
	return section(
		"備份位置",
		`<div class="mono" style="padding:8px;background:#0d1117;border-radius:4px">${esc(backupDir)}</div>`,
	);
}
