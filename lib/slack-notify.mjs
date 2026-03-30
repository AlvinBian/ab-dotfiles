/**
 * Slack DM 通知 — 安裝完成/警告即時推送
 *
 * 使用 Claude Code 的 Slack MCP 發送，不需要額外 token。
 * 如果 MCP 不可用則靜默跳過。
 */

import { execFileSync } from 'child_process'

/**
 * 透過 Claude CLI 發送 Slack DM
 * 靜默失敗（不影響安裝流程）
 */
function sendSlackDM(message) {
  try {
    // 使用 claude CLI 的 MCP tool 發送
    // 格式：claude mcp call slack_send_message
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
 * 發送安裝完成通知
 */
export function notifyComplete({ elapsed, aiCost, installed, plan, warnings }) {
  const mainCount = plan.mainCount || 0
  const tempCount = plan.tempCount || 0
  const toolCount = plan.toolCount || 0
  const claudeMdCount = plan.projects?.length || 0

  const lines = [
    `✅ *ab-dotfiles v2.0 安裝完成*`,
    '',
    `• ${mainCount} ⭐主力 · ${tempCount} 🔄臨時${toolCount ? ` · ${toolCount} 🔧工具` : ''}`,
    `• ${installed.commands?.length || 0} cmd · ${installed.agents?.length || 0} agent · ${installed.rules?.length || 0} rule`,
    `• ${plan.techStacks?.length || 0} stacks · ${claudeMdCount} CLAUDE.md`,
    `• 耗時 ${elapsed}s · AI ~$${aiCost}`,
  ]

  if (warnings?.length) {
    lines.push('')
    lines.push('⚠️ 警告：')
    for (const w of warnings) lines.push(`• ${w}`)
  }

  return sendSlackDM(lines.join('\n'))
}

/**
 * 發送即時警告（安裝過程中的錯誤）
 */
export function notifyWarning(title, details) {
  const lines = [
    `⚠️ *ab-dotfiles: ${title}*`,
    '',
    ...details.map(d => `• ${d}`),
  ]
  return sendSlackDM(lines.join('\n'))
}
