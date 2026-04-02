/**
 * Plugin manifest 版本追蹤
 *
 * 職責：
 *   為打包的 .plugin 檔案生成版本資訊和完整性校驗碼，
 *   寫入 dist/release/manifest.json 供安裝驗證使用。
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * 生成 plugin manifest
 *
 * 從 package.json 讀取版本號，計算 release/ 目錄中所有 .plugin 檔案的 SHA256 校驗碼。
 *
 * @param {string} distDir - dist/ 目錄絕對路徑
 * @param {Object} contents - 安裝內容統計
 * @param {number} contents.commands - commands 數量
 * @param {number} contents.agents - agents 數量
 * @param {number} contents.rules - rules 數量
 * @param {number} contents.hooks - hooks 數量
 * @param {number} contents.stacks - stacks 數量
 * @returns {Object} manifest 物件（含 version、buildTime、contents、checksum）
 */
export function generateManifest(distDir, contents) {
	const pkg = JSON.parse(
		fs.readFileSync(path.resolve(distDir, "..", "package.json"), "utf8"),
	);

	const manifest = {
		version: pkg.version || "0.0.0",
		buildTime: new Date().toISOString(),
		contents,
		checksum: null,
	};

	// 計算 release 目錄的 checksum
	const releaseDir = path.join(distDir, "release");
	if (fs.existsSync(releaseDir)) {
		const hash = createHash("sha256");
		const files = fs
			.readdirSync(releaseDir)
			.filter((f) => f.endsWith(".plugin"))
			.sort();
		for (const f of files) {
			hash.update(fs.readFileSync(path.join(releaseDir, f)));
		}
		manifest.checksum = `sha256:${hash.digest("hex").slice(0, 16)}`;
	}

	return manifest;
}

/**
 * 寫入 manifest.json 到 dist/release/ 目錄
 *
 * @param {Object} manifest - generateManifest 回傳的 manifest 物件
 * @param {string} distDir - dist/ 目錄絕對路徑
 * @returns {string} 寫入的 manifest.json 絕對路徑
 */
export function saveManifest(manifest, distDir) {
	const releaseDir = path.join(distDir, "release");
	fs.mkdirSync(releaseDir, { recursive: true });
	const manifestPath = path.join(releaseDir, "manifest.json");
	fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	return manifestPath;
}
