/**
 * install-claude 步驟：安裝 commands / agents / rules / hooks 到 ~/.claude/
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs'
import path from 'path'
import { smartSelect } from '../ui/prompts.mjs'
import { runWithProgress, stripAnsi } from '../ui/progress.mjs'
import { discoverItems, countExisting, countFiles } from '../ui/files.mjs'
import { sumBy } from 'lodash-es'
import { selectItems, buildCmdArgs } from './common.mjs'
import { stageClaudePreview } from '../preview.mjs'

/**
 * Hooks 選擇：解析 hooks.json → 讓用戶選個別 hook
 */
async function selectHooks(repoDir, stepLabel, flagAll, session) {
  const hooksPath = path.join(repoDir, 'claude', 'hooks.json')
  if (!fs.existsSync(hooksPath)) return { selectedHooks: null, installHooks: false }

  try {
    const hooksData = JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
    const hookDescriptions = {
      'PostToolUse:Edit|Write': { label: '自動格式化', hint: '寫檔後自動 prettier / php -l' },
      'PreToolUse:Edit|Write': { label: '檔案保護', hint: '阻止修改 .env、lock 等受保護檔案' },
      'PreToolUse:Bash': { label: '危險命令攔截', hint: '阻止 rm -rf /、force push main 等' },
      'SessionStart:compact': { label: 'Context 壓縮提示', hint: '壓縮時提醒保留重要資訊' },
      'Stop:': { label: '任務完成檢查', hint: '停止前檢查任務是否都完成了' },
    }

    const hookItems = []
    for (const [event, matchers] of Object.entries(hooksData.hooks || {})) {
      for (const m of matchers) {
        const key = `${event}:${m.matcher}`
        const desc = hookDescriptions[key] || { label: `${event} [${m.matcher || '*'}]`, hint: '' }
        hookItems.push({ value: key, label: desc.label, hint: desc.hint, event, matcher: m.matcher })
      }
    }

    if (hookItems.length === 0) return { selectedHooks: null, installHooks: false }

    if (flagAll) return { selectedHooks: hooksData, installHooks: true }

    const chosen = await smartSelect({
      title: `${stepLabel}Hooks（${hookItems.length} 個）`,
      items: hookItems,
      preselected: hookItems.map(i => i.value),
      session: session?.install?.hooks,
    })

    if (chosen.length === 0) return { selectedHooks: null, installHooks: false }

    // 建構篩選後的 hooks.json
    const filteredHooks = { description: hooksData.description, hooks: {} }
    const chosenSet = new Set(chosen)
    for (const [event, matchers] of Object.entries(hooksData.hooks || {})) {
      const kept = matchers.filter(m => chosenSet.has(`${event}:${m.matcher}`))
      if (kept.length > 0) filteredHooks.hooks[event] = kept
    }
    return { selectedHooks: filteredHooks, installHooks: true }
  } catch {
    return { selectedHooks: null, installHooks: false }
  }
}

/**
 * install-claude 主流程
 */
