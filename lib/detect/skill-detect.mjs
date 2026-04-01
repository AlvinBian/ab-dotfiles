/**
 * 全自動技術棧偵測引擎
 *
 * 偵測策略：
 *   1. GitHub API → default_branch + languages + 根目錄掃描
 *   2. 配置檔深度分析 → package.json / composer.json / go.mod 等
 *   3. stacks/detect.json per stack (auto-scanned)
 *   4. npm registry → 未知 dep 自動分類（按 keywords/description）
 *
 * stacks/ 目錄由 `pnpm run scan` 自動生成，無需手動維護
 */

import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import { getDirname } from "../core/paths.mjs";
import {
	classifyRepoFiles,
	fetchFilesBatch,
	fetchRepoBundle,
	gh,
	ghSync,
	scanDir,
} from "../external/github.mjs";

const __dirname = getDirname(import.meta);
export const REPO_DIR = path.resolve(__dirname, "../..");
export const STACKS_DIR = path.join(REPO_DIR, ".cache", "stacks");

/**
 * 自動掃描 .cache/stacks/ 目錄，載入所有技術棧的 detect.json 構建 registry
 *
 * 每個子目錄若含有 detect.json 就視為一個技術棧定義，
 * 按 priority 欄位升序排列（數字越小越優先）。
 *
 * @returns {{ skills: Array<Object> }} 技術棧定義陣列，按優先級排序
 */
let _registryCache = null;

export function loadRegistry() {
	if (_registryCache) return _registryCache;

	const skills = [];
	if (!fs.existsSync(STACKS_DIR)) {
		_registryCache = { skills };
		return _registryCache;
	}

	for (const dir of fs.readdirSync(STACKS_DIR, { withFileTypes: true })) {
		if (!dir.isDirectory()) continue;
		const detectPath = path.join(STACKS_DIR, dir.name, "detect.json");
		if (!fs.existsSync(detectPath)) continue;
		try {
			const def = JSON.parse(fs.readFileSync(detectPath, "utf8"));
			def.id = def.id || dir.name;
			skills.push(def);
		} catch {
			/* detect.json 格式錯誤則略過此技能 */
		}
	}

	skills.sort((a, b) => (a.priority || 99) - (b.priority || 99));
	_registryCache = { skills };
	return _registryCache;
}

/**
 * 解析 config.json 中的 repo 設定項
 *
 * 支援字串（純 repo 名稱）或物件格式（含額外屬性）。
 *
 * @param {string|Object} entry - 字串為 'owner/repo'，物件含 repo 欄位
 * @returns {{ repo: string, [key: string]: any }} 統一的 repo 設定物件
 */
export function parseRepoEntry(entry) {
	if (typeof entry === "string") return { repo: entry };
	return entry;
}

/**
 * 全自動 repo 分析（GraphQL 批次優先，REST fallback）
 *
 * 兩輪 GraphQL 策略：
 *   第 1 輪：取 branch + languages + 根目錄結構
 *   第 2 輪：批次抓取分類後的所有配置檔案（1 次請求）
 * Monorepo 時額外掃描子包 package.json。
 *
 * @param {string} repoName - 'owner/repo' 格式
 * @returns {Promise<Object>} 包含 repo/branch/rootFiles/languages/skills/description/stars/topics/context 的結果物件
 */
