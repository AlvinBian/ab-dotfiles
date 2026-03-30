/**
 * Slack 通知 — 安裝完成/警告推送
 *
 * 優先用 SLACK_BOT_TOKEN + curl（快），
 * 備用 Claude CLI MCP（慢，但不需要 token）。
 */

import { execFileSync, execSync } from 'child_process'
import { env } from './env.mjs'

const TOKEN = env('SLACK_BOT_TOKEN', '')
const CHANNEL = env('SLACK_NOTIFY_CHANNEL', '')

/**
 * 發送 Slack 訊息
 */
function sendSlack(message) {
  // 方式 1：直接 curl（快，需要 token）
  if (TOKEN && CHANNEL) {
    try {
      execSync(`curl -s -X POST "https://slack.com/api/chat.postMessage" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json; charset=utf-8" -d '${JSON.stringify({ channel: CHANNEL, text: message }).replace(/'/g, "'\\''")}'`, {
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'ignore'],
      })
      return true
    } catch { /* fall through to MCP */ }
  }

  // 方式 2：Claude CLI MCP（慢，不需 token）
  try {
    execFileSync('claude', [
      '--print', '--output-format', 'text', '--model', 'haiku',
      '-p', `Use the slack_send_message MCP tool to send this message to channel_id "U04B933M4G6" (DM to self). Message:\n${message}\nJust send it, no commentary.`,
    ], { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'ignore'] })
    return true
  } catch {
    return false
  }
}

/**
 * 安裝完成通知
 */
export function notifyComplete({ elapsed, aiCost, installed, plan, warnings }) {
  const mainCount = plan.mainCount || 0
  const tempCount = plan.tempCount || 0
  const toolCount = plan.toolCount || 0
  const claudeMdCount = plan.projects?.length || 0

  const lines = [
    '✅ *ab-dotfiles v2.0 安裝完成*',
    '',
    `• ${mainCount} ⭐主力 · ${tempCount} 🔄臨時${toolCount ? ` · ${toolCount} 🔧工具` : ''}`,
    `• ${installed.commands?.length || 0} cmd · ${installed.agents?.length || 0} agent · ${installed.rules?.length || 0} rule`,
    `• ${plan.techStacks?.length || 0} stacks · ${claudeMdCount} CLAUDE.md`,
    `• 耗時 ${elapsed}s · AI ~$${aiCost}`,
  ]

  if (warnings?.length) {
    lines.push('', '⚠️ 警告：')
    for (const w of warnings) lines.push(`• ${w}`)
  }

  return sendSlack(lines.join('\n'))
}

/**
 * 即時警告
 */
export function notifyWarning(title, details) {
  const lines = [
    `⚠️ *ab-dotfiles: ${title}*`,
    '',
    ...details.map(d => `• ${d}`),
  ]
  return sendSlack(lines.join('\n'))
}
