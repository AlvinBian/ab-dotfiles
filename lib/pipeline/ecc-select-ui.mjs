/**
 * ECC 外部資源選擇互動 UI
 *
 * 流程：AI 推薦摘要 → 確認/調整/查看全部/跳過
 *
 * AI 推薦結果（eccAiPromise）可能在背景尚未完成，
 * 本模組在顯示選單前會 await 等待結果，確保推薦資訊完整。
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { handleCancel, multiselectWithAll } from "../cli/prompts.mjs";
import { getDirname } from "../core/paths.mjs";
import { filterItems } from "../external/source-sync.mjs";

const __dirname = getDirname(import.meta);

// 翻譯索引快取（lazy load，第一次使用時載入）
let _translations = null;

/**
 * 取得 ECC 項目的繁體中文翻譯
 *
 * 優先讀取 .cache/translations.json（由 pipeline-runner 背景翻譯產生），
 * 不存在時 fallback 到靜態 ecc/translations.json。
 *
 * @param {string} type - 類型（commands / agents / rules）
 * @param {string} name - 檔名（含或不含 .md）
 * @returns {string|null} 翻譯文字，查不到返回 null
 */
function getTranslation(type, name) {
	if (!_translations) {
		const cacheT = path.resolve(
			__dirname,
			"..",
			"..",
			".cache",
			"translations.json",
		);
		const staticT = path.resolve(
			__dirname,
			"..",
			"..",
			"ecc",
			"translations.json",
		);
		const tPath = fs.existsSync(cacheT) ? cacheT : staticT;
		try {
			_translations = JSON.parse(fs.readFileSync(tPath, "utf8"));
		} catch {
			_translations = {};
		}
	}
	const key = name.replace(".md", "");
	return _translations[type]?.[key] || null;
}

/**
 * 從 ECC 檔案內容提取簡短描述
 *
 * 優先順序：翻譯索引 → frontmatter description → 第一個非空非標題行 → description: 欄位
 *
 * @param {string|null} content - 檔案內容
 * @param {string} fallbackName - 備用名稱（無內容時返回）
 * @param {string} type - 類型（commands / agents / rules）
 * @returns {string} 描述文字
 */
function extractDesc(content, fallbackName, type) {
	// 優先用翻譯
	const trans = getTranslation(type, fallbackName);
	if (trans) return trans;

	const lines = (content || "").split("\n");
	let inFrontmatter = false;
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === "---") {
			inFrontmatter = !inFrontmatter;
			continue;
		}
		if (inFrontmatter) continue;
		if (!trimmed) continue;
		const desc = trimmed.replace(/^#+\s*/, "").trim();
		if (desc && desc !== "---") return desc;
	}
	const descMatch = (content || "").match(/^description:\s*>?\s*\n?\s*(.+)/m);
	return descMatch
		? descMatch[1].trim().split(/[。.]/)[0]
		: fallbackName.replace(".md", "");
}

/**
 * ECC 外部資源選擇互動 UI
 *
 * 根據偵測到的技術棧過濾候選項目，等待 AI 推薦結果後
 * 顯示推薦摘要，讓用戶選擇安裝哪些外部資源。
 *
 * @param {Object} opts
 * @param {Object} opts.eccFetchResult - fetchAllSources 回傳（含 sources 陣列）
 * @param {Set<string>} opts.existingNames - 已安裝的項目名稱集合（避免重複）
 * @param {string[]} opts.detectedSkills - 偵測到的技術棧 ID（用於過濾相關 ECC）
 * @param {string[]} opts.allLangs - 所有偵測語言（detectedSkills 為空時的備用）
 * @param {Promise|null} opts.eccAiPromise - AI 推薦 Promise（背景執行，此處 await）
 * @returns {Promise<Object|null>} { commands: Set, agents: Set, rules: Set }，用戶跳過時返回 null
 */
