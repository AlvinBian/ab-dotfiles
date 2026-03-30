/**
 * Slack DM 通知 — 透過 Claude CLI MCP 發送
 * 不需要 Bot Token，直接用 Claude Code 的 Slack MCP
 */

import { execFileSync } from 'child_process'
import { env } from './env.mjs'

const DM_CHANNEL = env('SLACK_DM_CHANNEL', 'U04B933M4G6')

function sendSlack(message) {
  try {
    execFileSync('claude', [
      '--print', '--output-format', 'text', '--model', 'haiku',
      '-p', `Use slack_send_message to send to channel_id "${DM_CHANNEL}". Message:\n${message}\nJust send it, no commentary.`,
    ], { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'ignore'] })
    return true
  } catch {
    return false
  }
}

export function notifyComplete({ elapsed, aiCost, installed, plan, warnings }) {
  const lines = [
    '✅ *ab-dotfiles v2.0 安裝完成*',
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

export function notifyWarning(title, details) {
  return sendSlack(`⚠️ *ab-dotfiles: ${title}*\n\n${details.map(d => `• ${d}`).join('\n')}`)
}
