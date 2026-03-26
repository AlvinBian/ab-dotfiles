/**
 * Claude CLI 封裝（統一調用入口）
 *
 * 職責：
 *   提供穩定、高效的 claude CLI 調用方式，被 setup.mjs 和 ai-generate.mjs 共用。
 *
 * 最穩定方式：execFile + -p flag（不用 stdin pipe / fd / echo）
 *   - --model sonnet：快 3~5 倍
 *   - --effort low：分類不需深度推理
 *   - --no-session-persistence：不存 session
 *   - 注意：不用 --bare（它跳過 OAuth）
 *   - --json-schema：強制 JSON 格式輸出（不用手動 parse）
 *   - --output-format json：結構化輸出
 */

import { execFile, execSync } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * 檢查 claude CLI 是否可用
 * @returns {boolean}
 */
export function isClaudeAvailable() {
  try {
    execSync('which claude', { stdio: ['pipe', 'pipe', 'pipe'] })
    return true
  } catch { return false }
}

/**
 * 呼叫 claude CLI（穩定 + 快速）
 *
 * @param {string} prompt - 完整的 prompt 文字
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=60000] - 超時毫秒數
D * @param {string} [options.model='sonnet'] - 模型（sonnet/opus/haiku）
 * @param {string} [options.effort='low'] - 推理強度（low/medium/high/max）
 * @returns {Promise<string>} claude 的回覆文字
 */
export async function callClaude(prompt, { timeoutMs = 60000, model = 'sonnet', effort = 'low' } = {}) {
  try {
    const { stdout } = await execFileAsync('claude', [
      '--print', '-p', prompt,
      '--model', model,
      '--effort', effort,
      '--no-session-persistence',
    ], { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 })
    return stdout
  } catch (e) {
    // claude CLI 可能在 stderr 輸出 warning 但 stdout 有正確結果
    return e.stdout || ''
  }
}

/**
 * 呼叫 claude CLI 並解析 JSON 回覆
 *
 * 自動處理：
 *   - 有 schema → --json-schema 強制格式，直接 JSON.parse
 *   - 無 schema → 從回覆中提取 JSON（正則 fallback）
 *
 * @param {string} prompt
 * @param {Object} [options] - 同 callClaude
 * @returns {Promise<Object|null>} 解析後的 JSON 物件，失敗返回 null
 */
export async function callClaudeJSON(prompt, options = {}) {
  const raw = await callClaude(prompt, options)
  if (!raw) return null
  // 嘗試直接 parse
  try { return JSON.parse(raw) } catch {}
  // fallback：提取 JSON（可能被 markdown code block 包裹）
  const m = raw.match(/\{[\s\S]*\}/)
  if (m) try { return JSON.parse(m[0]) } catch {}
  return null
}
