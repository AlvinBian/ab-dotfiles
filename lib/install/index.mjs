/**
 * 安裝步驟統一入口 — runTarget dispatcher
 *
 * 向後兼容：原本從 lib/install-handlers.mjs import 的 runTarget 現在從這裡取得
 */

import * as p from '@clack/prompts'
import { handleInstallClaude } from './install-claude.mjs'
import { handleInstallModules } from './install-modules.mjs'
import { handleBuildPlugin } from './build-plugin.mjs'

/**
 * 通用 target 執行器
 *
 * 依序執行 config.json 中 target 的所有 steps，
 * 根據 step.type 分派到對應的 handler。
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
export { handleInstallClaude } from './install-claude.mjs'
export { handleInstallModules } from './install-modules.mjs'
export { handleBuildPlugin } from './build-plugin.mjs'