export async function analyzeRepo(repoName) {
	const result = {
		repo: repoName,
		branch: null,
		rootFiles: [],
		languages: {},
		skills: [],
		description: "",
		stars: 0,
		topics: [],
		context: { aiConfig: {}, docs: {}, techFiles: {}, lintConfig: {} },
	};

	const [owner, name] = repoName.split("/");

	// ── 第 1 輪：GraphQL 一次取得 branch + languages + 根目錄 + 已知檔案 ──
	// 先用空 filePaths 取得根目錄，分類後再用第 2 輪取檔案
	const bundle = await fetchRepoBundle(owner, name, []);
	if (!bundle) return result;

	result.branch = bundle.branch;
	result.languages = bundle.languages;
	result.description = bundle.description;
	result.stars = bundle.stars;
	result.topics = bundle.topics;
	result.rootFiles = bundle.rootEntries.map((e) => e.name);

	const classified = classifyRepoFiles(bundle.rootEntries);
	const allFilePaths = [
		...classified.techDetect,
		...classified.lintConfig,
		...classified.aiConfig,
		...classified.projectDocs,
	];

	// ── 第 2 輪：GraphQL 批次抓取所有分類檔案（1 次請求）──
	const fileContents =
		allFilePaths.length > 0
			? await fetchFilesBatch(owner, name, result.branch, allFilePaths)
			: {};

	// 分配到各 context
	for (const f of classified.techDetect) {
		if (fileContents[f]) result.context.techFiles[f] = fileContents[f];
	}
	for (const f of classified.lintConfig) {
		if (fileContents[f]) result.context.lintConfig[f] = fileContents[f];
	}
	for (const f of classified.aiConfig) {
		if (fileContents[f]) result.context.aiConfig[f] = fileContents[f];
	}
	for (const f of classified.projectDocs) {
		if (!fileContents[f]) continue;
		const lines = fileContents[f].split("\n");
		result.context.docs[f] =
			lines.length > 100
				? `${lines.slice(0, 100).join("\n")}\n...(truncated)`
				: fileContents[f];
	}

	// ── Monorepo：若有 turbo.json / pnpm-workspace.yaml / lerna.json ──
	const isMonorepo = result.rootFiles.some((f) =>
		/^(turbo\.json|pnpm-workspace\.yaml|lerna\.json)$/.test(f),
	);
	if (isMonorepo) {
		const workspaceDirs = [
			"packages",
			"apps",
			"modules",
			"plugins",
			"services",
		];
		const existingDirs = bundle.rootEntries
			.filter((e) => e.type === "dir" && workspaceDirs.includes(e.name))
			.map((e) => e.name);

		// 列出各 workspace 子目錄（並行 REST，GraphQL 不支援動態 tree 遍歷）
		const dirListings = await Promise.allSettled(
			existingDirs.map((dir) =>
				gh(`repos/${repoName}/contents/${dir}?ref=${result.branch}`).then(
					(raw) => {
						if (!raw) return [];
						return JSON.parse(raw)
							.filter((e) => e.type === "dir")
							.map((e) => `${dir}/${e.name}`);
					},
				),
			),
		);
		const subPkgDirs = dirListings.flatMap((r) =>
			r.status === "fulfilled" ? r.value : [],
		);

		// 批次抓取子包 package.json（1 次 GraphQL）
		if (subPkgDirs.length > 0) {
			const pkgPaths = subPkgDirs.map((d) => `${d}/package.json`);
			const pkgFiles = await fetchFilesBatch(
				owner,
				name,
				result.branch,
				pkgPaths,
			);
			for (const [fp, content] of Object.entries(pkgFiles)) {
				result.context.techFiles[fp] = content;
			}
		}
	}

	// 偵測技能
	const { deps, devDeps } = extractDeps(result.context.techFiles);
	result.skills = detectSkills({
		deps,
		devDeps,
		rootFiles: result.rootFiles,
		languages: result.languages,
	});

	// 並行遞迴掃描目錄
	await Promise.allSettled(
		classified.directories.map((dir) =>
			scanDir(repoName, result.branch, dir, result.context.aiConfig),
		),
	);

	return result;
}

/**
 * 從各語言配置檔提取依賴清單
 *
 * 支援 package.json（Node）、composer.json（PHP）、go.mod（Go）、
 * pyproject.toml（Python）等格式。
 *
 * @param {Object} techFiles - 檔案名 → 內容的映射（例如 { 'package.json': '...' }）
 * @returns {{ deps: Object, devDeps: Object }} 正式依賴與開發依賴的名稱→版本映射
 */
export function extractDeps(techFiles) {
	const deps = {},
		devDeps = {};
	for (const [name, content] of Object.entries(techFiles)) {
		try {
			const d = JSON.parse(content);
			// 根目錄或子包的 package.json（packages/xxx/package.json）
			if (name.endsWith("package.json")) {
				Object.assign(deps, d.dependencies || {});
				Object.assign(devDeps, d.devDependencies || {});
			}
			if (name.endsWith("composer.json")) {
				Object.assign(deps, d.require || {});
				Object.assign(devDeps, d["require-dev"] || {});
			}
		} catch {
			/* JSON 解析失敗則略過此依賴檔 */
		}
		// go.mod
		if (name.endsWith("go.mod")) {
			for (const m of content.matchAll(/^\t(\S+)\s+v([\d.]+)/gm))
				deps[m[1]] = m[2];
		}
		// pyproject.toml
		if (name.endsWith("pyproject.toml")) {
			for (const m of content.matchAll(/"([a-zA-Z][\w-]*)(?:[><=!~].*)?"/g))
				deps[m[1].toLowerCase()] = "*";
		}
	}
	return { deps, devDeps };
}

