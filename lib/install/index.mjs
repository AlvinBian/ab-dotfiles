/**
 * 安裝步驟統一入口 — runTarget dispatcher
 *
 * 職責：
 *   依序執行 config.json 中 target 的所有 steps，
 *   根據 step.type 分派到對應的 handler：
 *     - install-claude → handleInstallClaude
 *     - install-modules → handleInstallModules
 *     - build-plugin → handleBuildPlugin
 */

import * as p from '@clack/prompts'
import { handleBuildPlugin } from './build-plugin.mjs'
import { handleInstallClaude } from './install-claude.mjs'
import { handleInstallModules } from './install-modules.mjs'

/**
 * 通用 target 執行器
 *
 * 依序執行 config.json 中 target 的所有 steps，
 * 根據 step.type 分派到對應的 handler。
 *
 * @param {string} repoDir - ab-dotfiles 根目錄
 * @param {string} previewDir - dist/preview 路徑
 * @param {string} key - target 鍵名（如 'claude-dev'、'zsh'）
 * @param {Object} def - config.json 中的 target 定義（含 label、steps）
 * @param {Object} ctx - 執行上下文
 * @param {string[]} ctx.selectedTargets - 本次選中的所有 target 鍵名（用於計算步驟編號）
 * @param {Set<string>} ctx.completed - 已完成的 target 集合（用於 skipIf 判斷）
 * @param {boolean} ctx.flagAll - 是否全自動安裝
 * @param {boolean} ctx.manual - 是否為手動模式
 * @param {string[]} ctx.skillIds - 技術棧 ID 列表（用於 skill 片段注入）
 * @param {Object|null} ctx.session - 上次 session
 * @returns {Promise<Object>} 各 step 的安裝結果合併物件
 */
export async function runTarget(repoDir, previewDir, key, def, ctx) {
  const idx = ctx.selectedTargets.indexOf(key) + 1
  const total = ctx.selectedTargets.length
  const prefix = total > 1 ? `[${idx}/${total}] ` : ''
  const installResults = {}

  p.log.info(`${prefix}${def.label || key}`)

  for (const step of def.steps) {
    if (step.skipIf && ctx.completed.has(step.skipIf)) continue

    switch (step.type) {
      case 'install-claude': {
        const result = await handleInstallClaude(repoDir, previewDir, step, prefix, ctx.flagAll, ctx.manual, ctx.skillIds, ctx.session)
        if (result) Object.assign(installResults, result)
        break
      }
      case 'build-plugin':
        await handleBuildPlugin(repoDir, step, prefix)
        break
      case 'install-modules': {
        const result = await handleInstallModules(repoDir, previewDir, step, prefix, ctx.flagAll, ctx.manual, ctx.session)
        if (result) Object.assign(installResults, result)
        break
      }
      default:
        p.log.warn(`  未知的 step type: ${step.type}`)
    }
  }

  return installResults
}

// Re-export individual handlers
export { handleBuildPlugin } from './build-plugin.mjs'
export { handleInstallClaude } from './install-claude.mjs'
export { handleInstallModules } from './install-modules.mjs'
