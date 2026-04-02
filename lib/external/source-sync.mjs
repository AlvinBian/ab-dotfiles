/**
 * 通用 Source 同步模組（含本地快取）
 *
 * 職責：
 *   從任意 GitHub repo 拉取 Claude Code 配置，根據技術棧篩選，按優先級合併。
 *
 * 快取策略：
 *   .cache/sources/{source-name}/
 *     .manifest.json  → { sha, timestamp, files: { commands: [...], agents: [...], rules: [...] } }
 *     commands/*.md
 *     agents/*.md
 *     rules/*.md
 *     hooks.json
 *
 *   判斷邏輯：
 *     1. 距上次同步 < CACHE_TTL → 直接用快取（零 API 請求）
 *     2. 距上次 ≥ CACHE_TTL → 查最新 commit SHA（1 個 API 請求）
 *        a. SHA 相同 → 更新 timestamp，用快取
 *        b. SHA 不同 → 重新下載
 *     3. 無快取 → 首次完整下載
 *
 * config.json sources 格式：
 *   "sources": [{
 *     "name": "everything-claude-code",
 *     "repo": "affaan-m/everything-claude-code",
 *     "paths": { "commands": "commands", "agents": "agents",
 *                "rules": "rules/{lang}", "rulesCommon": "rules/common",
 *                "hooks": "hooks/hooks.json" },
 *     "priority": 10
 *   }]
 */

import fs from "node:fs";
import path from "node:path";
import { uniq } from "lodash-es";
import { gh } from "./github.mjs";

// ── 常量 ──────────────────────────────────────────────────────────
const CACHE_TTL = 60 * 60 * 1000; // 1 小時（毫秒）
const BATCH_SIZE = 10; // 並行下載批次大小

// ── 技術棧 → 語言目錄映射 ────────────────────────────────────────
const TECH_TO_LANG = {
	typescript: "typescript",
	javascript: "typescript",
	vue: "typescript",
	vitest: "typescript",
	nuxt: "typescript",
	react: "typescript",
	nextjs: "typescript",
	angular: "typescript",
	svelte: "typescript",
	php: "php",
	laravel: "php",
	wordpress: "php",
	python: "python",
	django: "python",
	flask: "python",
	fastapi: "python",
	golang: "golang",
	go: "golang",
	rust: "rust",
	swift: "swift",
	kotlin: "kotlin",
	android: "kotlin",
	java: "java",
	spring: "java",
	cpp: "cpp",
	"c++": "cpp",
	csharp: "csharp",
	dotnet: "csharp",
	perl: "perl",
};
const LANG_PREFIXES = uniq(Object.values(TECH_TO_LANG))
	.map((l) => `${l}-`)
	.concat(["cpp-", "go-"]);

// ── 快取管理 ──────────────────────────────────────────────────────

/**
 * 取得 source 的快取目錄路徑
 * @param {string} cacheBase - 快取根目錄（.cache/sources/）
 * @param {string} sourceName - source 名稱
 */
function getCacheDir(cacheBase, sourceName) {
	return path.join(cacheBase, sourceName.replace(/[^a-zA-Z0-9_-]/g, "_"));
}

/**
 * 讀取快取 manifest
 * @returns {{ sha: string, timestamp: number, files: Object } | null}
 */
function readManifest(cacheDir) {
	const p = path.join(cacheDir, ".manifest.json");
	if (!fs.existsSync(p)) return null;
	try {
		return JSON.parse(fs.readFileSync(p, "utf8"));
	} catch {
		return null;
	}
}

/** 寫入快取 manifest */
function writeManifest(cacheDir, data) {
	fs.mkdirSync(cacheDir, { recursive: true });
	fs.writeFileSync(
		path.join(cacheDir, ".manifest.json"),
		JSON.stringify(data, null, 2),
		"utf8",
	);
}

/**
 * 檢查快取是否有效
 *
 * @param {string} cacheDir - 快取目錄
 * @param {string} repo - GitHub repo
 * @returns {Promise<'hit'|'stale'|'miss'>}
 *   - hit: TTL 內，直接用
 *   - stale: 超過 TTL 但 SHA 相同，更新 timestamp 後用
 *   - miss: 無快取或 SHA 不同，需重新下載
 */
