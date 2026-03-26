/**
 * 安裝步驟處理器
 *
 * 職責：
 *   執行 config.json 中定義的各種安裝步驟（step types）：
 *   - install-claude：安裝 commands / agents / rules / hooks 到 ~/.claude/
 *   - build-plugin：打包 .plugin 檔案到 dist/release/
 *   - install-modules：安裝 zsh 模組到 ~/.zsh/modules/
 *
 * 每個 handler 的流程：
 *   1. 讓用戶選擇要安裝的項目（除非 flagAll）
 *   2. 生成 preview 到 dist/preview/
 *   3. 顯示生成的檔案清單
 *   4. 如果是自動模式，執行安裝腳本並追蹤進度
 *
 * 依賴：lib/ui.mjs、lib/preview.mjs、lib/skill-detect.mjs
 */

import * as p from '@clack/prompts'
import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import pc from 'picocolors'
import fs from 'fs'
import path from 'path'
import { stripAnsi, handleCancel, multiselectWithAll, runWithProgress, discoverItems, countExisting, countFiles } from './ui.mjs'
import { stageClaudePreview, stageModulesPreview } from './preview.mjs'

/**
 * install-claude 步驟：安裝 Claude Code 的 commands / agents / rules / hooks
 *
 * @param {string} repoDir - 專案根目錄
 * @param {string} previewDir - dist/preview 路徑
 * @param {Object} step - config.json 中的 step 定義
 * @param {string} stepLabel - 進度前綴（如 '[1/3] '）
 * @param {boolean} flagAll - 是否全選模式
 * @param {boolean} [manual=false] - 是否手動模式（只生成 preview 不安裝）
 * @param {string[]} [skillIds=[]] - 要合併的技能 ID 列表
 */
