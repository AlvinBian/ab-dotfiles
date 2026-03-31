/**
 * Slack DM 通知 — 透過 Claude CLI MCP 發送
 * 不需要 Bot Token，直接用 Claude Code 的 Slack MCP
 */

import { execFileSync } from 'child_process'
import { APP_VERSION } from '../core/constants.mjs'
import { env } from '../core/env.mjs'

/**
 * 透過 Claude CLI MCP 發送 Slack 訊息（內部函式）
 *
 * 優先推送到綁定的 Channel，沒有 Channel 才 fallback 到 DM。
 * 以 `claude --print` 呼叫 Claude haiku，
 * 委託其透過 Slack MCP 工具發送訊息，不需 Bot Token。
 *
 * @param {string} message - 要發送的 Slack mrkdwn 格式訊息
 * @returns {boolean} 是否成功發送（失敗時靜默返回 false）
 */
function sendSlack(message) {
  // 每次呼叫時重新讀取（setup 中途可能更新 .env）
  // 優先：綁定的 Channel > DM
  const channel = env('SLACK_NOTIFY_CHANNEL', '') || env('SLACK_DM_CHANNEL', '')
  if (!channel) return false
  try {
    execFileSync('claude', [
      '--print', '--output-format', 'text', '--model', 'haiku',
      '--allowedTools', 'mcp__claude_ai_Slack__slack_send_message',
      `Use mcp__claude_ai_Slack__slack_send_message to send to channel_id "${channel}". Message:\n${message}\nJust call the tool, no commentary.`,
    ], { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'ignore'] })
    return true
  } catch (err) {
    process.stderr.write(`[slack-notify] 發送失敗：${err.message}\n`)
    return false
  }
}

/**
 * 發送安裝完成通知到 Slack
 *
 * 組合安裝摘要（耗時、AI 費用、安裝數量、技術棧等）
 * 並附上任何警告訊息後發送。
 *
 * @param {Object} opts
 * @param {number} opts.elapsed - 總耗時（秒）
 * @param {string} opts.aiCost - AI 費用估算字串（如 "0.05"）
 * @param {Object} opts.installed - 已安裝項目統計 { commands, agents, rules }
 * @param {Object} opts.plan - 安裝計畫摘要 { mainCount, tempCount, toolCount, techStacks, projects }
 * @param {string[]} [opts.warnings=[]] - 警告訊息列表
 * @returns {boolean} 是否成功發送
 */
export function notifyComplete({ elapsed, aiCost, installed, plan, warnings }) {
  const lines = [
    `✅ *ab-dotfiles v${APP_VERSION} 安裝完成*`,
    '',
    `• ${plan.mainCount || 0} ⭐主力 · ${plan.tempCount || 0} 🔄臨時${plan.toolCount ? ` · ${plan.toolCount} 🔧工具` : ''}`,
    `• ${installed.commands?.length || 0} cmd · ${installed.agents?.length || 0} agent · ${installed.rules?.length || 0} rule`,
    `• ${plan.techStacks?.length || 0} stacks · ${plan.projects?.length || 0} CLAUDE.md`,
    `• 耗時 ${elapsed}s · AI ~$${aiCost}`,
  ]
  if (warnings?.length) {
    lines.push('', '⚠️ 警告：')
    for (const w of warnings) lines.push(`• ${w}`)
  }
  return sendSlack(lines.join('\n'))
}

/**
 * 發送警告通知到 Slack
 *
 * @param {string} title - 警告標題
 * @param {string[]} details - 警告詳情列表，每項顯示為一個 bullet
 * @returns {boolean} 是否成功發送
 */
export function notifyWarning(title, details) {
  return sendSlack(`⚠️ *ab-dotfiles: ${title}*\n\n${details.map(d => `• ${d}`).join('\n')}`)
}
