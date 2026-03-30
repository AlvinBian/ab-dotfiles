/**
 * Phase: 安裝計畫展示 + 確認/調整/精簡
 *
 * 用 p.note 展示安裝計畫，用戶選擇安裝模式。
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs'
import path from 'path'
import { handleCancel, smartSelect, BACK } from '../ui/prompts.mjs'
import { generateMinimalPlan } from '../auto-plan.mjs'

/**
 * 展示安裝計畫並讓用戶確認
 *
 * @param {Object} plan - generateInstallPlan 產出
 * @returns {Object|symbol} 確認的 plan（可能被「精簡」修改）/ BACK / null（取消）
 */
export async function phasePlan(plan) {
  // 偵測現有安裝狀態
  const HOME = process.env.HOME
  const claudeDir = path.join(HOME, '.claude')
  const readDir = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')) : []
  const existing = {
    commands: readDir(path.join(claudeDir, 'commands')),
    agents: readDir(path.join(claudeDir, 'agents')),
    rules: readDir(path.join(claudeDir, 'rules')),
    hasSettings: fs.existsSync(path.join(claudeDir, 'settings.json')),
    hasHooks: fs.existsSync(path.join(claudeDir, 'hooks.json')),
    hasKeybindings: fs.existsSync(path.join(claudeDir, 'keybindings.json')),
  }

  // 組裝計畫展示內容 — p.note 內不使用 ANSI 色碼，避免右側框線對齊問題
  const lines = []

  // 現有狀態
  const existTotal = existing.commands.length + existing.agents.length + existing.rules.length
  if (existTotal > 0) {
    lines.push(`📋 現有配置（~/.claude/）`)
    if (existing.commands.length) lines.push(`   Commands（${existing.commands.length}）：${existing.commands.join('、')}`)
    if (existing.agents.length) lines.push(`   Agents（${existing.agents.length}）：${existing.agents.join('、')}`)
    if (existing.rules.length) lines.push(`   Rules（${existing.rules.length}）：${existing.rules.join('、')}`)
    const extras = []
    if (existing.hasSettings) extras.push('settings')
    if (existing.hasHooks) extras.push('hooks')
    if (existing.hasKeybindings) extras.push('keybindings')
    if (extras.length) lines.push(`   ${extras.join(' · ')}`)
    lines.push('')
  }

  // 畫像
  if (plan.profile) {
    lines.push(`👤 ${plan.profile.role || '開發者'}`)
    if (plan.profile.coreSkills?.length) {
      lines.push(`   ${plan.profile.coreSkills.join(' · ')}`)
    }
    lines.push('')
  }

  // Repos — 全部展開
  lines.push(`📦 Repos（${plan.mainCount} ⭐主力 · ${plan.tempCount} 🔄臨時${plan.toolCount ? ` · ${plan.toolCount} 🔧工具` : ''}）`)
  for (const r of plan.repos) {
    const icon = r.role === 'main' ? '⭐' : r.role === 'temp' ? '🔄' : '🔧'
    const config = r.role === 'main' ? '完整' : r.role === 'temp' ? '精簡' : '最小'
    const localPath = r.localPath ? `→ ${r.localPath.replace(process.env.HOME, '~')}` : '⚠ 未找到'
    lines.push(`   ${icon} ${r.fullName.split('/')[1]}  ${localPath}  [${config}]`)
  }
  lines.push('')

  // 全局 — 列出所有項目名稱
  const g = plan.global
  lines.push('🛠 全局配置')
  if (g.commands.length) lines.push(`   Commands（${g.commands.length}）：${g.commands.join('、')}`)
  if (g.agents.length) lines.push(`   Agents（${g.agents.length}）：${g.agents.join('、')}`)
  if (g.rules.length) lines.push(`   Rules（${g.rules.length}）：${g.rules.join('、')}`)
  if (g.hooks.length) lines.push(`   Hooks（${g.hooks.length}）：${g.hooks.map(h => h.label || h).join('、')}`)
  lines.push(`   Permission：${g.permissions.allow.length} allow · ${g.permissions.deny.length} deny`)
  lines.push(`   快捷鍵（${Object.keys(g.keybindings).length}）· AutoMemory · Model: ${g.settings.model}`)
  lines.push('')

  // 專案 — 列出配置內容
  const mainProjects = plan.projects.filter(proj => proj.role === 'main')
  if (mainProjects.length > 0) {
    const p0 = mainProjects[0].config
    lines.push(`📂 專案配置（注入 ${mainProjects.length} 個主力 repo）`)
    lines.push('   CLAUDE.md（AI 生成）')
    if (p0.commands.length) lines.push(`   Commands（${p0.commands.length}）：${p0.commands.join('、')}`)
    if (p0.agents.length) lines.push(`   Agents（${p0.agents.length}）：${p0.agents.join('、')}`)
    if (p0.rules.length) lines.push(`   Rules（${p0.rules.length}）：${p0.rules.join('、')}`)
    if (plan.techStacks.length) lines.push(`   Stacks（${plan.techStacks.length}）：${plan.techStacks.join('、')}`)
    lines.push('')
  }

  // ECC — 列出名稱
  if (plan.ecc.length > 0) lines.push(`🌐 ECC（${plan.ecc.length}）：${plan.ecc.join('、')}`)
  // zsh — 列出模組名稱
  if (plan.zshModules.length > 0) lines.push(`🐚 zsh（${plan.zshModules.length}）：${plan.zshModules.join('、')}`)
  lines.push('')

  // 變更摘要
  const changes = []
  const newCmds = g.commands.filter(c => !existing.commands.includes(c))
  const newAgents = g.agents.filter(a => !existing.agents.includes(a))
  const newRules = g.rules.filter(r => !existing.rules.includes(r))
  if (newCmds.length) changes.push(`+${newCmds.length} commands`)
  if (newAgents.length) changes.push(`+${newAgents.length} agents`)
  if (newRules.length) changes.push(`+${newRules.length} rules`)
  if (!existing.hasSettings) changes.push('+settings.json')
  else changes.push('合併 settings permissions')
  if (!existing.hasKeybindings) changes.push('+keybindings.json')
  if (!existing.hasHooks) changes.push('+hooks.json')
  else changes.push('合併 hooks')
  if (changes.length > 0) {
    lines.push(`🔄 將變更：${changes.join(' · ')}`)
    lines.push('')
  }

  // 費用
  lines.push(`💰 預估 AI 費用：~$${plan.aiCost.total.toFixed(2)}`)

  // 展示
  p.note(lines.join('\n'), '安裝計畫')

  // 選擇
  const action = handleCancel(await p.select({
    message: '安裝方式',
    options: [
      { value: 'full', label: '安裝全部', hint: '推薦' },
      { value: 'detail', label: '逐項確認', hint: '展開各類別的選擇' },
      { value: 'minimal', label: '精簡安裝', hint: `只裝全局必需品（${2} cmd · ${3} agent）` },
      { value: 'back', label: '← 上一步' },
    ],
  }))

  if (action === BACK || action === 'back') return BACK
  if (action === 'minimal') return generateMinimalPlan(plan)
  if (action === 'detail') return await detailConfirm(plan)
  return plan // full
}