export async function handleInstallClaude(repoDir, previewDir, step, stepLabel, flagAll, manual = false, skillIds = []) {
  const selected = {}
  let installHooks = false

  // 讓用戶選擇 commands / agents
  for (const [key, def] of Object.entries(step.selectable || {})) {
    const items = discoverItems(repoDir, def.dir, def.ext, def.filter)
    if (items.length === 0) continue
    selected[key] = flagAll
      ? items.map(i => i.value)
      : await multiselectWithAll({
          message: `${stepLabel}${def.selectLabel || key}`,
          options: items,
        })
  }

  // hooks 確認
  if (step.hooksConfirm && (step.fixed?.hooks || false)) {
    installHooks = flagAll
      ? true
      : handleCancel(await p.confirm({
          message: `${stepLabel}安裝 Hooks？ Y 確認 · n 跳過`,
          initialValue: true,
        }))
  }

  // 計算安裝項目總數
  let total = 0
  const cmdArgs = []

  if (selected.commands?.length) {
    total += countExisting(repoDir, step.selectable.commands.dir, selected.commands, step.selectable.commands.ext)
    cmdArgs.push(`--commands "${selected.commands.join(',')}"`)
  }
  if (selected.agents?.length) {
    total += countExisting(repoDir, step.selectable.agents.dir, selected.agents, step.selectable.agents.ext)
    cmdArgs.push(`--agents "${selected.agents.join(',')}"`)
  }

  // rules 選擇
  if (step.fixed?.rules) {
    let rulesArg = step.fixed.rules
    if (step.fixed.rules === 'all') {
      const ruleItems = discoverItems(repoDir, 'claude/rules', '.md')
      if (ruleItems.length > 0 && !flagAll) {
        const selectedRules = await multiselectWithAll({
          message: `${stepLabel}Rules`,
          options: ruleItems,
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

  if (installHooks) { cmdArgs.push('--hooks'); total += 1 }
  if (total === 0) return

  // 摘要
  const hooksLabel = installHooks ? ' · hooks' : ''
  const summaryParts = []
  if (selected.commands?.length) summaryParts.push(`${selected.commands.length} commands`)
  if (selected.agents?.length) summaryParts.push(`${selected.agents.length} agents`)
  if (step.fixed?.rules) summaryParts.push('rules')

  // 生成 preview
  p.log.info(`${stepLabel}生成 ${summaryParts.join(' · ')}${hooksLabel} → dist/preview/claude/`)
  stageClaudePreview(repoDir, previewDir, step, selected, installHooks, skillIds)

  // 顯示生成的檔案清單（一次性輸出避免空行）
  const allItems = [
    ...(selected.commands || []).map(n => `commands/${n}.md`),
    ...(selected.agents || []).map(n => `agents/${n}.md`),
  ]
  if (step.fixed?.rules) {
    const rulesDir = path.join(repoDir, 'claude/rules')
    if (fs.existsSync(rulesDir)) {
      allItems.push(...fs.readdirSync(rulesDir).filter(f => f.endsWith('.md')).map(f => `rules/${f}`))
    }
  }
  if (installHooks) allItems.push('hooks.json')
  if (allItems.length > 0) {
    p.log.message(allItems.map((item, i) =>
      `  ${pc.green('✔')} ${pc.dim(`[${i + 1}/${allItems.length}]`)} ${item}`
    ).join('\n'))
  }

  if (manual) {
    p.log.success(`${stepLabel}✔ 已生成 → dist/preview/claude/`)
    return
  }

  // 執行安裝腳本
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
}

/**
 * build-plugin 步驟：打包 .plugin 檔案
 *
 * 追蹤 shell script 輸出中的 phase 標記，
 * 收集後一次性顯示（避免 clack 空行問題）。
 *
 * @param {string} repoDir - 專案根目錄
 * @param {Object} step - config.json 中的 step 定義
 * @param {string} stepLabel - 進度前綴
 */
export async function handleBuildPlugin(repoDir, step, stepLabel) {
  const phases = step.phases || []
  const seen = new Set()
  const spinner = p.spinner()
  spinner.start(`${stepLabel}打包 plugin...`)

  try {
    const child = spawn(step.script, { shell: true, cwd: repoDir })
    let buf = ''
    const decoder = new StringDecoder('utf8')
    const completedPhases = []

    await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => {
        buf += decoder.write(chunk)
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          const clean = stripAnsi(line)
          for (const phase of phases) {
            if (seen.has(phase)) continue
            if (phase === '打包完成') {
              if (/✅.*打包完成/.test(clean)) seen.add(phase)
            } else if (clean.includes(phase)) {
              seen.add(phase)
              completedPhases.push(phase)
              // 更新 spinner 顯示當前 phase
              spinner.message(`${stepLabel}打包中... ${phase}`)
            }
          }
        }
      })
      child.stderr.on('data', () => {})
      child.on('close', code => code !== 0 ? reject(new Error(`exit ${code}`)) : resolve())
    })

    spinner.stop(`${stepLabel}✔ ${step.successMsg || '打包完成'}`)
    if (completedPhases.length > 0) {
      p.log.message(completedPhases.map(ph => `  ${pc.green('✔')} ${ph}`).join('\n'))
    }
  } catch (e) {
    p.log.warn(`${stepLabel}打包失敗：${e.message.slice(0, 60)}`)
  }
}

/**
 * install-modules 步驟：安裝 zsh 模組 + brew 工具
 *
 * @param {string} repoDir - 專案根目錄
 * @param {string} previewDir - dist/preview 路徑
 * @param {Object} step - config.json 中的 step 定義
 * @param {string} stepLabel - 進度前綴
 * @param {boolean} flagAll - 是否全選模式
 * @param {boolean} [manual=false] - 是否手動模式
 */
export async function handleInstallModules(repoDir, previewDir, step, stepLabel, flagAll, manual = false) {
  const def = Object.values(step.selectable)[0]
  const key = Object.keys(step.selectable)[0]
  const items = discoverItems(repoDir, def.dir, def.ext)
  if (items.length === 0) return

  const selectedModules = flagAll
    ? items.map(i => i.value)
    : await multiselectWithAll({
        message: `${stepLabel}${def.selectLabel || key}`,
        options: items,
      })
  if (selectedModules.length === 0) return

  // 計算 total（brew 工具 + modules + .zshrc + .ripgreprc）
  const extra = step.extraTotal || {}
  const needsBrew = selectedModules.some(m => ['fzf', 'tools', 'git', 'plugins'].includes(m))
  const brewToolCount = needsBrew ? 11 : 0
  let total = brewToolCount + selectedModules.length + (extra.base || 0)
  for (const [mod, count] of Object.entries(extra.ifModule || {})) {
    if (selectedModules.includes(mod)) total += count
  }

  // 生成 preview
  p.log.info(`${stepLabel}生成 ${selectedModules.length}/${items.length} 個 ${key} → dist/preview/zsh/`)
  stageModulesPreview(repoDir, previewDir, step, selectedModules)

  // 顯示生成的檔案
  const moduleItems = [...selectedModules.map(m => `modules/${m}.zsh`), 'zshrc']
  if (moduleItems.length > 0) {
    p.log.message(moduleItems.map((item, i) =>
      `  ${pc.green('✔')} ${pc.dim(`[${i + 1}/${moduleItems.length}]`)} ${item}`
    ).join('\n'))
  }

  if (manual) {
    p.log.success(`${stepLabel}✔ 已生成 → dist/preview/zsh/`)
    return
  }

  // 執行安裝腳本
  p.log.info(`${stepLabel}安裝 ${selectedModules.length}/${items.length} 個 ${key} → ~/.zsh/modules/`)
  await runWithProgress(`${step.script} --modules "${selectedModules.join(',')}"`, {
    cwd: repoDir,
    total,
    initStatus: '初始化...',
    parseProgress(line) {
      if (/^\s+[✔▶⚠]\s+\S+\s+已安裝/.test(line)) return `${line.match(/[✔▶⚠]\s+(\S+)/)?.[1] || 'brew'} ✓`
      if (/^\s+[✔▶⚠]\s+\S+\s+(安裝完成|安裝失敗)/.test(line)) return `${line.match(/[✔▶⚠]\s+(\S+)/)?.[1] || 'brew'} 安裝完成`
      if (line.includes('安裝 Homebrew CLI 工具')) return { statusOnly: true, label: '安裝 brew 工具...' }
      if (/^\s+[✔▶⚠]\s+\S+\.zsh(?!\S)/.test(line)) return line.match(/(\S+\.zsh)/)?.[1] ?? 'module'
      if (/✔\s+~\/.zshrc/.test(line)) return '~/.zshrc'
      if (/✔\s+~\/.ripgreprc/.test(line)) return '~/.ripgreprc'
      return null
    },
  })
  p.log.success(`${stepLabel}✔ ${selectedModules.length} 個 ${key} 已安裝：${selectedModules.join('、')}`)
}

/**
 * 通用 target 執行器
 *
 * 依序執行 config.json 中 target 的所有 steps，
 * 根據 step.type 分派到對應的 handler。
 *
 * @param {string} repoDir - 專案根目錄
 * @param {string} previewDir - dist/preview 路徑
 * @param {string} key - target key（如 'claude-dev'）
 * @param {Object} def - target 定義（來自 config.json）
 * @param {Object} ctx - 執行上下文
 * @param {string[]} ctx.selectedTargets - 所有選中的 target keys
 * @param {Set} ctx.completed - 已完成的 target keys
 * @param {boolean} ctx.flagAll - 全選模式
 * @param {boolean} ctx.manual - 手動模式
 * @param {string[]} ctx.skillIds - 技能 ID 列表
 */
export async function runTarget(repoDir, previewDir, key, def, ctx) {
  const idx = ctx.selectedTargets.indexOf(key) + 1
  const total = ctx.selectedTargets.length
  const prefix = total > 1 ? `[${idx}/${total}] ` : ''

  p.log.info(`${prefix}${def.label || key}`)

  for (const step of def.steps) {
    if (step.skipIf && ctx.completed.has(step.skipIf)) continue

    switch (step.type) {
      case 'install-claude':
        await handleInstallClaude(repoDir, previewDir, step, prefix, ctx.flagAll, ctx.manual, ctx.skillIds)
        break
      case 'build-plugin':
        await handleBuildPlugin(repoDir, step, prefix)
        break
      case 'install-modules':
        await handleInstallModules(repoDir, previewDir, step, prefix, ctx.flagAll, ctx.manual)
        break
      default:
        p.log.warn(`  未知的 step type: ${step.type}`)
    }
  }
}