export async function selectEcc({
	eccFetchResult,
	existingNames,
	detectedSkills,
	allLangs,
	eccAiPromise,
}) {
	if (!eccFetchResult?.sources?.length) return null;

	const allFilteredItems = { commands: [], agents: [], rules: [] };
	let totalEcc = 0;

	for (const src of eccFetchResult.sources) {
		const filtered = filterItems(
			{
				commands: src.allFiles.commands,
				agents: src.allFiles.agents,
				rules: src.allFiles.rules,
			},
			detectedSkills.length > 0
				? detectedSkills
				: allLangs.map((l) => l.toLowerCase()),
			existingNames,
		);
		for (const type of ["commands", "agents", "rules"]) {
			allFilteredItems[type].push(...(filtered[type] || []));
		}
		totalEcc +=
			(filtered.commands?.length || 0) +
			(filtered.agents?.length || 0) +
			(filtered.rules?.length || 0);
	}

	if (totalEcc === 0) return null;

	// 取得推薦結果（規則匹配：即時 / AI：背景等待）
	let aiRec = null;
	if (eccAiPromise) {
		aiRec = await eccAiPromise;
		if (aiRec?.recommended?.length) {
			p.log.success(`🔗 ECC 推薦 ${aiRec.recommended.length} 個`);
		}
	}
	// AI 推薦結果的名稱格式不一致，需要正規化：
	//   - 可能含 .md 後綴（"typescript-reviewer.md"）
	//   - 可能帶 type 前綴（"agents/typescript-reviewer"）
	// 統一取純檔名，並同時加入有 .md 和無 .md 兩種形式，確保後續比對不漏
	const aiRecommendedRaw = aiRec?.recommended || [];
	const aiRecommended = new Set();
	for (const name of aiRecommendedRaw) {
		// 去掉可能的 type 前綴（commands/、agents/、rules/）
		const basename = name.includes("/") ? name.split("/").pop() : name;
		aiRecommended.add(basename);
		aiRecommended.add(basename.endsWith(".md") ? basename : `${basename}.md`);
		aiRecommended.add(basename.replace(/\.md$/, ""));
	}
	const _aiCount = aiRecommendedRaw.length;

	// 按類型統計 AI 推薦
	const aiByType = { commands: [], agents: [], rules: [] };
	const restByType = { commands: [], agents: [], rules: [] };
	const typeLabels = { commands: "Commands", agents: "Agents", rules: "Rules" };
	const typePrefixes = { commands: "/", agents: "@", rules: "" };

	for (const type of ["commands", "agents", "rules"]) {
		for (const item of allFilteredItems[type]) {
			if (aiRecommended.has(item.name)) {
				aiByType[type].push(item);
			} else {
				restByType[type].push(item);
			}
		}
	}

	// 顯示 AI 推薦摘要（每個 item 帶完整描述）
	const aiTotal =
		aiByType.commands.length + aiByType.agents.length + aiByType.rules.length;
	if (aiTotal > 0) {
		const previewLines = [];
		for (const type of ["commands", "agents", "rules"]) {
			if (!aiByType[type].length) continue;
			previewLines.push(typeLabels[type]);
			for (const item of aiByType[type]) {
				const desc = extractDesc(item.content, item.name, type);
				const prefix = typePrefixes[type];
				previewLines.push(
					`  ${prefix}${item.name.replace(".md", "")}  ${desc}`,
				);
			}
		}
		const restCount = totalEcc - aiTotal;
		p.log.info(
			`🤖 AI 推薦 ${aiTotal} 個 ECC（另有 ${restCount} 個可選）：\n${previewLines.join("\n")}`,
		);
	} else {
		p.log.info(`🔗 ECC 匹配 ${totalEcc} 個（AI 未推薦，需手動選擇）`);
	}

	// 選擇操作
	const options = [];
	if (aiTotal > 0) {
		options.push({
			value: "ai",
			label: `✅ 安裝 AI 推薦 (${aiTotal})`,
			hint: "推薦",
		});
		options.push({
			value: "ai-edit",
			label: `🤖 AI 推薦 + 調整`,
			hint: "在推薦基礎上增減",
		});
	}
	options.push({
		value: "browse",
		label: `📂 瀏覽全部 (${totalEcc})`,
		hint: "逐類型選擇",
	});
	options.push({ value: "skip", label: "⏭️ 跳過 ECC" });

	const action = handleCancel(
		await p.select({ message: "🔗 ECC 外部資源", options }),
	);

	if (action === "skip") return null;

	const selNames = { commands: new Set(), agents: new Set(), rules: new Set() };

	if (action === "ai") {
		// 直接用 AI 推薦
		for (const type of ["commands", "agents", "rules"]) {
			for (const item of aiByType[type]) selNames[type].add(item.name);
		}
	} else if (action === "ai-edit") {
		// AI 推薦為基礎，可增減
		for (const type of ["commands", "agents", "rules"]) {
			const items = allFilteredItems[type];
			if (!items.length) continue;
			const opts = items.map((item) => {
				const desc = extractDesc(item.content, item.name, type);
				const isAi = aiRecommended.has(item.name);
				const badge = isAi ? `${pc.cyan("*")} ` : "  ";
				return {
					value: item.name,
					label: `${badge}${typePrefixes[type]}${item.name.replace(".md", "")}  ${pc.dim(desc)}`,
				};
			});
			const initVals = aiByType[type].map((i) => i.name);
			const chosen = await multiselectWithAll({
				message: `${typeLabels[type]}（${items.length}）${pc.cyan(" * = AI 推薦")}`,
				options: opts,
				initialValues: initVals,
			});
			selNames[type] = new Set(chosen);
		}
	} else {
		// 瀏覽全部，無預選
		for (const type of ["commands", "agents", "rules"]) {
			const items = allFilteredItems[type];
			if (!items.length) continue;
			const opts = items.map((item) => {
				const desc = extractDesc(item.content, item.name, type);
				return {
					value: item.name,
					label: `${typePrefixes[type]}${item.name.replace(".md", "")}  ${pc.dim(desc)}`,
				};
			});
			const chosen = await multiselectWithAll({
				message: `${typeLabels[type]}（${items.length}）`,
				options: opts,
				initialValues: [],
			});
			selNames[type] = new Set(chosen);
		}
	}

	// 確認
	const total =
		selNames.commands.size + selNames.agents.size + selNames.rules.size;
	if (total === 0) return null;

	const parts = [];
	if (selNames.commands.size) parts.push(`${selNames.commands.size} cmd`);
	if (selNames.agents.size) parts.push(`${selNames.agents.size} agent`);
	if (selNames.rules.size) parts.push(`${selNames.rules.size} rule`);
	const ok = handleCancel(
		await p.confirm({
			message: `✅ 確認安裝 ${total} 個 ECC？（${parts.join(" + ")}）`,
			initialValue: true,
		}),
	);
	if (!ok)
		return selectEcc({
			eccFetchResult,
			existingNames,
			detectedSkills,
			allLangs,
			eccAiPromise: null,
		});

	return selNames;
}