/**
 * 逐項確認子流程
 */
async function detailConfirm(plan) {
  // 1. Repo 角色調整
  const roleItems = plan.repos.map(r => ({
    value: r.fullName,
    label: `${r.role === 'main' ? '⭐' : '🔄'} ${r.fullName.split('/')[1]}`,
    hint: r.role === 'main' ? '主力（完整配置）' : '臨時（精簡配置）',
  }))
  const mainRepos = await smartSelect({
    title: '⭐ 主力 repos（完整配置）',
    items: roleItems,
    preselected: plan.repos.filter(r => r.role === 'main').map(r => r.fullName),
    required: true,
    autoSelectThreshold: 0,
  })
  if (mainRepos === BACK) return BACK

  // 更新角色
  const mainSet = new Set(mainRepos)
  for (const r of plan.repos) {
    r.role = mainSet.has(r.fullName) ? 'main' : 'temp'
  }

  // 2-5. 全局 commands/agents/rules/hooks（各一個 smartSelect）
  const globalSelections = [
    { key: 'commands', title: '全局 Commands', pool: plan.global.commands },
    { key: 'agents', title: '全局 Agents', pool: plan.global.agents },
    { key: 'rules', title: '全局 Rules', pool: plan.global.rules },
  ]

  for (const sel of globalSelections) {
    const items = sel.pool.map(name => ({ value: name, label: name, hint: '' }))
    const selected = await smartSelect({
      title: sel.title,
      items,
      preselected: sel.pool,
      autoSelectThreshold: 0,
    })
    if (selected === BACK) return BACK
    plan.global[sel.key] = selected
  }

  // 6. 技術棧（如果 pipeline 有 tech-select 邏輯，這裡直接用預選）
  // 7. ECC 選擇
  if (plan.ecc.length > 0) {
    const eccItems = plan.ecc.map(name => ({ value: name, label: name, hint: '' }))
    const selectedEcc = await smartSelect({
      title: 'ECC 外部資源',
      items: eccItems,
      preselected: plan.ecc,
      autoSelectThreshold: 0,
    })
    if (selectedEcc === BACK) return BACK
    plan.ecc = selectedEcc
  }

  // 8. zsh 模組
  if (plan.zshModules.length > 0) {
    const zshItems = plan.zshModules.map(name => ({ value: name, label: name, hint: '' }))
    const selectedZsh = await smartSelect({
      title: 'zsh 模組',
      items: zshItems,
      preselected: plan.zshModules,
      autoSelectThreshold: 0,
    })
    if (selectedZsh === BACK) return BACK
    plan.zshModules = selectedZsh
  }

  return plan
}