async function checkCache(cacheDir, repo) {
	const manifest = readManifest(cacheDir);
	if (!manifest) return "miss";

	// TTL 內 → 直接命中
	const age = Date.now() - manifest.timestamp;
	if (age < CACHE_TTL) return "hit";

	// 超過 TTL → 查最新 SHA（1 個 API 請求）
	const latestSha = await gh(`repos/${repo}/commits?per_page=1`, ".[0].sha");
	if (latestSha && latestSha === manifest.sha) {
		// SHA 相同 → 更新 timestamp，視為命中
		manifest.timestamp = Date.now();
		writeManifest(cacheDir, manifest);
		return "stale"; // stale but valid
	}

	return "miss";
}

/**
 * 從快取讀取檔案內容
 * @returns {{ commands: Array, agents: Array, rules: Array, hooks: string|null }}
 */
function loadFromCache(cacheDir) {
	const result = { commands: [], agents: [], rules: [], hooks: null };

	for (const sub of ["commands", "agents", "rules"]) {
		const dir = path.join(cacheDir, sub);
		if (!fs.existsSync(dir)) continue;
		for (const f of fs
			.readdirSync(dir)
			.filter((f) => f.endsWith(".md") || f.endsWith(".json"))) {
			result[sub].push({
				name: f,
				content: fs.readFileSync(path.join(dir, f), "utf8"),
			});
		}
	}

	const hooksPath = path.join(cacheDir, "hooks.json");
	if (fs.existsSync(hooksPath))
		result.hooks = fs.readFileSync(hooksPath, "utf8");

	return result;
}

/**
 * 將下載的檔案存入快取目錄
 *
 * 先清除舊快取，再按 commands/agents/rules 子目錄寫入，
 * 最後寫入 manifest（含 sha 和 timestamp）。
 *
 * @param {string} cacheDir - 快取目錄路徑
 * @param {{ commands: Array, agents: Array, rules: Array, hooks: string|null }} downloaded - 已下載的內容
 * @param {string} sha - 最新 commit SHA
 * @returns {void}
 */
function saveToCache(cacheDir, downloaded, sha) {
	const tmpDir = `${cacheDir}.tmp`;
	// 清理可能殘留的 tmp
	if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
	fs.mkdirSync(tmpDir, { recursive: true });

	for (const sub of ["commands", "agents", "rules"]) {
		const dir = path.join(tmpDir, sub);
		fs.mkdirSync(dir, { recursive: true });
		for (const f of downloaded[sub] || []) {
			fs.writeFileSync(path.join(dir, f.name), f.content, "utf8");
		}
	}
	if (downloaded.hooks) {
		fs.writeFileSync(path.join(tmpDir, "hooks.json"), downloaded.hooks, "utf8");
	}

	writeManifest(tmpDir, { sha, timestamp: Date.now() });

	// 原子替換：tmp 完整後才動舊的
	if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true });
	fs.renameSync(tmpDir, cacheDir);
}

// ── GitHub API 工具 ──────────────────────────────────────────────

/**
 * 列出 GitHub repo 指定目錄中的所有檔案
 *
 * @param {string} repo - 'owner/repo' 格式
 * @param {string} dir - 目錄路徑（相對 repo 根目錄）
 * @returns {Promise<Array<{name: string, path: string}>>} 檔案列表，失敗返回空陣列
 */
