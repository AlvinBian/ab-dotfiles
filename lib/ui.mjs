/**
 * CLI UI 工具函數
 *
 * 職責：
 *   1. ANSI 清除 — 去除 shell 輸出中的 ANSI 色彩/控制碼
 *   2. 互動元件 — handleCancel、multiselectWithAll（帶「全部選擇」的 multiselect）
 *   3. 進度追蹤 — runWithProgress（實時解析子程序輸出，逐 item 顯示 spinner）
 *   4. 檔案發現 — discoverItems、countExisting、countFiles（掃描目錄中的可安裝項目）
 *
 * 依賴：@clack/prompts、picocolors、ora、child_process
 * 被 setup.mjs 和 install-handlers.mjs 使用
 */

import * as p from '@clack/prompts'
import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import pc from 'picocolors'
import ora from 'ora'
import fs from 'fs'
import path from 'path'

// ── ANSI 清除 ──────────────────────────────────────────────────
// 只匹配 ESC[ 開頭的 CSI 序列和 ESC] 開頭的 OSC 序列
// 不匹配 ESC(B 以避免吃掉中文括號
const ANSI_RE = /\x1B\[[0-9;?]*[A-HJKSTfhilmnsu]|\x1B\][^\x07]*\x07/g

/**
 * 移除字串中的 ANSI 控制碼和 \r
 * @param {string} s - 含 ANSI 碼的字串
 * @returns {string} 純文字字串
 */
export const stripAnsi = s => s.replace(ANSI_RE, '').replace(/\r/g, '')

// ── 互動元件 ──────────────────────────────────────────────────

/**
 * 處理 clack prompt 的取消操作（Ctrl+C / ESC）
 * 若用戶取消，印出訊息並結束程序
 *
 * @param {*} value - clack prompt 的返回值
 * @returns {*} 非取消時原樣返回
 */
export function handleCancel(value) {
  if (p.isCancel(value)) {
    p.cancel('已取消安裝')
    process.exit(0)
  }
  return value
}

/**
 * 帶「全部選擇」選項的 multiselect（自動分頁）
 *
 * 在選項列表最前面插入一個「全部選擇」項目，
 * 選中它等於選中所有真實選項。
 *
 * 超過 maxVisible 時自動分頁，避免長列表爆屏。
 *
 * @param {Object} opts
 * @param {string} opts.message - 提示訊息
 * @param {Array} opts.options - 選項陣列 [{value, label, hint}]
 * @param {boolean} [opts.required=false] - 是否必選至少一個
 * @param {Array} [opts.initialValues=[]] - 預選值
 * @param {number} [opts.maxVisible=20] - 超過此數量自動分頁
 * @returns {Promise<string[]>} 選中的 value 陣列
 */
export async function multiselectWithAll({ message, options, required = false, initialValues = [], maxVisible = 20 }) {
  // 不需要分頁的情況：直接顯示
  if (options.length <= maxVisible) {
    const ALL_VALUE = '__all__'
    const allOption = { value: ALL_VALUE, label: `全部選擇  ${pc.dim('選中此項 = 全選')}` }
    const result = handleCancel(await p.multiselect({
      message: `${message}  Space 選擇 · Enter 確認`,
      options: [allOption, ...options],
      required,
      initialValues: initialValues.length > 0 ? initialValues : undefined,
    }))
    return result.includes(ALL_VALUE) ? options.map(o => o.value) : result
  }

  // 需要分頁：按 maxVisible 分批顯示
  const initSet = new Set(initialValues)
  const allSelected = []
  const PAGE_SIZE = maxVisible
  const pages = Math.ceil(options.length / PAGE_SIZE)

  for (let page = 0; page < pages; page++) {
    const slice = options.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    const pageInit = slice.filter(o => initSet.has(o.value)).map(o => o.value)
    const pageLabel = pages > 1 ? ` (${page + 1}/${pages})` : ''

    const ALL_VALUE = '__all__'
    const allOption = { value: ALL_VALUE, label: `全部選擇  ${pc.dim('此頁全選')}` }
    const result = handleCancel(await p.multiselect({
      message: `${message}${pageLabel}  Space 選擇 · Enter 確認`,
      options: [allOption, ...slice],
      initialValues: pageInit.length > 0 ? pageInit : undefined,
    }))

    if (result.includes(ALL_VALUE)) {
      allSelected.push(...slice.map(o => o.value))
    } else {
      allSelected.push(...result)
    }

    // 最後一頁不需要問
    if (page < pages - 1) {
      const remaining = options.length - (page + 1) * PAGE_SIZE
      const continueMsg = remaining > 0 ? `還有 ${remaining} 項，繼續？` : '繼續瀏覽？'
      const more = handleCancel(await p.confirm({ message: continueMsg, initialValue: remaining > PAGE_SIZE }))
      if (!more) break
    }
  }

  return allSelected
}

// ── 進度追蹤 ──────────────────────────────────────────────────

