/**
 * Claude Code CLI 封裝（統一調用入口）
 *
 * 職責：
 *   透過 claude CLI（-p / --print）呼叫 Claude，被 setup.mjs 和 ai-generate.mjs 共用。
 *   使用 Claude Code 訂閱額度，不需要 ANTHROPIC_API_KEY。
 *
 * 穩定策略：
 *   - execFile + -p（不用 stdin pipe）
 *   - --no-session-persistence（不存 session）
 *   - --system-prompt（覆蓋預設 prompt，避免 CLAUDE.md 干擾）
 *   - --disable-slash-commands（減少載入開銷）
 *   - --output-format json（結構化輸出，從 .result 取值）
 *   - 超時 + 重試（最多 2 次）
 */

import { execFile, execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { AI_EFFORT, AI_MODEL, AI_TIMEOUT } from "../core/constants.mjs";

const HOME = homedir();

const execFileAsync = promisify(execFile);

// ── 共用 CLI flags ──────────────────────────────────────────────
const SYSTEM_PROMPT =
	"You are a concise assistant. Only respond to the user prompt directly. No greetings, no extra explanation.";
const BASE_FLAGS = [
	"--no-session-persistence",
	"--system-prompt",
	SYSTEM_PROMPT,
	"--disable-slash-commands",
];

// 排除 ANTHROPIC_API_KEY，確保 CLI 走 OAuth 而非 API key
function cleanEnv() {
	const { ANTHROPIC_API_KEY, ...rest } = process.env;
	return rest;
}

// ── CLI 路徑偵測 ────────────────────────────────────────────────
let _cliPath = null;
let _cliWarnEmitted = false;

// claude CLI 可能的安裝路徑（官方安裝器、npm 全局、Homebrew）
const CLAUDE_CANDIDATES = [
	`${HOME}/.local/bin/claude`,
	"/usr/local/bin/claude",
	"/opt/homebrew/bin/claude",
	`${HOME}/.npm-global/bin/claude`,
];

function findCli() {
	if (_cliPath) return _cliPath;
	// 先嘗試 which（PATH 中有就用）
	try {
		_cliPath = execSync("which claude", { encoding: "utf8" }).trim();
		return _cliPath;
	} catch {
		/* 不在 PATH 中 */
	}
	// 逐一檢查已知安裝路徑
	for (const candidate of CLAUDE_CANDIDATES) {
		if (existsSync(candidate)) {
			_cliPath = candidate;
			return _cliPath;
		}
	}
	return null;
}

/**
 * 檢查 claude CLI 是否可用
 * @returns {boolean}
 */
export function isClaudeAvailable() {
	return !!findCli();
}

/**
 * 預熱 Claude CLI — 背景啟動最小呼叫，讓後續呼叫更快
 *
 * 效果：
 *   - OS 檔案快取載入 claude CLI 的 node_modules（~3s → ~1s）
 *   - OAuth token 驗證並快取
 *   - DNS + TLS 連線預建立
 *
 * 呼叫時機：ensureEnvironment 通過後立即呼叫，不 await
 */
export function warmupCli() {
	const cli = findCli();
	if (!cli) return;

	const child = spawn(
		cli,
		[
			"-p",
			"hi",
			"--model",
			"haiku",
			"--effort",
			"low",
			...BASE_FLAGS,
			"--output-format",
			"json",
		],
		{ env: cleanEnv(), stdio: "ignore", timeout: 15000 },
	);

	// 不等結果，只要啟動就行
	child.on("error", () => {});
	child.unref(); // 不阻止 Node 退出
}

/**
 * 呼叫 claude CLI（文字模式）
 *
 * @param {string} prompt - 完整的 prompt 文字
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=60000] - 超時毫秒數
 * @param {string} [options.model='haiku'] - 模型別名（haiku/sonnet/opus）
 * @param {string} [options.effort='low'] - 推理強度（low/medium/high/max）
 * @param {number} [options.retries=1] - 重試次數
 * @returns {Promise<string>} Claude 的回覆文字
 */
export async function callClaude(
	prompt,
	{
		timeoutMs = AI_TIMEOUT,
		model = AI_MODEL,
		effort = AI_EFFORT,
		retries = 1,
	} = {},
) {
	const cli = findCli();
	// callClaude/callClaudeJSON 是顯式呼叫路徑，CLI 不存在時應拋出（讓呼叫方決策）
	// callClaudeJSONStream（批次 AI 分析）才靜默降級，見 _cliWarnEmitted
	if (!cli) throw new Error("claude CLI 未安裝，請執行 claude install");

	const args = [
		"-p",
		prompt,
		"--model",
		model,
		"--effort",
		effort,
		...BASE_FLAGS,
	];

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const { stdout } = await execFileAsync(cli, args, {
				timeout: timeoutMs,
				maxBuffer: 4 * 1024 * 1024,
				env: cleanEnv(),
			});
			const text = stdout.trim();
			if (text && !text.includes("Not logged in")) return text;
		} catch (e) {
			// execFile timeout → e.killed === true
			if (e.killed) {
				console.error(
					`  ⏱ Claude CLI 超時（${timeoutMs}ms），${attempt < retries ? "重試中..." : "放棄"}`,
				);
			}
			// stderr 有 warning 但 stdout 有結果
			const out = e.stdout?.trim();
			if (out && !out.includes("Not logged in")) return out;
			// 最後一次重試也失敗
			if (attempt >= retries) {
				console.error(`  ✗ Claude CLI 失敗：${e.message?.slice(0, 120)}`);
				return "";
			}
		}
	}
	return "";
}

