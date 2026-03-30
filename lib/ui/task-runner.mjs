/**
 * listr2 封裝 — 任務列表 + 子任務 + 並行 + 計時
 *
 * 取代 ora spinner + cli-progress，統一所有進度顯示。
 */

import { Listr } from 'listr2'
import * as p from '@clack/prompts'
import pc from 'picocolors'

/**
 * 階段標題 — 使用 @clack 保持左側流程線一致
 */
export function phaseHeader(title, step, total) {
  const prefix = step ? `Step ${step}/${total} — ` : ''
  p.log.step(`${prefix}${title}`)
}

/**
 * 建立順序任務列表
 *
 * @param {Array<{ title, task, skip?, enabled? }>} tasks
 * @param {Object} [opts]
 * @returns {Listr}
 */
export function createTaskList(tasks, opts = {}) {
  return new Listr(tasks, {
    concurrent: false,
    exitOnError: false,
    rendererOptions: {
      showTimer: true,
      collapseSubtasks: false,
      showSubtasks: true,
      suffixSkips: true,
      ...opts.rendererOptions,
    },
    ...opts,
  })
}

/**
 * 建立並行任務列表
 */
export function createConcurrentTasks(tasks, opts = {}) {
  return new Listr(tasks, {
    concurrent: true,
    exitOnError: false,
    rendererOptions: {
      showTimer: true,
      collapseSubtasks: false,
      ...opts.rendererOptions,
    },
    ...opts,
  })
}
