/**
 * 互動元件 — handleCancel、applyPreviousSelection、multiselectWithAll、smartSelect
 *
 * 導航：
 *   ESC / Ctrl+C → 顯示選單（上一步 / 重新開始 / 退出）
 *   smartSelect 選單含 ← 上一步
 *   返回 BACK symbol 表示回退
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'

/** 回退信號 — phase 收到此值應回退到上一步 */
export const BACK = Symbol('back')

// Ctrl+C → 直接退出（不走 @clack 的 isCancel）
process.on('SIGINT', () => {
  console.log()
  p.cancel('已取消安裝')
  process.exit(0)
})

/**
 * 處理 clack prompt 的取消操作
 * ESC → 回退（上一步），Ctrl+C 由 SIGINT handler 直接退出
 */
export function handleCancel(value) {
  if (p.isCancel(value)) {
    // ESC 觸發 → 回退上一步
    return BACK
  }
  return value
}

/**
 * 根據上次選擇重新排序選項並設定預選值
 *
 * 將上次已選的選項移到列表最前方，其餘依原順序跟隨，
 * 同時返回 initialValues 以供 multiselect 預先勾選。
 *
 * @param {Array<{value: string, label: string, hint?: string}>} options - 完整選項列表
 * @param {string[]} [previousValues=[]] - 上次選中的 value 列表
 * @returns {{ sortedOptions: Array, initialValues: string[] }}
 */
export function applyPreviousSelection(options, previousValues = []) {
  if (!previousValues?.length) return { sortedOptions: options, initialValues: [] }
  const prevSet = new Set(previousValues)
  const selected = options.filter(o => prevSet.has(o.value))
  const rest = options.filter(o => !prevSet.has(o.value))
  return {
    sortedOptions: [...selected, ...rest],
    initialValues: selected.map(o => o.value),
  }
}

/**
 * 帶「全部選擇」選項的 multiselect（單一連續列表，@clack 自帶滾動）
 *
 * 在選項列表最前面注入「全部選擇」和「跳過」兩個特殊選項，
 * 用戶選中「全部選擇」時返回所有實際選項的 value；
 * 選中「跳過」時返回空陣列。
 *
 * @param {Object} opts
 * @param {string} opts.message - 提示訊息
 * @param {Array<{value: string, label: string, hint?: string}>} opts.options - 實際選項
 * @param {boolean} [opts.required=false] - 是否必選（true 時隱藏跳過選項）
 * @param {string[]} [opts.initialValues=[]] - 預先勾選的 value 列表
 * @returns {Promise<string[]|symbol>} 選中的 value 列表，取消時返回 BACK
 */
export async function multiselectWithAll({ message, options, required = false, initialValues = [] }) {
  const ALL_VALUE = '__all__'
  const SKIP_VALUE = '__skip__'

  // 截斷長 label 防止 terminal wrap 造成渲染錯亂
  const safeOptions = options.map(o => {
    const labelStr = typeof o.label === 'string' ? o.label : String(o.label)
    const hintStr = o.hint || ''
    if (labelStr.length + hintStr.length > 60) {
      return { ...o, label: labelStr.slice(0, 30), hint: hintStr.slice(0, 28) }
    }
    return o
  })

  const extraOpts = [
    { value: ALL_VALUE, label: `全部選擇  ${pc.dim('選中此項 = 全選')}` },
    ...(!required ? [{ value: SKIP_VALUE, label: `跳過  ${pc.dim('不選，進入下一步')}` }] : []),
  ]

  const result = await handleCancel(await p.multiselect({
    message: `${message}  Space 選擇 · ↑↓ 滾動 · Enter 確認`,
    options: [...extraOpts, ...safeOptions],
    required,
    initialValues: initialValues.length > 0 ? initialValues : undefined,
  }))
  if (result === BACK) return BACK
  if (result.includes(SKIP_VALUE)) return []
  if (result.includes(ALL_VALUE)) return safeOptions.map(o => o.value)
  return result
}