/**
 * 呼叫 claude CLI 並解析 JSON 回覆
 *
 * 策略：
 *   1. --output-format json → 從 wrapper 的 .result 欄位取值
 *   2. 嘗試 JSON.parse
 *   3. fallback：正則提取 JSON（可能被 code block 包裹）
 *
 * @param {string} prompt
 * @param {Object} [options] - 同 callClaude
 * @returns {Promise<Object|null>} 解析後的 JSON 物件，失敗返回 null
 */
export async function callClaudeJSON(
	prompt,
	{
		timeoutMs = AI_TIMEOUT,
		model = AI_MODEL,
		effort = AI_EFFORT,
		retries = 1,
	} = {},
) {
	const cli = findCli();
	if (!cli) throw new Error("claude CLI 未安裝，請執行 claude install");

	const args = [
		"-p",
		prompt,
		"--model",
		model,
		"--effort",
		effort,
		...BASE_FLAGS,
		"--output-format",
		"json",
	];

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const { stdout } = await execFileAsync(cli, args, {
				timeout: timeoutMs,
				maxBuffer: 4 * 1024 * 1024,
				env: cleanEnv(),
			});

			if (!stdout.trim()) continue;

			// --output-format json 回傳 { type: "result", result: "..." }
			const wrapper = JSON.parse(stdout);

			// 錯誤檢查（未登入、API 失敗等）
			if (wrapper?.is_error || wrapper?.result?.includes?.("Not logged in")) {
				const errMsg = wrapper.result || "unknown error";
				console.error(`  ✗ Claude CLI 錯誤：${errMsg.slice(0, 120)}`);
				if (attempt >= retries) return null;
				continue;
			}

			if (wrapper?.result) {
				const inner = extractJSON(wrapper.result);
				if (inner) return inner;
			}
			// 萬一 wrapper 本身就是我們要的 JSON
			if (wrapper && !wrapper.type) return wrapper;
		} catch (e) {
			if (e.killed) {
				console.error(
					`  ⏱ Claude CLI 超時（${timeoutMs}ms），${attempt < retries ? "重試中..." : "放棄"}`,
				);
			}
			// stderr warning 但 stdout 有結果
			if (e.stdout?.trim()) {
				const inner = extractJSON(e.stdout);
				if (inner) return inner;
			}
			if (attempt >= retries) {
				console.error(`  ✗ Claude CLI JSON 失敗：${e.message?.slice(0, 120)}`);
				return null;
			}
		}
	}
	return null;
}

/**
 * 呼叫 claude CLI（串流模式 + 即時 token 回報）
 *
 * 使用 spawn + --output-format stream-json --verbose，
 * 即時透過 onProgress 回傳 token 消耗、費用等資訊。
 *
 * @param {string} prompt
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=60000]
 * @param {string} [options.model='haiku']
 * @param {string} [options.effort='low']
 * @param {Function} [options.onProgress] - (info) => void, info: { inputTokens, outputTokens, cacheReadTokens, cacheCreateTokens, costUSD, durationMs, done }
 * @returns {Promise<Object|null>} 解析後的 JSON 物件
 */
