/**
 * 安裝通用工具 — selectItems、buildCmdArgs
 *
 * 提供 install-claude 和 install-modules 共用的：
 *   - 項目發現 + smartSelect 選擇流程（selectItems）
 *   - 將選擇結果組裝成命令列參數（buildCmdArgs）
 */

import { smartSelect } from '../cli/prompts.mjs'
import { discoverItems, countExisting, countFiles } from '../cli/files.mjs'

/**
 * 通用選擇流程：發現項目 → smartSelect → 回傳選中清單
 *
 * @param {string} repoDir
 * @param {Object} def - { dir, ext, filter, selectLabel }
 * @param {string} key - 選項 key（如 'commands'）
 * @param {Object} opts
 * @param {string} opts.stepLabel
 * @param {boolean} opts.flagAll
 * @param {string[]} [opts.sessionValues] - 上次選擇
 * @param {string[]} [opts.preselected] - 預選（matchWhen 計算結果）
 * @returns {Promise<string[]>}
 */
export async function selectItems(repoDir, def, key, { stepLabel, flagAll, sessionValues, preselected }) {
  const items = discoverItems(repoDir, def.dir, def.ext, def.filter)
  if (items.length === 0) return []

  if (flagAll) return items.map(i => i.value)

  return smartSelect({
    title: `${stepLabel}${def.selectLabel || key}`,
    items,
    preselected: preselected || items.map(i => i.value),
    session: sessionValues,
  })
}

/**
 * 組裝 cmdArgs 和計算 total
 *
 * @param {Object} selected - { commands: [], agents: [], ... }
 * @param {Object} selectableDefs - step.selectable 定義
 * @param {string} repoDir
 * @returns {{ cmdArgs: string[], total: number }}
 */
export function buildCmdArgs(selected, selectableDefs, repoDir) {
  const cmdArgs = []
  let total = 0

  for (const [key, values] of Object.entries(selected)) {
    if (!values?.length || !selectableDefs[key]) continue
    const def = selectableDefs[key]
    total += countExisting(repoDir, def.dir, values, def.ext)
    cmdArgs.push(`--${key} "${values.join(',')}"`)
  }

  return { cmdArgs, total }
}

