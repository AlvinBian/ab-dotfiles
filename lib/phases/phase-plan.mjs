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

  // 列表項 bullet 展示（帶描述）
  const cd = claudeDir
  const bullet = (items, type, indent = '      ') => items.map(i => descBullet(i, type, cd, indent))

  // 組裝計畫（層級結構，不用 p.note 避免 CJK 寬度問題）
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

  // 畫像
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

  // 2. 全局配置
  lines.push(`2. 全局配置 → ~/.claude/`)
  lines.push(`   2.1 Commands（${g.commands.length}）`)
  lines.push(...bullet(g.commands, 'commands'))
  lines.push(`   2.2 Agents（${g.agents.length}）`)
  lines.push(...bullet(g.agents, 'agents'))
  lines.push(`   2.3 Rules（${g.rules.length}）`)
  lines.push(...bullet(g.rules, 'rules'))
  lines.push(`   2.4 Hooks（${g.hooks.length}）`)
  lines.push(`   2.5 Permission（${g.permissions.allow.length} allow · ${g.permissions.deny.length} deny）`)
  lines.push(`   2.6 快捷鍵（${Object.keys(g.keybindings).length}）· AutoMemory · ${g.settings.model}`)

  // 3. CLAUDE.md
  if (plan.projects.length > 0) {
    const mainPrj = plan.projects.filter(proj => proj.claudeMdType === 'full')
    const tempPrj = plan.projects.filter(proj => proj.claudeMdType === 'concise')
    lines.push(`3. CLAUDE.md → ~/.claude/projects/`)
    if (mainPrj.length) {
      lines.push(`   3.1 AI 生成（${mainPrj.length} 個⭐主力）`)
      lines.push(...bullet(mainPrj.map(pr => pr.repo.split('/')[1])))
    }
    if (tempPrj.length) {
      lines.push(`   3.2 靜態模板（${tempPrj.length} 個🔄臨時）`)
      lines.push(...bullet(tempPrj.map(pr => pr.repo.split('/')[1])))
    }
  }

  // 4. Stacks（按分類展示）
  if (plan.techStacks.length > 0) {
    const categorized = plan._pipelineResult?.categorizedTechs
    if (categorized instanceof Map && categorized.size > 0) {
      lines.push(`4. 技術棧（${plan.techStacks.length} 個）`)
      let si = 1
      for (const [cat, techMap] of categorized) {
        const techs = [...techMap.keys()]
        lines.push(`   4.${si} ${cat}（${techs.length}）`)
        lines.push(...bullet(techs))
        si++
      }
    } else {
      lines.push(`4. 技術棧（${plan.techStacks.length} 個）`)
      lines.push(...bullet(plan.techStacks))
    }
  }

  // 5. ECC
  if (plan.ecc.length > 0) {
    lines.push(`5. ECC 外部資源（${plan.ecc.length} 個）`)
  }

  // 6. zsh
  if (plan.zshModules.length > 0) {
    lines.push(`6. zsh 模組（${plan.zshModules.length}）`)
    lines.push(...bullet(plan.zshModules))
  }

  // 變更摘要
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

  // 展示（用 p.log.info 避免 p.note 的 CJK 寬度問題）
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