/**
 * Smart Select — 統一的「AI 預選 → 摘要 → 確認/調整/跳過」互動模式
 *
 * 所有選擇步驟的統一入口。支援：
 * - 少量項目自動全選（≤ 2 個）
 * - 有預選時顯示摘要 + 三選一（確認/調整/跳過）
 * - 調整時用 multiselectWithAll 進入多選
 * - session 作為預選的二級 fallback
 *
 * @param {Object} opts
 * @param {string} opts.title - 步驟標題
 * @param {Array<{value: string, label: string, hint?: string}>} opts.items - 選項列表
 * @param {string[]} [opts.preselected=[]] - 預選的 value 列表
 * @param {string[]} [opts.session=[]] - 上次選擇（fallback）
 * @param {boolean} [opts.required=false] - 是否禁止跳過
 * @param {Function} [opts.showSummary] - 自訂摘要 (preselected) => string
 * @param {boolean} [opts.autoSelectThreshold=2] - ≤ 此數量自動全選
 * @returns {Promise<string[]>} 選中的 value 列表
 */
export async function smartSelect({
  title,
  items,
  preselected = [],
  session = [],
  required = false,
  showSummary,
  autoSelectThreshold = 2,
}) {
  if (items.length === 0) return []

  // 少量項目自動全選
  if (items.length <= autoSelectThreshold) {
    const all = items.map(i => i.value)
    p.log.success(`${title}：${all.length} 個（自動全選）`)
    return all
  }

  // 決定預選來源：preselected > session > 空
  const effectivePreselected = preselected.length > 0
    ? preselected
    : (session?.length > 0 ? session.filter(v => items.some(i => i.value === v)) : [])

  const preCount = effectivePreselected.length
  const total = items.length

  // 顯示摘要（帶編號 + 繁中描述，合併為一次輸出避免空行）
  if (showSummary && preCount > 0) {
    p.log.info(showSummary(effectivePreselected))
  } else if (preCount > 0) {
    const preItems = items.filter(i => effectivePreselected.includes(i.value))
    const detailLines = preItems.map((item, idx) =>
      `  ${pc.dim(`${idx + 1}.`)} ${item.label}  ${pc.dim(item.hint || '')}`
    ).join('\n')
    p.log.info(`${title}（預選 ${preCount}/${total}）：\n${detailLines}`)
  }

  // 建構選項
  const options = []
  if (preCount > 0) {
    options.push({ value: 'accept', label: `確認預選 (${preCount})`, hint: '推薦' })
  }
  options.push({
    value: 'edit',
    label: preCount > 0 ? '調整選擇' : `選擇（${total} 個可選）`,
  })
  if (!required) {
    options.push({ value: 'skip', label: '跳過' })
  }
  options.push({ value: 'back', label: `← 上一步  ${pc.dim('ESC 也可以')}` })

  const action = await handleCancel(await p.select({ message: title, options }))
  if (action === BACK || action === 'back') return BACK

  if (action === 'skip') return []

  let result
  if (action === 'accept') {
    // 確認預選 — 摘要已顯示過，只需一行確認
    p.log.success(`${title}：${preCount} 個`)
    return effectivePreselected
  }

  // 調整模式 — 用 multiselectWithAll
  const { sortedOptions, initialValues } = applyPreviousSelection(
    items.map(i => ({ value: i.value, label: i.label, hint: i.hint })),
    effectivePreselected
  )
  result = await multiselectWithAll({ message: title, options: sortedOptions, initialValues, required })
  if (result === BACK) return BACK

  // 調整完成後顯示編號列表（合併為一次輸出）
  if (result.length > 0) {
    const selectedItems = result.map(v => items.find(i => i.value === v)).filter(Boolean)
    const lines = selectedItems.map((item, idx) =>
      `  ${pc.dim(`${idx + 1}.`)} ${item.label}  ${pc.dim(item.hint || '')}`
    ).join('\n')
    p.log.success(`${title}：${result.length} 個\n${lines}`)
  }

  return result
}