/**
 * 執行外部命令並實時顯示逐 item 的 spinner 進度
 *
 * 解析子程序 stdout 的每一行，透過 parseProgress 回調判斷是否完成了一個 item。
 * 每完成一個 item，spinner 會 succeed 並開啟新的 spinner。
 *
 * parseProgress 返回值：
 *   - null：忽略此行
 *   - string：完成一個 item，使用該字串作為 label
 *   - { label: string }：同上
 *   - { statusOnly: true, label: string }：只更新 spinner 文字，不推進計數
 *
 * @param {string} cmd - 要執行的 shell 命令
 * @param {Object} opts
 * @param {string} [opts.cwd] - 工作目錄（預設 REPO 根目錄）
 * @param {number} opts.total - 預期的總 item 數
 * @param {string} [opts.initStatus='準備中...'] - 初始狀態文字
 * @param {Function} opts.parseProgress - 行解析回調 (cleanLine) => result
 * @returns {Promise<void>}
 */
export function runWithProgress(cmd, { cwd, total, initStatus = '準備中...', parseProgress }) {
  return new Promise((resolve, reject) => {
    let current = 0
    let spinner = ora({ text: `${pc.dim(`[0/${total}]`)} ${initStatus}`, indent: 2 }).start()

    const child = spawn(cmd, { shell: true, cwd })
    let buf = ''
    const stderrChunks = []
    const decoder = new StringDecoder('utf8')

    child.stdout.on('data', chunk => {
      buf += decoder.write(chunk)
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        const result = parseProgress(stripAnsi(line))
        if (result === null) continue
        if (typeof result === 'object' && result.statusOnly) {
          spinner.text = `${pc.dim(`[${current}/${total}]`)} ${result.label}`
        } else if (current < total) {
          current++
          const label = typeof result === 'string' ? result : result.label
          spinner.succeed(`${pc.dim(`[${current}/${total}]`)} ${label}`)
          if (current < total) {
            spinner = ora({ text: `${pc.dim(`[${current}/${total}]`)} ...`, indent: 2 }).start()
          }
        }
      }
    })
    child.stderr.on('data', chunk => { stderrChunks.push(chunk) })

    child.on('close', code => {
      if (code !== 0) {
        spinner.fail(`${pc.dim(`[${current}/${total}]`)} ${pc.red('失敗')}`)
        const stderr = Buffer.concat(stderrChunks).toString().trim()
        reject(new Error(`exit ${code}${stderr ? `\n${stderr}` : ''}`))
      } else {
        if (current < total) {
          spinner.succeed(`${pc.dim(`[${total}/${total}]`)} 完成`)
        }
        resolve()
      }
    })
  })
}

// ── 檔案發現 ──────────────────────────────────────────────────

/**
 * 自動發現目錄中的可安裝項目
 *
 * 掃描指定目錄，為每個檔案提取 label 和 hint：
 * - .md 檔案：從 YAML frontmatter 的 description 欄位取 hint
 * - .zsh 檔案：從首行 # ── ... ── 註解取 hint
 *
 * @param {string} repoDir - 專案根目錄絕對路徑
 * @param {string} dir - 相對於 repoDir 的目錄路徑
 * @param {string} [ext='.md'] - 檔案副檔名
 * @param {string[]|null} [filter=null] - 白名單（null = 不過濾）
 * @returns {Array<{value: string, label: string, hint: string}>}
 */
export function discoverItems(repoDir, dir, ext = '.md', filter = null) {
  const fullDir = path.join(repoDir, dir)
  if (!fs.existsSync(fullDir)) return []
  let files = fs.readdirSync(fullDir).filter(f => f.endsWith(ext))
  if (filter) {
    const allowed = new Set(filter)
    files = files.filter(f => allowed.has(f.slice(0, -ext.length)))
  }
  return files.map(f => {
    const name = f.slice(0, -ext.length)
    const content = fs.readFileSync(path.join(fullDir, f), 'utf8')
    let hint = name
    if (ext === '.md') {
      const m = content.match(/^description:\s*>?\s*\n?\s*(.+)/m)
      if (m) hint = m[1].trim().split(/[。.]/)[0]
    } else {
      const m = content.match(/^#\s*──\s*(.+?)(?:\s*─|$)/m)
      if (m) hint = m[1].trim()
    }
    const label = ext === '.zsh' ? name : ext === '.md' && dir.includes('agents') ? `@${name}` : `/${name}`
    return { value: name, label, hint }
  })
}

/**
 * 計算 names 中有多少個在目錄裡實際存在對應檔案
 *
 * @param {string} repoDir - 專案根目錄
 * @param {string} dir - 相對目錄
 * @param {string[]} names - 要檢查的名稱清單
 * @param {string} [ext='.md'] - 副檔名
 * @returns {number}
 */
export function countExisting(repoDir, dir, names, ext = '.md') {
  try {
    const files = new Set(
      fs.readdirSync(path.join(repoDir, dir))
        .filter(f => f.endsWith(ext))
        .map(f => f.slice(0, -ext.length))
    )
    return names.filter(n => files.has(n)).length
  } catch { return 0 }
}

/**
 * 計算目錄中指定副檔名的檔案數量
 *
 * @param {string} repoDir - 專案根目錄
 * @param {string} dir - 相對目錄
 * @param {string} [ext='.md'] - 副檔名
 * @returns {number}
 */
export function countFiles(repoDir, dir, ext = '.md') {
  try {
    return fs.readdirSync(path.join(repoDir, dir))
      .filter(f => f.endsWith(ext)).length
  } catch { return 0 }
}
