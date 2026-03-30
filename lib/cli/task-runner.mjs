/**
 * listr2 封裝 — 任務列表 + 子任務 + 並行 + 計時
 *
 * 取代 ora spinner + cli-progress，統一所有進度顯示。
 */

import { Listr } from 'listr2'
import * as p from '@clack/prompts'
import pc from 'picocolors'

/**
 * 輸出階段標題（使用 @clack p.log.step 保持左側流程線一致）
 *
 * @param {string} title - 階段名稱
 * @param {number|null} step - 當前步驟編號（null 時不顯示 Step x/y 前綴）
 * @param {number} total - 總步驟數
 * @returns {void}
 */
export function phaseHeader(title, step, total) {
  const prefix = step ? `Step ${step}/${total} — ` : ''
  p.log.step(`${prefix}${title}`)
}

/**
 * 建立循序執行的 Listr 任務列表
 *
 * 每個任務依序執行（concurrent: false），單一任務失敗不中止後續任務。
 * 預設顯示計時器與子任務。
 *
 * @param {Array<{ title: string, task: Function, skip?: Function, enabled?: Function }>} tasks - 任務定義列表
 * @param {Object} [opts={}] - 傳入 Listr 的額外選項（可覆蓋預設值）
 * @returns {Listr} 已配置的 Listr 實例（尚未執行，需呼叫 .run()）
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
 * 建立並行執行的 Listr 任務列表
 *
 * 所有任務同時啟動（concurrent: true），適用於互不依賴的獨立任務。
 * 單一任務失敗不影響其他並行任務。
 *
 * @param {Array<{ title: string, task: Function, skip?: Function, enabled?: Function }>} tasks - 任務定義列表
 * @param {Object} [opts={}] - 傳入 Listr 的額外選項（可覆蓋預設值）
 * @returns {Listr} 已配置的 Listr 實例（尚未執行，需呼叫 .run()）
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
