/**
 * 檔案發現工具 — 掃描目錄中的可安裝項目
 */

import fs from "node:fs";
import path from "node:path";

/**
 * 自動發現目錄中的可安裝項目
 *
 * 掃描指定目錄，為每個檔案提取 label 和 hint：
 * - .md 檔案：從 YAML frontmatter 的 description 欄位取 hint
 * - .zsh 檔案：從首行 # ── ... ── 註解取 hint
 *
 * @param {string} repoDir - 專案根目錄絕對路徑
 * @param {string} dir - 相對於 repoDir 的目錄路徑
 * @param {string} [ext='.md'] - 檔案副檔名
 * @param {string[]|null} [filter=null] - 白名單（null = 不過濾）
 * @returns {Array<{value: string, label: string, hint: string}>}
 */
export function discoverItems(repoDir, dir, ext = ".md", filter = null) {
	const fullDir = path.join(repoDir, dir);
	if (!fs.existsSync(fullDir)) return [];
	let files = fs.readdirSync(fullDir).filter((f) => f.endsWith(ext));
	if (filter) {
		const allowed = new Set(filter);
		files = files.filter((f) => allowed.has(f.slice(0, -ext.length)));
	}
	return files.map((f) => {
		const name = f.slice(0, -ext.length);
		const content = fs.readFileSync(path.join(fullDir, f), "utf8");
		let hint = name;
		if (ext === ".md") {
			// 從 YAML frontmatter 的 description 欄位提取摘要，支援 folded scalar（>）格式
			const m = content.match(/^description:\s*>?\s*\n?\s*(.+)/m);
			// 只取第一句（以句號或全形句點分割），避免過長
			if (m) hint = m[1].trim().split(/[。.]/)[0];
		} else {
			// 從 .zsh 檔首行的裝飾性分隔線 `# ── 說明 ──` 提取描述
			const m = content.match(/^#\s*──\s*(.+?)(?:\s*─|$)/m);
			if (m) hint = m[1].trim();
		}
		const label =
			ext === ".zsh"
				? name
				: ext === ".md" && dir.includes("agents")
					? `@${name}`
					: `/${name}`;
		return { value: name, label, hint };
	});
}

/**
 * 從 .md frontmatter 提取 matchWhen 條件
 *
 * @param {string} repoDir - 專案根目錄
 * @param {string} dir - 相對目錄
 * @param {string} name - 檔案名（不含副檔名）
 * @returns {Object|null} matchWhen 物件
 */
export function extractMatchWhen(repoDir, dir, name) {
	const filePath = path.join(repoDir, dir, `${name}.md`);
	if (!fs.existsSync(filePath)) return null;
	const content = fs.readFileSync(filePath, "utf8");
	// 擷取 YAML frontmatter 區塊（--- 開頭到 --- 結尾之間的內容）
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (!fmMatch) return null;

	const fm = fmMatch[1];
	// 簡易 YAML 解析：擷取 matchWhen 區塊（縮排 2 格以上的行）
	const mwMatch = fm.match(/matchWhen:\n((?:\s{2,}.+\n?)*)/);
	if (!mwMatch) {
		// 單行格式：matchWhen 內含 always: true
		if (fm.includes("always: true")) return { always: true };
		return null;
	}

	const result = {};
	const lines = mwMatch[1].split("\n").filter(Boolean);
	for (const line of lines) {
		const kv = line.trim().match(/^(\w+):\s*(.+)/);
		if (!kv) continue;
		const [, key, val] = kv;
		if (val.startsWith("[")) {
			try {
				result[key] = JSON.parse(val.replace(/'/g, '"'));
			} catch {
				result[key] = val;
			}
		} else if (val === "true") {
			result[key] = true;
		} else {
			result[key] = val;
		}
	}
	return Object.keys(result).length > 0 ? result : null;
}

/**
 * 計算 names 中有多少個在目錄裡實際存在對應檔案
 *
 * 用於驗證 session 中保存的選擇是否仍然有效。
 *
 * @param {string} repoDir - 專案根目錄絕對路徑
 * @param {string} dir - 相對於 repoDir 的目錄路徑
 * @param {string[]} names - 要確認的檔案名稱列表（不含副檔名）
 * @param {string} [ext='.md'] - 副檔名
 * @returns {number} 實際存在的檔案數量
 */
export function countExisting(repoDir, dir, names, ext = ".md") {
	try {
		const files = new Set(
			fs
				.readdirSync(path.join(repoDir, dir))
				.filter((f) => f.endsWith(ext))
				.map((f) => f.slice(0, -ext.length)),
		);
		return names.filter((n) => files.has(n)).length;
	} catch {
		return 0;
	}
}

/**
 * 計算目錄中指定副檔名的檔案總數量
 *
 * 目錄不存在時返回 0（不拋出錯誤）。
 *
 * @param {string} repoDir - 專案根目錄絕對路徑
 * @param {string} dir - 相對於 repoDir 的目錄路徑
 * @param {string} [ext='.md'] - 副檔名
 * @returns {number} 符合副檔名的檔案數量
 */
export function countFiles(repoDir, dir, ext = ".md") {
	try {
		return fs
			.readdirSync(path.join(repoDir, dir))
			.filter((f) => f.endsWith(ext)).length;
	} catch {
		return 0;
	}
}