export function callClaudeJSONStream(
	prompt,
	{
		timeoutMs = AI_TIMEOUT,
		model = AI_MODEL,
		effort = AI_EFFORT,
		onProgress = () => {},
	} = {},
) {
	return new Promise((resolve) => {
		const cli = findCli();
		if (!cli) {
			if (!_cliWarnEmitted) {
				_cliWarnEmitted = true;
				process.stderr.write(
					"⚠️ claude CLI 未找到，AI 分析將跳過（安裝：https://claude.ai/download）\n",
				);
			}
			resolve(null);
			return;
		}

		const args = [
			"-p",
			prompt,
			"--model",
			model,
			"--effort",
			effort,
			...BASE_FLAGS,
			"--output-format",
			"stream-json",
			"--verbose",
		];

		const child = spawn(cli, args, { env: cleanEnv(), timeout: timeoutMs });
		let buffer = "";
		let resultText = null;
		const usage = {
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheCreateTokens: 0,
			costUSD: 0,
			durationMs: 0,
		};

		const timer = setTimeout(() => {
			child.kill();
			onProgress({ ...usage, done: true, error: "timeout" });
			resolve(null);
		}, timeoutMs);

		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop(); // 保留不完整的最後一行

			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const event = JSON.parse(line);

					if (event.type === "assistant" && event.message?.usage) {
						const u = event.message.usage;
						usage.inputTokens = u.input_tokens || usage.inputTokens;
						usage.outputTokens = u.output_tokens || usage.outputTokens;
						usage.cacheReadTokens =
							u.cache_read_input_tokens || usage.cacheReadTokens;
						usage.cacheCreateTokens =
							u.cache_creation_input_tokens || usage.cacheCreateTokens;
						onProgress({ ...usage, done: false });
					}

					if (event.type === "result") {
						resultText = event.result;
						usage.costUSD = event.total_cost_usd || 0;
						usage.durationMs = event.duration_ms || 0;
						// 從 modelUsage 取更精確的數據
						if (event.modelUsage) {
							const m = Object.values(event.modelUsage)[0];
							if (m) {
								usage.inputTokens = m.inputTokens || usage.inputTokens;
								usage.outputTokens = m.outputTokens || usage.outputTokens;
								usage.cacheReadTokens =
									m.cacheReadInputTokens || usage.cacheReadTokens;
								usage.cacheCreateTokens =
									m.cacheCreationInputTokens || usage.cacheCreateTokens;
								usage.costUSD = m.costUSD || usage.costUSD;
							}
						}
						onProgress({ ...usage, done: true });
					}
				} catch {
					/* 進度顯示失敗不中斷主流程 */
				}
			}
		});

		child.on("close", () => {
			clearTimeout(timer);
			if (resultText) {
				resolve(extractJSON(resultText));
			} else {
				resolve(null);
			}
		});

		child.on("error", () => {
			clearTimeout(timer);
			resolve(null);
		});
	});
}

/**
 * 從文字中提取 JSON 物件
 * 處理：直接 JSON、markdown code block 包裹、前後有文字等情況
 *
 * @param {string} text
 * @returns {Object|null}
 */
function extractJSON(text) {
	if (!text || typeof text !== "string") return null;
	const trimmed = text.trim();

	// 1. 直接 parse
	try {
		return JSON.parse(trimmed);
	} catch {
		/* 解析失敗則嘗試其他格式 */
	}

	// 2. 去掉 ```json ... ``` 包裹
	const codeBlock = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
	if (codeBlock) {
		try {
			return JSON.parse(codeBlock[1].trim());
		} catch {
			/* code block 解析失敗則嘗試下一種格式 */
		}
	}

	// 3. 找最外層 { ... }
	const braceMatch = trimmed.match(/\{[\s\S]*\}/);
	if (braceMatch) {
		try {
			return JSON.parse(braceMatch[0]);
		} catch {
			/* 大括號匹配解析失敗則返回 null */
		}
	}

	return null;
}
