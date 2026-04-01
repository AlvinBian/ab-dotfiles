/**
 * Per-repo AI 技術棧分析
 *
 * 每個 repo 獨立呼叫 AI 分析，prompt 只包含該 repo 的上下文。
 * 比合併所有 repos 更精準、更快、可獨立快取。
 *
 * 流程：
 *   buildRepoSummary：從 analyzeRepo 結果提取 deps/語言/基礎設施資訊，
 *                     並用 taxonomy/classify.mjs 進行確定性預分類。
 *   classifyRepo：組裝 prompt → 呼叫 AI → 快取結果。
 *
 * 快取策略：以 repoName + summary 的 MD5 hash 為鍵，
 *           prompt 或依賴沒變化就不重新呼叫 AI。
 */

import { callClaudeJSONStream } from "../external/claude-cli.mjs";
import { classifyBatch, getStandardCategories } from "../taxonomy/classify.mjs";
import { hashKey, readCache, writeCache } from "./pipeline-cache.mjs";

const NOISE_RE =
	/^(@types\/|@babel\/|@swc\/|@storybook\/|@typescript-eslint\/|babel-|postcss-|eslint-|stylelint-|webpack-|@eslint\/|@postcss\/)/;
const INFRA_SIGNALS =
	/^(docker-compose|Dockerfile|nginx|Makefile|Vagrantfile|Procfile|serverless|terraform|pulumi|k8s|kubernetes|helm)/i;
const INFRA_DIRS =
	/^(nginx|redis|postgres|mysql|mongo|pgadmin|jaeger|grafana|prometheus|elasticsearch|rabbitmq|kafka|certificates|ssl)/i;

/**
 * 從 analyzeRepo 結果提取結構化摘要，供 AI 分類 prompt 使用
 *
 * 提取 package.json / composer.json 依賴、根目錄基礎設施檔案、
 * 語言組成等資訊，並透過 taxonomy/classify.mjs 進行確定性預分類，
 * 減少 AI 需要判斷的範圍。
 *
 * @param {string} repoName - repo 短名稱（不含 owner）
 * @param {Object} analysis - analyzeRepo 的完整回傳值
 * @returns {{
 *   summary: string,
 *   meta: { description, stars, topics, languages, rootFiles },
 *   npmDeps: Set<string>,
 *   allDeps: { deps, devDeps, phpDeps },
 *   taxonomyClassified: Map<string, string[]>,
 *   taxonomyUnclassified: string[]
 * }}
 */
export function buildRepoSummary(repoName, analysis) {
	const { context, languages, description, stars, topics, rootFiles, skills } =
		analysis;
	const meta = {
		description,
		stars,
		topics,
		languages: Object.keys(languages),
		rootFiles: rootFiles || [],
	};
	const tf = context.techFiles;

	const deps = {},
		devDeps = {},
		phpDeps = {};
	for (const [fileName, content] of Object.entries(tf)) {
		if (fileName.endsWith("package.json")) {
			try {
				const pkg = JSON.parse(content);
				for (const [n, v] of Object.entries(pkg.dependencies || {})) {
					if (!n.startsWith("@types/")) deps[n] = v;
				}
				for (const [n, v] of Object.entries(pkg.devDependencies || {})) {
					if (!n.startsWith("@types/")) devDeps[n] = v;
				}
			} catch {
				/* package.json 格式錯誤則略過 */
			}
		}
		if (fileName.endsWith("composer.json")) {
			try {
				const c = JSON.parse(content);
				for (const [n, v] of Object.entries(c.require || {})) {
					if (!/^(php$|ext-|lib-|composer\/|psr\/)/.test(n)) phpDeps[n] = v;
				}
			} catch {
				/* composer.json 格式錯誤則略過 */
			}
		}
	}

	const npmDeps = Object.keys(deps).filter((n) => !NOISE_RE.test(n));
	const npmDevDeps = Object.keys(devDeps).filter((n) => !NOISE_RE.test(n));
	const phpDepNames = Object.keys(phpDeps);

	// 建構 prompt 用的文字摘要
	const parts = [`[${repoName}]${description ? ` ${description}` : ""}`];
	parts.push(`  語言: ${meta.languages.join(", ")}`);
	if (topics?.length) parts.push(`  topics: ${topics.join(", ")}`);
	if (npmDeps.length) parts.push(`  dependencies: ${npmDeps.join(", ")}`);
	if (npmDevDeps.length)
		parts.push(`  devDependencies: ${npmDevDeps.join(", ")}`);
	if (phpDepNames.length)
		parts.push(`  composer require: ${phpDepNames.join(", ")}`);

	const infraFiles = meta.rootFiles.filter((f) => INFRA_SIGNALS.test(f));
	const infraDirs = meta.rootFiles.filter((f) => INFRA_DIRS.test(f));
	const infra = [...infraFiles, ...infraDirs];
	if (infra.length) parts.push(`  基礎設施: ${infra.join(", ")}`);

	// rule-based 預分類（來自 stacks/*/detect.json）
	if (skills?.length) parts.push(`  規則偵測: ${skills.join(", ")}`);

	// taxonomy 查表預分類（來自 awesome-* 列表）
	const { classified, unclassified } = classifyBatch(
		[...npmDeps, ...npmDevDeps],
		phpDepNames,
	);
	if (classified.size > 0) {
		const preParts = [...classified.entries()].map(
			([cat, pkgs]) =>
				`${cat}: ${pkgs.slice(0, 3).join(", ")}${pkgs.length > 3 ? " …" : ""}`,
		);
		parts.push(`  已知分類: ${preParts.join(" | ")}`);
	}
	if (unclassified.length > 0) {
		parts.push(
			`  待分類: ${unclassified.slice(0, 10).join(", ")}${unclassified.length > 10 ? " …" : ""}`,
		);
	}

	if (!npmDeps.length && !npmDevDeps.length && !phpDepNames.length) {
		const dirs = meta.rootFiles
			.filter((f) => !f.startsWith(".") && !f.includes("."))
			.slice(0, 15);
		if (dirs.length) parts.push(`  目錄結構: ${dirs.join(", ")}`);
	}

	return {
		summary: parts.join("\n"),
		meta,
		npmDeps: new Set(
			[...Object.keys(deps), ...Object.keys(devDeps)].filter(
				(n) => !n.startsWith("@types/"),
			),
		),
		allDeps: { deps, devDeps, phpDeps },
		taxonomyClassified: classified,
		taxonomyUnclassified: unclassified,
	};
}

