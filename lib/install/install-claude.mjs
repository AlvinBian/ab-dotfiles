/**
 * install-claude 步驟：安裝 commands / agents / rules / hooks 到 ~/.claude/
 *
 * 職責：
 *   1. 讓用戶選擇要安裝的 commands / agents / rules（smartSelect）
 *   2. 讓用戶選擇要啟用的個別 hooks（multiselect）
 *   3. 生成 dist/preview/claude/ 預覽檔案
 *   4. 非 manual 模式時執行安裝腳本，將檔案部署到 ~/.claude/
 */

import * as p from '@clack/prompts'
import fs from 'fs'
import { sumBy } from 'lodash-es'
import path from 'path'
import pc from 'picocolors'
import { countFiles, discoverItems } from '../cli/files.mjs'
import { stageClaudePreview } from '../cli/preview.mjs'
import { runWithProgress } from '../cli/progress.mjs'
import { BACK, smartSelect } from '../cli/prompts.mjs'
import { getDescription } from '../config/descriptions.mjs'
import { buildCmdArgs, selectItems } from './common.mjs'

/**
 * Hooks 選擇：解析 hooks.json → 讓用戶選個別 hook
 *
 * 從 claude/hooks.json 讀取所有 hook 定義，
 * 轉換為 smartSelect 可用的選項格式，讓用戶選擇要啟用的 hooks。
 * flagAll 模式下自動全選，不顯示互動選單。
 *
 * @param {string} repoDir - ab-dotfiles 根目錄
 * @param {string} stepLabel - 步驟前綴標籤（用於顯示）
 * @param {boolean} flagAll - 是否全自動安裝（跳過互動）
 * @param {Object|null} session - 上次 session（用於預選）
 * @returns {Promise<{ selectedHooks: Object|null, installHooks: boolean }>}
 *   selectedHooks: 篩選後的 hooks.json 資料（null 表示不安裝）
 *   installHooks: 是否安裝 hooks
 */
async function selectHooks(repoDir, stepLabel, flagAll, session) {
  const hooksPath = path.join(repoDir, 'claude', 'hooks.json')
  if (!fs.existsSync(hooksPath)) return { selectedHooks: null, installHooks: false }

  try {
    const hooksData = JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
    const hookItems = []
    for (const [event, matchers] of Object.entries(hooksData.hooks || {})) {
      for (const m of matchers) {
        const key = `${event}:${m.matcher}`
        // 從 descriptions.mjs 取描述，key 格式：'PostToolUse:Edit|Write (prettier)'
        const descKey = m.hooks?.[0]?.type === 'prompt' ? `${event} (${key.split(':')[1] || '*'})` : key
        const descText = getDescription(descKey) || getDescription(key)
        const desc = descText
          ? { label: descText, hint: `${event} [${m.matcher || '*'}]` }
          : { label: `${event} [${m.matcher || '*'}]`, hint: '' }
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

    if (chosen === BACK) return { selectedHooks: null, installHooks: false }
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
 *
 * 依序執行：選擇 commands/agents/rules → 選擇 hooks → 生成 preview → 執行安裝腳本。
 *
 * @param {string} repoDir - ab-dotfiles 根目錄
 * @param {string} previewDir - dist/preview 路徑
 * @param {Object} step - config.json 中的 step 定義
 * @param {string} stepLabel - 步驟前綴標籤（如 '[1/3] '）
 * @param {boolean} flagAll - 是否全自動安裝（跳過互動）
 * @param {boolean} [manual=false] - 是否為手動模式（只生成 preview，不部署）
 * @param {string[]} [skillIds=[]] - 要合併的技術棧 ID 列表（用於 skill 片段注入）
 * @param {Object|null} [session=null] - 上次 session（用於預選）
 * @returns {Promise<{ commands: string[], agents: string[], rules: string[], hooks: string[] } | undefined>}
 *   已安裝的各類型名稱列表，manual 模式返回 undefined
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
    if (selected[key] === BACK) return undefined
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
        if (selectedRules === BACK) return undefined
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
  if (total === 0) {
    p.log.warn(`${stepLabel}未選擇任何項目，跳過 Claude 安裝`)
    return
  }

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
    for (const [event, matchers] of Object.entries(selectedHooks.hooks || {})) {
      for (const m of matchers) {
        const key = `${event}:${m.matcher}`
        const hDesc = getDescription(key) || `${event} [${m.matcher || '*'}]`
        allItems.push(`hooks/${hDesc}`)
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

  // Gmail filter 初始化提示（僅當 chief-of-staff agent 被安裝時）
  const hasChiefOfStaff = (selected.agents || []).includes('chief-of-staff')
  if (hasChiefOfStaff && !flagAll) {
    p.log.info(
      `已安裝 chief-of-staff agent（Gmail / Slack / 多頻道通訊管理）\n` +
      `  若要設定 Gmail 自動分類，請依序執行：\n` +
      `  1. ${pc.cyan('npm install -g @google/clasp')}   # 安裝 Google Clasp CLI\n` +
      `  2. ${pc.cyan('clasp login')}                     # 授權 Google 帳號\n` +
      `  3. ${pc.cyan('clasp push')}                      # 上傳 scripts/gmail-filters-setup.gs\n` +
      `  4. 在 Apps Script 編輯器手動執行 ${pc.cyan('setupAllFilters')}`
    )
  }

  return {
    commands: selected.commands || [],
    agents: selected.agents || [],
    rules: step.fixed?.rules === 'all' ? [] : (step.fixed?.rules?.split(',') || []),
    hooks: selectedHooks ? Object.keys(selectedHooks.hooks || {}).flatMap(e => selectedHooks.hooks[e].map(m => `${e}:${m.matcher}`)) : [],
  }
}