export async function handleInstallClaude(repoDir, previewDir, step, stepLabel, flagAll, manual = false, skillIds = [], session = null) {
  const selected = {}

  // 選擇 commands / agents / rules（使用 smartSelect）
  for (const [key, def] of Object.entries(step.selectable || {})) {
    selected[key] = await selectItems(repoDir, def, key, {
      stepLabel,
      flagAll,
      sessionValues: session?.install?.[key],
    })
    if (selected[key]?.length) p.log.success(`${stepLabel}${def.selectLabel || key}：${selected[key].length} 個`)
  }

  // hooks 選擇
  let selectedHooks = null
  let installHooks = false
  if (step.hooksConfirm && (step.fixed?.hooks || false)) {
    const result = await selectHooks(repoDir, stepLabel, flagAll, session)
    selectedHooks = result.selectedHooks
    installHooks = result.installHooks
  }

  // 組裝 cmdArgs + 計算 total
  const { cmdArgs, total: selectableTotal } = buildCmdArgs(selected, step.selectable || {}, repoDir)
  let total = selectableTotal

  // rules（如果是 fixed）
  if (step.fixed?.rules) {
    let rulesArg = step.fixed.rules
    if (step.fixed.rules === 'all') {
      const ruleItems = discoverItems(repoDir, 'claude/rules', '.md')
      if (ruleItems.length > 0 && !flagAll) {
        const selectedRules = await smartSelect({
          title: `${stepLabel}Rules`,
          items: ruleItems,
          preselected: ruleItems.map(i => i.value),
          session: session?.install?.rules,
        })
        rulesArg = selectedRules.join(',')
        total += selectedRules.length
      } else {
        total += countFiles(repoDir, 'claude/rules')
      }
    } else {
      total += rulesArg.split(',').length
    }
    cmdArgs.push(`--rules "${rulesArg}"`)
  }

  if (installHooks) {
    cmdArgs.push('--hooks')
    total += 1 // hooks.json 是一個檔案，安裝腳本只產生一行進度
  }
  if (total === 0) return

  // 摘要
  const hooksLabel = installHooks
    ? ` · ${selectedHooks ? sumBy(Object.values(selectedHooks.hooks || {}), 'length') : ''} hooks`
    : ''
  const summaryParts = []
  if (selected.commands?.length) summaryParts.push(`${selected.commands.length} commands`)
  if (selected.agents?.length) summaryParts.push(`${selected.agents.length} agents`)
  if (step.fixed?.rules || selected.rules?.length) summaryParts.push('rules')

  // 生成 preview
  stageClaudePreview(repoDir, previewDir, step, selected, selectedHooks || installHooks, skillIds)

  // 顯示檔案清單（和生成提示合併為一次輸出，避免空行）
  const allItems = [
    ...(selected.commands || []).map(n => `commands/${n}.md`),
    ...(selected.agents || []).map(n => `agents/${n}.md`),
    ...(selected.rules || []).map(n => `rules/${n}.md`),
  ]
  if (step.fixed?.rules) {
    const rulesDir = path.join(repoDir, 'claude/rules')
    if (fs.existsSync(rulesDir)) {
      allItems.push(...fs.readdirSync(rulesDir).filter(f => f.endsWith('.md')).map(f => `rules/${f}`))
    }
  }
  if (installHooks && selectedHooks) {
    const hookDesc = { 'PostToolUse:Edit|Write': '自動格式化', 'PreToolUse:Edit|Write': '檔案保護', 'PreToolUse:Bash': '危險命令攔截', 'SessionStart:compact': 'Context 壓縮提示', 'Stop:': '任務完成檢查' }
    for (const [event, matchers] of Object.entries(selectedHooks.hooks || {})) {
      for (const m of matchers) {
        const key = `${event}:${m.matcher}`
        allItems.push(`hooks/${hookDesc[key] || event + ' [' + (m.matcher || '*') + ']'}`)
      }
    }
  } else if (installHooks) {
    allItems.push('hooks.json')
  }
  const fileLines = allItems.map((item, i) =>
    `  ${pc.green('✔')} ${pc.dim(`[${i + 1}/${allItems.length}]`)} ${item}`
  ).join('\n')
  p.log.info(`${stepLabel}生成 ${summaryParts.join(' · ')}${hooksLabel} → dist/preview/claude/\n${fileLines}`)

  if (manual) {
    p.log.success(`${stepLabel}✔ 已生成 → dist/preview/claude/`)
    return
  }

  // 執行安裝
  for (const [key, values] of Object.entries(selected)) {
    if (values?.some(v => /[;&|`$]/.test(v))) {
      throw new Error(`Invalid characters in ${key} selection`)
    }
  }
  p.log.info(`${stepLabel}安裝 ${summaryParts.join(' · ')}${hooksLabel} → ~/.claude/`)
  await runWithProgress(`${step.script} ${cmdArgs.join(' ')}`, {
    cwd: repoDir,
    total,
    initStatus: '初始化...',
    parseProgress(line) {
      const m = line.match(/^\s+[✅─⚠]\s+(\S+)/)
      return m ? m[1].trim() : null
    },
  })
  p.log.success(`${stepLabel}✔ ${summaryParts.join(' · ')}${hooksLabel} 已安裝`)

  return {
    commands: selected.commands || [],
    agents: selected.agents || [],
    rules: step.fixed?.rules === 'all' ? [] : (step.fixed?.rules?.split(',') || []),
    hooks: selectedHooks ? Object.keys(selectedHooks.hooks || {}).flatMap(e => selectedHooks.hooks[e].map(m => `${e}:${m.matcher}`)) : [],
  }
}
