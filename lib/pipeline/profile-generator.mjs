/**
 * 開發者畫像產生器
 *
 * 從 pipeline 結果 + AI 推斷用戶的技術身份。
 * 不寫死任何角色映射 — AI 根據實際技術棧自由判斷。
 */

import pc from 'picocolors'
import { callClaudeJSONStream } from '../external/claude-cli.mjs'
import { AI_PROFILE_MODEL } from '../core/constants.mjs'

/**
 * 用 AI 產生開發者畫像（背景執行，不阻塞）
 *
 * @param {Object} pipelineResult
 * @returns {Promise<{ role, coreSkills, tags, summary }>}
 */
export async function generateProfile(pipelineResult) {
  const { categorizedTechs, perRepo } = pipelineResult

  // 收集所有技術 + 分類 + per-repo reasoning
  const catSummary = [...categorizedTechs.entries()]
    .map(([cat, techMap]) => `${cat}: ${[...techMap.keys()].join(', ')}`)
    .join('\n')

  const repoReasonings = perRepo
    ? [...perRepo.entries()].map(([name, data]) => `${name}: ${data.reasoning || ''}`).filter(s => s.includes(':')).join('\n')
    : ''

  const prompt = `根據以下技術棧和專案分析，用一句話描述這位開發者的角色定位。

技術棧：
${catSummary}

專案摘要：
${repoReasonings}

回傳純 JSON：
{
  "role": "角色名稱（如：Web 全端工程師、iOS 應用工程師、機器學習工程師、DevOps 工程師等）",
  "coreSkills": ["核心技能1", "核心技能2", "核心技能3"],
  "tags": ["附加標籤1", "附加標籤2"],
  "summary": "一句話描述（30 字內）"
}`

  try {
    const result = await callClaudeJSONStream(prompt, { model: AI_PROFILE_MODEL, effort: 'low', timeoutMs: 30000 })
    if (result?.role) return result
  } catch {}

  // AI 失敗時的 fallback：從分類數量推斷
  const cats = [...categorizedTechs.keys()]
  return {
    role: '軟體工程師',
    coreSkills: cats.slice(0, 3),
    tags: [],
    summary: `涵蓋 ${cats.length} 個技術領域`,
  }
}

/**
 * 計算字串在 terminal 中的顯示寬度（CJK 字元佔 2 格）
 *
 * 用於對齊顯示，確保中英文混排時欄位寬度計算正確。
 * 涵蓋 CJK Unified、Symbols、Fullwidth Forms、Extension A 及 Compat 等範圍。
 *
 * @param {string} str - 要計算寬度的字串（可含 ANSI 控制碼）
 * @returns {number} terminal 顯示寬度（英數字 1 格，CJK 2 格）
 */
function displayWidth(str) {
  // 去掉 ANSI 控制碼
  const clean = str.replace(/\x1B\[[0-9;]*[A-HJKSTfhilmnsu]/g, '')
  let w = 0
  for (const ch of clean) {
    const code = ch.codePointAt(0)
    // CJK 字元範圍（常用）
    if ((code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified
        (code >= 0x3000 && code <= 0x303F) ||   // CJK Symbols
        (code >= 0xFF00 && code <= 0xFFEF) ||   // Fullwidth Forms
        (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
        (code >= 0xF900 && code <= 0xFAFF)) {   // CJK Compat
      w += 2
    } else {
      w += 1
    }
  }
  return w
}

/**
 * 將字串 padEnd 到指定顯示寬度
 *
 * 使用 displayWidth 計算實際寬度，補足空格確保對齊。
 * 若字串已超過目標寬度則直接返回（不截斷）。
 *
 * @param {string} str - 原始字串
 * @param {number} targetWidth - 目標顯示寬度
 * @returns {string} 補空格後的字串
 */
function padToWidth(str, targetWidth) {
  const diff = targetWidth - displayWidth(str)
  return diff > 0 ? str + ' '.repeat(diff) : str
}

/**
 * 在終端機顯示開發者畫像
 *
 * 輸出角色名稱、核心技能、附加標籤和摘要，
 * 最後加上一行激勵訊息。
 *
 * @param {{ role: string, coreSkills?: string[], tags?: string[], summary?: string }} profile
 *   generateProfile 的回傳值
 * @param {Object} p - @clack/prompts 模組實例（用於 p.log.info）
 * @returns {void}
 */
export function showProfile(profile, p) {
  const lines = [`👤 ${pc.bold(profile.role)}`]

  if (profile.coreSkills?.length) {
    lines.push(`🎯 核心技能: ${profile.coreSkills.join(' / ')}`)
  }

  if (profile.tags?.length) {
    lines.push(`🏷️  ${profile.tags.join(' · ')}`)
  }

  if (profile.summary) {
    lines.push(`💡 ${profile.summary}`)
  }

  lines.push(`🚀 即將根據你的技術棧，打造專屬的 Claude Code 技能庫`)

  p.log.info(`開發者畫像：\n${lines.join('\n')}`)
}
