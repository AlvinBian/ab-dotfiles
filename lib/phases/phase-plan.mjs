/**
 * Phase: 安裝計畫展示 + 確認/調整/精簡
 *
 * 用 p.note 展示安裝計畫，用戶選擇安裝模式。
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs'
import path from 'path'
import { cloneDeep, countBy } from 'lodash-es'
import { handleCancel, smartSelect, BACK } from '../ui/prompts.mjs'
import { generateMinimalPlan } from '../auto-plan.mjs'
import { descBullet } from '../descriptions.mjs'

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

  // inline 列表：名稱逗號連接，單行展示（摘要模式）
  const inline = (items, max = 6) => {
    if (items.length <= max) return items.join('、')
    return items.slice(0, max).join('、') + `… +${items.length - max}`
  }

  // 組裝計畫（摘要模式，細節在「逐項確認」中展開）
  const lines = []
  const g = plan.global

  // 現有狀態
  const existTotal = existing.commands.length + existing.agents.length + existing.rules.length
  if (existTotal > 0) {
    const parts = []
    if (existing.commands.length) parts.push(`${existing.commands.length} cmd`)
    if (existing.agents.length) parts.push(`${existing.agents.length} agent`)
    if (existing.rules.length) parts.push(`${existing.rules.length} rule`)
    const extras = []
    if (existing.hasSettings) extras.push('settings')
    if (existing.hasHooks) extras.push('hooks')
    if (existing.hasKeybindings) extras.push('keybindings')
    lines.push(`現有 ~/.claude/：${parts.join(' · ')}${extras.length ? ` · ${extras.join(' · ')}` : ''}`)
  }
  if (plan.profile) {
    lines.push(`${plan.profile.role || '開發者'} — ${plan.profile.coreSkills?.join(' · ') || ''}`)
  }
  lines.push('')

  // 1. Repos
  lines.push(`1. Repos（${plan.mainCount} ⭐主力 · ${plan.tempCount} 🔄臨時${plan.toolCount ? ` · ${plan.toolCount} 🔧工具` : ''}）`)
  for (const r of plan.repos) {
    const icon = r.role === 'main' ? '⭐' : r.role === 'tool' ? '🔧' : '🔄'
    const loc = r.localPath ? `~/${path.relative(HOME, r.localPath)}` : '未找到'
    lines.push(`   ${icon} ${r.fullName.split('/')[1]}  ${loc}`)
  }

  // 2. 全局配置（inline 摘要）
  lines.push(`2. 全局配置 → ~/.claude/`)
  lines.push(`   Commands（${g.commands.length}）：${inline(g.commands)}`)
  lines.push(`   Agents（${g.agents.length}）：${inline(g.agents)}`)
  lines.push(`   Rules（${g.rules.length}）：${inline(g.rules)}`)
  lines.push(`   Hooks（${g.hooks.length}）：${inline(g.hooks.map(h => (h.match(/\((.+)\)/) || ['', h])[1]), 5)}`)
  lines.push(`   Permission（${g.permissions.allow.length} allow · ${g.permissions.deny.length} deny）`)
  const kbNames = Object.entries(g.keybindings).map(([k, v]) => `${k}→${v}`).join('、')
  lines.push(`   快捷鍵（${Object.keys(g.keybindings).length}）：${kbNames}`)
  lines.push(`   Model: ${g.settings.model} · AutoMemory`)

  // 3. CLAUDE.md
  if (plan.projects.length > 0) {
    const mainPrj = plan.projects.filter(proj => proj.claudeMdType === 'full')
    const tempPrj = plan.projects.filter(proj => proj.claudeMdType === 'concise')
    const parts = []
    if (mainPrj.length) parts.push(`${mainPrj.length} AI 生成`)
    if (tempPrj.length) parts.push(`${tempPrj.length} 靜態模板`)
    lines.push(`3. CLAUDE.md（${parts.join(' + ')}）→ ~/.claude/projects/`)
  }

  // 4. Stacks（按分類 inline）
  if (plan.techStacks.length > 0) {
    const categorized = plan._pipelineResult?.categorizedTechs
    if (categorized instanceof Map && categorized.size > 0) {
      lines.push(`4. 技術棧（${plan.techStacks.length} 個，${categorized.size} 類）`)
      for (const [cat, techMap] of categorized) {
        const techs = [...techMap.keys()]
        lines.push(`   ${cat}（${techs.length}）：${inline(techs, 5)}`)
      }
    } else {
      lines.push(`4. 技術棧（${plan.techStacks.length}）：${inline(plan.techStacks, 8)}`)
    }
  }

  // 5. ECC
  if (plan.ecc.length > 0) lines.push(`5. ECC 外部資源（${plan.ecc.length} 個）`)

  // 6. zsh
  if (plan.zshModules.length > 0) lines.push(`6. zsh（${plan.zshModules.length}）：${inline(plan.zshModules, 10)}`)

  // 變更 + 費用（一行）
  const changes = []
  const newCmds = g.commands.filter(c => !existing.commands.includes(c))
  const newAgents = g.agents.filter(a => !existing.agents.includes(a))
  const newRules = g.rules.filter(r => !existing.rules.includes(r))
  if (newCmds.length) changes.push(`+${newCmds.length} cmd`)
  if (newAgents.length) changes.push(`+${newAgents.length} agent`)
  if (newRules.length) changes.push(`+${newRules.length} rule`)
  if (!existing.hasSettings) changes.push('+settings')
  else changes.push('合併 settings')
  if (!existing.hasKeybindings) changes.push('+keybindings')
  if (!existing.hasHooks) changes.push('+hooks')
  else changes.push('合併 hooks')
  lines.push('')
  lines.push(`變更：${changes.join(' · ')} · AI ~$${plan.aiCost.total.toFixed(2)}`)

  p.log.info(`安裝計畫\n${lines.join('\n')}`)

  // 選擇
  const action = handleCancel(await p.select({
    message: '安裝方式',
    options: [
      { value: 'full', label: '安裝全部', hint: '推薦' },
      { value: 'detail', label: '逐項確認', hint: '展開各類別的選擇' },
      { value: 'minimal', label: '精簡安裝', hint: '只裝核心必需品（code-review + pr-workflow + coder + reviewer + debugger）' },
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
async function detailConfirm(originalPlan) {
  // 深拷貝避免 BACK 時污染 cache 中的原始 plan
  const plan = cloneDeep(originalPlan)
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
