#!/usr/bin/env node
/**
 * pnpm run status — 查看已安裝配置的健康狀態
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { getConfigStatus } from '../lib/core/config-status.mjs'
import { ALL_COMMANDS, ALL_AGENTS } from '../lib/config/config-classifier.mjs'

p.intro(pc.bold('ab-dotfiles 配置狀態'))

const { claude, claudeMd, zsh, slack, env, summary } = getConfigStatus()

// ── Claude 配置 ──
const cmdMissing = claude.missing.filter(x => ALL_COMMANDS.includes(x)).length
const agentMissing = claude.missing.filter(x => ALL_AGENTS.includes(x)).length

p.log.step(pc.bold('Claude 配置'))
console.log(`  Commands   ${pc.green(claude.installedCommands.length)} 個` + (cmdMissing > 0 ? pc.red(` （缺 ${cmdMissing} 個）`) : ''))
console.log(`  Agents     ${pc.green(claude.installedAgents.length)} 個` + (agentMissing > 0 ? pc.red(` （缺 ${agentMissing} 個）`) : ''))
console.log(`  Rules      ${pc.green(claude.installedRules.length)} 個`)
console.log(`  CLAUDE.md  ${pc.cyan(claudeMd.count)} 個 repo`)

if (claude.missing.length > 0) {
  p.log.warn(`缺少 ${claude.missing.length} 個配置：${claude.missing.slice(0, 5).join(', ')}${claude.missing.length > 5 ? `… +${claude.missing.length - 5}` : ''}`)
}

// ── ZSH 模組 ──
p.log.step(pc.bold('ZSH 模組'))
console.log(`  已安裝  ${pc.green(zsh.installed.length)}/${zsh.expected.length}  ${pc.dim(zsh.installed.join(', '))}`)
if (zsh.missing.length > 0) {
  p.log.warn(`缺少：${zsh.missing.join(', ')}`)
}

// ── Slack 設定 ──
p.log.step(pc.bold('Slack 通知'))
if (slack.mode && slack.mode !== 'off') {
  const label = slack.mode === 'dm' ? 'DM（私訊自己）' : `頻道 ${slack.channel || ''}`
  console.log(`  模式：${pc.cyan(label)}`)
} else {
  console.log(`  ${pc.dim('未設定（執行 pnpm run setup 可啟用）')}`)
}

// ── AI 設定 ──
if (env.aiModel) {
  p.log.step(pc.bold('AI 設定'))
  console.log(`  模型：${pc.cyan(env.aiModel)}`)
}

// ── 整體健康度 ──
const bar = '█'.repeat(Math.round(summary.pct / 5)) + '░'.repeat(20 - Math.round(summary.pct / 5))
const icon = summary.pct >= 90 ? pc.green('✔') : summary.pct >= 70 ? pc.yellow('⚠') : pc.red('✘')

p.log.step(pc.bold('整體健康度'))
console.log(`  ${icon}  [${bar}]  ${pc.bold(summary.pct + '%')}  (${summary.ok}/${summary.total})`)

if (summary.missing > 0) {
  console.log(`\n  ${pc.dim('執行 pnpm run setup 可修復缺少的配置')}`)
}

p.outro(pc.dim('pnpm run setup → 查看/調整配置'))
