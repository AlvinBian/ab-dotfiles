/**
 * CLAUDE.md 生成 — 全部角色使用 AI 生成，靜態模板作為 fallback
 */

import { AI_ECC_MODEL, AI_ECC_TIMEOUT } from "../core/constants.mjs";
import { callClaudeJSON } from "../external/claude-cli.mjs";

/**
 * 生成 CLAUDE.md 內容
 *
 * 所有角色都嘗試 AI 生成，失敗回退到靜態模板。
 * main: 完整版（技術棧 + 架構 + 規範 + 指令）
 * temp: 精簡版（摘要 + 快速上手）
 * tool: 最小版（一句描述）
 */
export async function generateClaudeMd({
	repoName,
	role,
	reasoning,
	stacks,
	meta,
}) {
	try {
		return await generateWithAI(repoName, role, reasoning, stacks, meta);
	} catch {
		// AI 失敗，用靜態模板
		if (role === "tool") return fallbackTool(repoName, meta);
		if (role === "temp") return fallbackTemp(repoName, reasoning, stacks, meta);
		return fallbackMain(repoName, reasoning, stacks, meta);
	}
}

// ── AI 生成（統一入口）──

async function generateWithAI(repoName, role, reasoning, stacks, meta) {
	const stackText = stacks
		? Object.entries(stacks)
				.map(([cat, items]) => `${cat}: ${items.join(", ")}`)
				.join("\n")
		: "";

	const rolePrompts = {
		main: `為 "${repoName}" 生成完整的 CLAUDE.md（Claude Code 專案上下文）。

專案摘要：${reasoning || meta?.description || ""}
技術棧：
${stackText}

生成以下 Markdown 結構（繁體中文，20 行以內）：
# {repoName}
{一句話描述}
## 技術棧（只列主要框架，不要完整依賴清單）
## 架構要點（3-5 點，幫助 AI 理解專案結構）
## 開發規範（Commit 格式、PR 流程、分支策略）
## 常用指令（dev/test/build/lint）`,

		temp: `為 "${repoName}" 生成精簡的 CLAUDE.md（Claude Code 專案上下文）。

專案摘要：${reasoning || meta?.description || ""}
技術棧：${stackText || "未知"}

生成以下 Markdown（繁體中文，15 行以內）：
# {repoName}
{一句話描述}
## 快速上手（安裝 + 開發指令）
## 技術棧（列出主要技術）
## 注意事項（2-3 點）`,

		tool: `為 "${repoName}" 生成最小的 CLAUDE.md（一句描述 + 使用方式）。

專案摘要：${reasoning || meta?.description || ""}

生成 Markdown（繁體中文，5 行以內）：
# {repoName}
{一句話描述}
## 使用方式`,
	};

	const result = await callClaudeJSON(rolePrompts[role] || rolePrompts.temp, {
		model: AI_ECC_MODEL,
		effort: "low",
		timeoutMs: AI_ECC_TIMEOUT,
		retries: 0,
	});

	let content = typeof result === "string" ? result : result?.result;
	if (!content) throw new Error("AI generation failed");

	// 檢查長度，如果超過 500 行則截斷並加警告
	const lineCount = content.split("\n").length;
	if (lineCount > 500) {
		const truncated = content.split("\n").slice(0, 500).join("\n");
		return `${truncated}\n\n<!-- WARNING: Generated content truncated from ${lineCount} lines -->`;
	}

	return content;
}

// ── 靜態 Fallback ──

function fallbackTool(repoName, meta) {
	return `# ${repoName}\n\n${meta?.description || repoName}。使用方式見 README。\n`;
}

function fallbackTemp(repoName, reasoning, stacks, meta) {
	const techList = stacks
		? Object.entries(stacks)
				.map(([, items]) => items.join(" · "))
				.join(" · ")
		: "";
	return `# ${repoName}

${reasoning || meta?.description || repoName}

## 快速上手
- 安裝依賴後啟動開發
- Commit 格式：Conventional Commits

## 技術棧
${techList || "見 package.json"}
`;
}

function fallbackMain(repoName, reasoning, stacks, meta) {
	const stackSections = stacks
		? Object.entries(stacks)
				.map(([cat, items]) => `- ${cat}：${items.join(", ")}`)
				.join("\n")
		: "";
	return `# ${repoName}

${reasoning || meta?.description || repoName}

## 技術棧
${stackSections || "見 package.json"}

## 開發規範
- Commit 格式：Conventional Commits
- PR 必須通過 code review
`;
}
