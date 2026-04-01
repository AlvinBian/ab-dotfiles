/**
 * Phase: 安裝計畫展示 + 確認/調整/精簡
 *
 * 用 p.log.info 展示完整安裝計畫，讓用戶選擇安裝方式：
 *   - 安裝全部（直接執行）
 *   - 逐項確認（展開 detailConfirm 子流程）
 *   - 精簡安裝（只裝核心必需品）
 *   - 上一步（返回 BACK symbol）
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs'
import path from 'path'
import { cloneDeep, countBy } from 'lodash-es'
import { handleCancel, smartSelect, BACK } from '../cli/prompts.mjs'
import { generateMinimalPlan } from '../config/auto-plan.mjs'
import { descBullet } from '../config/descriptions.mjs'

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

  }

  // 網格排列：固定列寬，每行多個項目
  const grid = (items, cols = 4, colWidth = 18, indent = '   ') => {
    const rows = []
    for (let i = 0; i < items.length; i += cols) {
      const row = items.slice(i, i + cols).map(s => s.padEnd(colWidth)).join('')
      rows.push(`${indent}${row.trimEnd()}`)
    }
    return rows
  }
  // 短列表 inline
  const inline = (items, max = 8) => {
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

    lines.push(`現有 ~/.claude/：${parts.join(' · ')}${extras.length ? ` · ${extras.join(' · ')}` : ''}`)
  }
  if (plan.profile) {
    lines.push(`${plan.profile.role || '開發者'} — ${plan.profile.coreSkills?.join(' · ') || ''}`)
  }
  lines.push('')

  // 1. Repos — 按組織分組
  lines.push(`1. Repos（${plan.mainCount} ⭐主力 · ${plan.tempCount} 🔄臨時${plan.toolCount ? ` · ${plan.toolCount} 🔧工具` : ''}）`)
  const byOrg = {}
  for (const r of plan.repos) {
    const org = r.fullName.split('/')[0]
    if (!byOrg[org]) byOrg[org] = []
    byOrg[org].push(r)
  }
  for (const [org, repos] of Object.entries(byOrg)) {
    lines.push(`   ${org}`)
    for (const r of repos) {
      const icon = r.role === 'main' ? '⭐' : r.role === 'tool' ? '🔧' : '🔄'
      const loc = r.localPath ? `~/${path.relative(HOME, r.localPath)}` : '未找到'
      lines.push(`     ${icon} ${r.fullName.split('/')[1]}  ${loc}`)
    }
  }

  // 2. 全局配置（grid 排列）
  lines.push(`2. 全局配置 → ~/.claude/`)
  lines.push(`   Commands（${g.commands.length}）`)
  lines.push(...grid(g.commands))
  lines.push(`   Agents（${g.agents.length}）`)
  lines.push(...grid(g.agents))
  lines.push(`   Rules（${g.rules.length}）`)
  lines.push(...grid(g.rules, 3, 24))
  lines.push(`   Hooks（${g.hooks.length}）`)
  const hookNames = g.hooks.map(h => (h.match(/\((.+)\)/) || ['', h])[1])
  lines.push(...grid(hookNames, 4, 16))
  lines.push(`   Permission（${g.permissions.allow.length} allow · ${g.permissions.deny.length} deny）`)
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

  // 4. Stacks（分類 + grid）
  if (plan.techStacks.length > 0) {
    const categorized = plan._pipelineResult?.categorizedTechs
    if (categorized instanceof Map && categorized.size > 0) {
      lines.push(`4. 技術棧（${plan.techStacks.length} 個，${categorized.size} 類）`)
      for (const [cat, techMap] of categorized) {
        const techs = [...techMap.keys()]
        lines.push(`   ${cat}（${techs.length}）：${techs.join('、')}`)
      }
    } else {
      lines.push(`4. 技術棧（${plan.techStacks.length}）`)
      lines.push(...grid(plan.techStacks, 5, 16))
    }
  }

  // 5. ECC（帶描述，按 type 分組）
  if (plan.ecc.length > 0) {
    // 從 fetchedSources 或本地目錄判斷 type
    const eccTypeMap = plan._fetchedSources?.eccTypeMap || {}
    const eccByType = { commands: [], agents: [], rules: [] }
    for (const name of plan.ecc) {
      const clean = name.replace('.md', '')
      const type = eccTypeMap[clean]
        || (fs.existsSync(path.join(claudeDir, 'agents', `${clean}.md`)) ? 'agents' : null)
        || (fs.existsSync(path.join(claudeDir, 'rules', `${clean}.md`)) ? 'rules' : null)
        || 'commands'
      eccByType[type].push(clean)
    }
    lines.push(`5. ECC 外部資源（${plan.ecc.length} 個）`)
    if (eccByType.commands.length) {
      lines.push(`   5.1 Commands（${eccByType.commands.length}）`)
      lines.push(...eccByType.commands.map(n => descBullet(n, 'commands', claudeDir)))
    }
    if (eccByType.agents.length) {
      lines.push(`   5.2 Agents（${eccByType.agents.length}）`)
      lines.push(...eccByType.agents.map(n => descBullet(n, 'agents', claudeDir)))
    }
    if (eccByType.rules.length) {
      lines.push(`   5.3 Rules（${eccByType.rules.length}）`)
      lines.push(...eccByType.rules.map(n => descBullet(n, 'rules', claudeDir)))
    }
  }

  // 6. zsh（帶描述）
  if (plan.zshModules.length > 0) {
    lines.push(`6. ZSH 模組（${plan.zshModules.length}）`)
    lines.push(...plan.zshModules.map(m => descBullet(m, null, null)))
  }

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
  if (!existing.hasHooks) changes.push('+hooks')
  else changes.push('合併 hooks')
  lines.push('')
  lines.push(`變更：${changes.join(' · ')} · AI ~$${plan.aiCost.total.toFixed(2)}`)

  p.log.info(`安裝計畫\n${lines.join('\n')}`)

  // 選擇
  const action = handleCancel(await p.select({
    message: '安裝方式',
    options: [
      { value: 'full', label: '✅ 安裝全部', hint: '推薦' },
      { value: 'detail', label: '📋 逐項確認', hint: '展開各類別的選擇' },
      { value: 'minimal', label: '⚡ 精簡安裝', hint: '只裝核心必需品（code-review + pr-workflow + coder + reviewer + debugger）' },
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
 *
 * 讓用戶逐步調整計畫中的各個項目：
 *   1. 調整各 repo 的角色（main/temp）
 *   2. 選擇全局 commands / agents / rules
 *   3. 選擇 ECC 外部資源
 *   4. 選擇 ZSH 模組
 *
 * @param {Object} originalPlan - 原始計畫（不直接修改，使用 cloneDeep 複製）
 * @returns {Promise<Object|symbol>} 調整後的計畫，或 BACK symbol
 */