/**
 * 對單一 repo 執行 AI 技術棧分類
 *
 * @param {string} repoName
 * @param {string} summary - buildRepoSummary().summary
 * @param {Object} options
 * @returns {{ techStacks, reasoning, tokens, fromCache }}
 */
export async function classifyRepo(
	repoName,
	summary,
	{
		baseDir,
		model = "haiku",
		effort = "low",
		timeoutMs = 30000,
		maxCategories = 10,
		maxTechs = 30,
		cacheEnabled = true,
		onProgress = () => {},
	} = {},
) {
	const cacheKey = `${repoName.replace("/", "-")}-${hashKey(summary)}`;

	// 快取
	if (cacheEnabled && baseDir) {
		const cached = readCache(baseDir, "repo-ai", cacheKey);
		if (cached) {
			onProgress({ done: true, fromCache: true });
			return { ...cached, fromCache: true, cacheKey };
		}
	}

	const stdCats = getStandardCategories().join("、");

	const prompt = `你是技術棧分析專家。從以下 repo 提取**最核心**的技術棧。

${summary}

「已知分類」中的技術已由查表確認，直接納入結果。你只需補充「待分類」中值得保留的核心技術。

嚴格篩選規則：
1. 只保留定義這個專案的核心技術 — 框架、主要 UI 庫、狀態管理、HTTP 客戶端、主要測試框架、主要建構工具
2. 丟棄：linter、formatter、type definitions、plugin/loader、polyfill、adapter/wrapper、小型工具函式
3. 丟棄：公司內部 SDK（如 kkday-*、@kkday/*）除非是主要 UI 設計系統
4. 丟棄：只是 devDependencies 的輔助工具（coverage plugin、mock adapter 等），只保留主測試框架本身（vitest 或 jest，不用兩者都留）
5. 同類只留最重要的 1-2 個（例如有 nuxt 就不需再列 vue；有 vitest 就不需 vitest-coverage-v8）
6. PHP 套件只留框架級（laravel/framework），丟棄 utility packages
7. 若有「規則偵測」行，這些是已確認的技術棧，優先納入分類
8. 每個技術只出現在一個分類，最多 ${maxCategories} 分類、最多 ${maxTechs} 技術
9. 分類名必須從以下標準詞表中選擇：${stdCats}
10. 標記核心分類（定義專案架構方向的）放入 coreCategories，輔助性的不放

回傳純 JSON：{"techStacks":{"分類":["id"]},"coreCategories":["核心分類名"],"reasoning":"一句話說明主要技術方向"}`;

	const tokens = {};
	let result = null;

	try {
		result = await callClaudeJSONStream(prompt, {
			model,
			effort,
			timeoutMs,
			onProgress: (info) => {
				Object.assign(tokens, info);
				onProgress({ ...info, repo: repoName });
			},
		});
	} catch {
		/* AI 分析失敗則返回空結果 */
	}

	const output = {
		techStacks: result?.techStacks || {},
		coreCategories: result?.coreCategories || [],
		reasoning: result?.reasoning || "",
		tokens,
		cacheKey,
		fromCache: false,
	};

	// 寫快取
	if (result?.techStacks && cacheEnabled && baseDir) {
		writeCache(baseDir, "repo-ai", cacheKey, {
			techStacks: output.techStacks,
			coreCategories: output.coreCategories,
			reasoning: output.reasoning,
			tokens,
		});
	}

	return output;
}