/**
 * 多策略技能偵測（基於 stacks/{skill}/detect.json registry）
 *
 * 對 registry 中每個技術棧，按其 detect 設定檢查以下條件：
 *   - deps / devDeps：依賴名稱比對
 *   - files：根目錄檔案存在性（支援 * 萬用字元）
 *   - languages：GitHub 語言分佈比對
 *   - semver：依賴版本範圍比對
 * 匹配到的技術棧若設有 excludes，會排除優先級較低的競爭項目。
 *
 * @param {Object} opts
 * @param {Object} [opts.deps={}] - 正式依賴 name → version
 * @param {Object} [opts.devDeps={}] - 開發依賴 name → version
 * @param {string[]} [opts.rootFiles=[]] - repo 根目錄的檔案名列表
 * @param {Object} [opts.languages={}] - GitHub 語言分佈 { TypeScript: bytes, ... }
 * @returns {string[]} 偵測到的技術棧 ID 陣列（按優先級排序）
 */
export function detectSkills({
	deps = {},
	devDeps = {},
	rootFiles = [],
	languages = {},
}) {
	const registry = loadRegistry();
	if (registry.skills.length === 0) return [];

	const depKeys = new Set(Object.keys(deps).filter(Boolean));
	const devDepKeys = new Set(Object.keys(devDeps).filter(Boolean));
	const fileSet = new Set(rootFiles);
	const langSet = new Set(Object.keys(languages));

	const matched = [];
	const excluded = new Set();

	for (const skill of registry.skills) {
		if (excluded.has(skill.id)) continue;
		const checks = [];

		if (skill.detect.deps)
			checks.push(skill.detect.deps.some((d) => depKeys.has(d)));
		if (skill.detect.devDeps)
			checks.push(
				skill.detect.devDeps.some((d) => devDepKeys.has(d) || depKeys.has(d)),
			);
		if (skill.detect.files) {
			checks.push(
				skill.detect.files.some((p) =>
					p.includes("*")
						? rootFiles.some((f) => f.endsWith(p.replace("*", "")))
						: fileSet.has(p),
				),
			);
		}
		if (skill.detect.languages)
			checks.push(skill.detect.languages.some((l) => langSet.has(l)));
		if (skill.detect.semver) {
			checks.push(
				Object.entries(skill.detect.semver).some(([pkg, range]) => {
					const ver = deps[pkg] || devDeps[pkg];
					if (!ver) return false;
					const clean = semver.coerce(ver);
					return clean ? semver.satisfies(clean, range) : false;
				}),
			);
		}

		const hit =
			(skill.detect.match || "any") === "all"
				? checks.length > 0 && checks.every(Boolean)
				: checks.some(Boolean);

		if (hit) {
			matched.push(skill);
			if (skill.excludes) {
				for (const e of skill.excludes) excluded.add(e);
			}
		}
	}

	matched.sort((a, b) => (a.priority || 99) - (b.priority || 99));
	return matched.map((s) => s.id);
}

/**
 * 合併技能片段到基礎 Markdown 檔案
 *
 * 從 .cache/stacks/{id}/{fragmentName} 讀取各技術棧的片段內容，
 * 插入到基礎檔案的特定位置（## 輸出格式 或 ## Step 3 之前）。
 * 若找不到插入點，則附加到檔案末尾。
 *
 * @param {string} baseContent - 基礎 Markdown 檔案的完整內容
 * @param {string[]} skillIds - 已偵測到的技術棧 ID 列表
 * @param {string} fragmentName - 片段檔名（例如 'code-review.md', 'test-gen.md'）
 * @returns {string} 合併後的完整 Markdown 內容
 */
export function mergeSkillFragments(baseContent, skillIds, fragmentName) {
	const fragments = [];
	for (const id of skillIds) {
		const p = path.join(STACKS_DIR, id, fragmentName);
		if (fs.existsSync(p)) fragments.push(fs.readFileSync(p, "utf8").trim());
	}
	if (fragments.length === 0) return baseContent;

	const markers = ["## 輸出格式", "## Step 3"];
	let idx = -1;
	for (const m of markers) {
		idx = baseContent.indexOf(m);
		if (idx > 0) break;
	}

	const joined = `\n\n${fragments.join("\n\n")}\n\n`;
	return idx > 0
		? baseContent.slice(0, idx) + joined + baseContent.slice(idx)
		: baseContent.trimEnd() + joined;
}

export { classifyRepoFiles, gh as ghAsync, ghSync };

/**
 * 列出所有可用技術棧（從 registry 讀取）
 *
 * @returns {Array<{ id: string, label: string, priority: number }>} 技術棧摘要列表
 */
export function listAvailableSkills() {
	return loadRegistry().skills.map((s) => ({
		id: s.id,
		label: s.label,
		priority: s.priority,
	}));
}