async function detailConfirm(originalPlan) {
  // _pipelineResult 含 Map 物件，cloneDeep 會損壞 Map，先取出再還原
  const savedPipelineResult = originalPlan._pipelineResult
  const savedFetchedSources = originalPlan._fetchedSources
  // 深拷貝避免 BACK 時污染 cache 中的原始 plan
  const plan = cloneDeep(originalPlan)
  plan._pipelineResult = savedPipelineResult
  plan._fetchedSources = savedFetchedSources
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
    if (mainSet.has(r.fullName)) {
      r.role = 'main'
    } else if (r.role !== 'tool') {
      r.role = 'temp'
    }
    // tool repos keep their role unchanged
  }

  // 2-5. 全局 commands/agents/rules/hooks（各一個 smartSelect）
  const globalSelections = [
    { key: 'commands', title: '📟 全局 Commands', pool: plan.global.commands },
    { key: 'agents', title: '🤖 全局 Agents', pool: plan.global.agents },
    { key: 'rules', title: '📐 全局 Rules', pool: plan.global.rules },
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
      title: '🔗 ECC 外部資源',
      items: eccItems,
      preselected: plan.ecc,
      autoSelectThreshold: 0,
    })
    if (selectedEcc === BACK) return BACK
    plan.ecc = selectedEcc
  }

  // 8. ZSH 模組
  if (plan.zshModules.length > 0) {
    const zshItems = plan.zshModules.map(name => ({ value: name, label: name, hint: '' }))
    const selectedZsh = await smartSelect({
      title: '🐚 ZSH 模組',
      items: zshItems,
      preselected: plan.zshModules,
      autoSelectThreshold: 0,
    })
    if (selectedZsh === BACK) return BACK
    plan.zshModules = selectedZsh
  }

  return plan
}
