/**
 * 檔案系統工具集
 *
 * 職責：提供常用的 fs 操作封裝，減少重複代碼。
 */

import fs from "node:fs";
import path from "node:path";

/**
 * 安全讀取目錄，不存在時回空陣列
 *
 * @param {string} dir - 目錄路徑
 * @param {object} options - fs.readdirSync 選項
 * @returns {array} 目錄項目陣列，或空陣列
 */
export function safeReadDir(dir, options = {}) {
	try {
		return fs.readdirSync(dir, options);
	} catch {
		return [];
	}
}

/**
 * 遞歸計算目錄大小 (bytes)
 *
 * @param {string} dir - 目錄路徑
 * @returns {number} 目錄大小（bytes）
 */
export function dirSize(dir) {
	if (!fs.existsSync(dir)) return 0;

	let size = 0;
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			size += dirSize(fullPath);
		} else {
			const stat = fs.statSync(fullPath);
			size += stat.size;
		}
	}

	return size;
}

/**
 * 列出目錄下所有 .md 檔案名（不含 .md 副檔名）
 *
 * @param {string} dir - 目錄路徑
 * @returns {array} 檔名陣列（不含 .md），若目錄不存在回空陣列
 */
export function listMdFiles(dir) {
	const entries = safeReadDir(dir);
	return entries
		.filter((name) => name.endsWith(".md"))
		.map((name) => name.replace(/\.md$/, ""));
}

/**
 * 確保目錄存在
 *
 * @param {string} dir - 目錄路徑
 * @returns {void}
 */
export function ensureDir(dir) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}