async function listRepoDir(repo, dir) {
	const raw = await gh(
		`repos/${repo}/contents/${dir}`,
		'[.[] | select(.type=="file") | {name: .name, path: .path}]',
	);
	if (!raw) return [];
	try {
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

/**
 * 下載 GitHub repo 中的單一檔案（base64 解碼）
 *
 * @param {string} repo - 'owner/repo' 格式
 * @param {string} filePath - 相對 repo 根目錄的檔案路徑
 * @returns {Promise<string|null>} UTF-8 文字內容，失敗返回 null
 */
async function downloadFile(repo, filePath) {
	const b64 = await gh(`repos/${repo}/contents/${filePath}`, ".content");
	if (!b64) return null;
	return Buffer.from(b64.replace(/[\n\r\s]/g, ""), "base64").toString("utf8");
}

/**
 * 批次下載多個檔案（每批 BATCH_SIZE 個並行）
 *
 * @param {string} repo - 'owner/repo' 格式
 * @param {Array<{name: string, path: string}>} files - 要下載的檔案列表
 * @returns {Promise<Array<{name: string, content: string}>>} 成功下載的檔案陣列
 */
async function batchDownload(repo, files) {
	const results = [];
	for (let i = 0; i < files.length; i += BATCH_SIZE) {
		const batch = files.slice(i, i + BATCH_SIZE);
		const settled = await Promise.allSettled(
			batch.map(async (f) => {
				const content = await downloadFile(repo, f.path);
				return content ? { name: f.name, content } : null;
			}),
		);
		for (const r of settled) {
			if (r.status === "fulfilled" && r.value) results.push(r.value);
		}
	}
	return results;
}

// ── 索引 + 過濾 ──────────────────────────────────────────────────

/**
 * 掃描 source 的完整目錄索引（commands/agents/rules）
 *
 * 根據 techStacks 決定要拉哪些 rules/{lang}/ 子目錄，
 * 並行請求所有目錄列表後合併成統一索引。
 *
 * @param {{ repo: string, paths: Object }} source - source 配置物件
 * @param {string[]} techStacks - 已偵測的技術棧 ID 列表（用於篩選語言規則）
 * @returns {Promise<{ commands: Array, agents: Array, rules: Array, hooksPath: string|null }>} 完整索引
 */
async function fetchIndex(source, techStacks) {
	const { repo, paths } = source;
	const matchedLangs = new Set();
	for (const t of techStacks) {
		const lang = TECH_TO_LANG[t.toLowerCase()];
		if (lang) matchedLangs.add(lang);
	}

	const requests = [];
	if (paths.commands)
		requests.push(
			listRepoDir(repo, paths.commands).then((f) => ({
				type: "commands",
				files: f,
			})),
		);
	if (paths.agents)
		requests.push(
			listRepoDir(repo, paths.agents).then((f) => ({
				type: "agents",
				files: f,
			})),
		);
	if (paths.rulesCommon)
		requests.push(
			listRepoDir(repo, paths.rulesCommon).then((f) => ({
				type: "rules",
				files: f.map((x) => ({ ...x, lang: "common" })),
			})),
		);
	if (paths.rules?.includes("{lang}")) {
		for (const lang of matchedLangs) {
			const dir = paths.rules.replace("{lang}", lang);
			requests.push(
				listRepoDir(repo, dir).then((f) => ({
					type: "rules",
					files: f.map((x) => ({ ...x, lang })),
				})),
			);
		}
	}

	const results = await Promise.allSettled(requests);
	const index = {
		commands: [],
		agents: [],
		rules: [],
		hooksPath: paths.hooks || null,
	};
	for (const r of results) {
		if (r.status !== "fulfilled" || !r.value) continue;
		const v = r.value;
		if (v.type === "commands") index.commands.push(...v.files);
		else if (v.type === "agents") index.agents.push(...v.files);
		else if (v.type === "rules") index.rules.push(...v.files);
	}
	return index;
}

/**
 * 按技術棧和已安裝名稱過濾索引中的檔案
 *
 * 排除已存在於本地的同名檔案，並過濾不屬於當前技術棧的語言規則
 * （例如 `php-xxx.md` 只在技術棧含 php 時才納入）。
 *
 * @param {{ commands: Array, agents: Array, rules: Array }} index - fetchIndex 返回的索引
 * @param {string[]} techStacks - 已偵測的技術棧 ID 列表
 * @param {Set<string>} existingNames - 本地已有的檔案名稱集合
 * @returns {{ commands: Array, agents: Array, rules: Array }} 過濾後的索引
 */
export function filterItems(index, techStacks, existingNames) {
	const matchedLangs = new Set();
	for (const t of techStacks) {
		const lang = TECH_TO_LANG[t.toLowerCase()];
		if (lang) matchedLangs.add(lang);
	}
	function isLangMatch(name) {
		for (const pf of LANG_PREFIXES) {
			if (name.startsWith(pf)) return matchedLangs.has(pf.replace(/-$/, ""));
		}
		return true;
	}
	return {
		commands: index.commands.filter(
			(f) =>
				!existingNames.has(f.name) && isLangMatch(f.name.replace(/\.md$/, "")),
		),
		agents: index.agents.filter(
			(f) =>
				!existingNames.has(f.name) && isLangMatch(f.name.replace(/\.md$/, "")),
		),
		rules: index.rules.filter((f) => !existingNames.has(f.name)),
	};
}

// ── 主入口（兩步式：取得全量 → 按選擇寫入）─────────────────────

/**
 * 步驟 1：取得所有 sources 的全量內容（含快取）
 *
 * 不做篩選，返回每個 source 的完整 commands/agents/rules 列表。
 * 用於後續 AI 精選和用戶確認。
 *
 * @param {Array} sources - config.json 的 sources
 * @param {string[]} techStacks - 用戶選擇的技術棧（用於索引哪些 rules/{lang}/）
 * @param {string} localDir - ab-dotfiles 專案根目錄
 * @param {Function} onProgress - (sourceName, status, detail?) => void
 * @returns {Promise<Object>} { sources: [{ name, repo, version, cached, allFiles, localNames }] }
 */
export async function fetchAllSources(
	sources,
	techStacks,
	localDir,
	onProgress = () => {},
) {
	const sorted = [...sources].sort(
		(a, b) => (b.priority || 0) - (a.priority || 0),
	);
	const cacheBase = path.join(localDir, ".cache", "sources");

	// 本地已有的檔案
	const localNames = new Set();
	for (const sub of ["commands", "agents", "rules"]) {
		const dir = path.join(localDir, "claude", sub);
		if (fs.existsSync(dir)) {
			for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md")))
				localNames.add(f);
		}
	}

	const results = await Promise.all(
		sorted.map(async (source) => {
			const cacheDir = getCacheDir(cacheBase, source.name);
			let allFiles,
				sha,
				isLocal = false;

			// 優先讀本地 ecc/ 目錄（GitHub Actions 自動同步，零 API 呼叫）
			const localEccDir = path.join(localDir, "ecc", source.name);
			if (fs.existsSync(localEccDir)) {
				onProgress(source.name, "local");
				allFiles = loadFromCache(localEccDir);
				const versionFile = path.join(localEccDir, ".version.json");
				try {
					sha = JSON.parse(fs.readFileSync(versionFile, "utf8")).sha;
				} catch {
					sha = "local";
				}
				isLocal = true;
				onProgress(source.name, "done");
			} else {
				// Fallback: GitHub API + 快取
				onProgress(source.name, "checking");
				const cacheStatus = await checkCache(cacheDir, source.repo);

				if (cacheStatus === "hit" || cacheStatus === "stale") {
					onProgress(
						source.name,
						"cached",
						cacheStatus === "hit" ? "TTL 內" : "SHA 未變",
					);
					allFiles = loadFromCache(cacheDir);
					sha = readManifest(cacheDir)?.sha || "cached";
				} else {
					onProgress(source.name, "indexing");
					const index = await fetchIndex(source, techStacks);

					onProgress(source.name, "downloading");
					const [commands, agents, rules] = await Promise.all([
						batchDownload(source.repo, index.commands),
						batchDownload(source.repo, index.agents),
						batchDownload(source.repo, index.rules),
					]);
					let hooks = null;
					if (index.hooksPath)
						hooks = await downloadFile(source.repo, index.hooksPath);

					allFiles = { commands, agents, rules, hooks };
					sha =
						(await gh(`repos/${source.repo}/commits?per_page=1`, ".[0].sha")) ||
						"unknown";
					saveToCache(cacheDir, allFiles, sha);
					onProgress(source.name, "saved");
				}
			}

			onProgress(source.name, "done");

			return {
				name: source.name,
				repo: source.repo,
				version: typeof sha === "string" ? sha.slice(0, 8) : "local",
				cached: isLocal || !!readManifest(cacheDir),
				allFiles,
			};
		}),
	);

	return { sources: results, localNames };
}

/**
 * 步驟 2：按用戶選擇的列表生成最終結果
 *
 * @param {Object} fetched - fetchAllSources 回傳值
 * @param {Object} selectedNames - 用戶確認的列表 { commands: Set, agents: Set, rules: Set }
 * @returns {Object} { results, downloaded }
 */
export function buildSyncResult(fetched, selectedNames) {
	const allResults = [];
	const allDownloaded = [];

	for (const src of fetched.sources) {
		const finalCommands = src.allFiles.commands.filter((f) =>
			selectedNames.commands.has(f.name),
		);
		const finalAgents = src.allFiles.agents.filter((f) =>
			selectedNames.agents.has(f.name),
		);
		const finalRules = src.allFiles.rules.filter((f) =>
			selectedNames.rules.has(f.name),
		);
		const finalHooks =
			!fetched.localNames.has("hooks.json") && src.allFiles.hooks
				? src.allFiles.hooks
				: null;

		const skippedCmds = src.allFiles.commands
			.filter((f) => !selectedNames.commands.has(f.name))
			.map((f) => f.name);
		const skippedAgents = src.allFiles.agents
			.filter((f) => !selectedNames.agents.has(f.name))
			.map((f) => f.name);
		const skippedRules = src.allFiles.rules
			.filter((f) => !selectedNames.rules.has(f.name))
			.map((f) => f.name);

		allResults.push({
			source: src.name,
			repo: src.repo,
			version: src.version,
			cached: src.cached,
			added: {
				commands: finalCommands.map((f) => f.name),
				agents: finalAgents.map((f) => f.name),
				rules: finalRules.map((f) => f.name),
			},
			skipped: {
				commands: skippedCmds,
				agents: skippedAgents,
				rules: skippedRules,
			},
			hooks: finalHooks ? "merged" : src.allFiles.hooks ? "skipped" : null,
		});
		allDownloaded.push({
			source: src.name,
			commands: finalCommands,
			agents: finalAgents,
			rules: finalRules,
			hooks: finalHooks,
		});
	}

	// ECC type map：name → type（供 plan 展示分類用）
	const eccTypeMap = {};
	for (const src of allDownloaded) {
		for (const f of src.commands)
			eccTypeMap[f.name.replace(".md", "")] = "commands";
		for (const f of src.agents)
			eccTypeMap[f.name.replace(".md", "")] = "agents";
		for (const f of src.rules) eccTypeMap[f.name.replace(".md", "")] = "rules";
	}

	return {
		results: allResults,
		downloaded: allDownloaded,
		eccTypeMap,
		timestamp: new Date().toISOString(),
	};
}

/**
 * 將融合結果寫入目標目錄（commands/agents/rules/hooks.json）
 *
 * 自動建立必要子目錄，按 commands/agents/rules 分類寫入，
 * hooks.json 若存在則寫入目標根目錄。
 *
 * @param {Array<{ source: string, commands: Array, agents: Array, rules: Array, hooks: string|null }>} downloaded - buildSyncResult 回傳的 downloaded 陣列
 * @param {string} targetDir - 目標目錄絕對路徑（通常為 ~/.claude/）
 * @returns {Promise<void>}
 */
const GENERATED_MARKER = "<!-- generated by ab-dotfiles -->\n";

/**
 * 判斷檔案是否為用戶自訂（存在且不含 GENERATED_MARKER）
 */
function isUserCustomized(filePath) {
	if (!fs.existsSync(filePath)) return false;
	const content = fs.readFileSync(filePath, "utf8");
	return !content.startsWith(GENERATED_MARKER);
}

export async function writeSyncedFiles(downloaded, targetDir) {
	for (const sub of ["commands", "agents", "rules"]) {
		fs.mkdirSync(path.join(targetDir, sub), { recursive: true });
	}
	const skipped = [];
	const written = []; // 記錄已寫入的檔案，用於失敗時 rollback
	try {
		for (const src of downloaded) {
			for (const f of src.commands) {
				const dest = path.join(targetDir, "commands", f.name);
				if (isUserCustomized(dest)) {
					skipped.push(`commands/${f.name}`);
					continue;
				}
				fs.writeFileSync(dest, GENERATED_MARKER + f.content, "utf8");
				written.push(dest);
			}
			for (const f of src.agents) {
				const dest = path.join(targetDir, "agents", f.name);
				if (isUserCustomized(dest)) {
					skipped.push(`agents/${f.name}`);
					continue;
				}
				fs.writeFileSync(dest, GENERATED_MARKER + f.content, "utf8");
				written.push(dest);
			}
			for (const f of src.rules) {
				const dest = path.join(targetDir, "rules", f.name);
				if (isUserCustomized(dest)) {
					skipped.push(`rules/${f.name}`);
					continue;
				}
				fs.writeFileSync(dest, GENERATED_MARKER + f.content, "utf8");
				written.push(dest);
			}
			if (src.hooks)
				fs.writeFileSync(path.join(targetDir, "hooks.json"), src.hooks, "utf8");
		}
	} catch (err) {
		// Rollback: 移除本次已寫入的檔案（僅移除 ab-dotfiles 生成的，用戶自訂的已被跳過）
		for (const p of written) {
			try {
				fs.rmSync(p, { force: true });
			} catch {
				/* best-effort */
			}
		}
		throw err;
	}
	return skipped;
}
