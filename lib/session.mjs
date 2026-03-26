/**
 * Session 持久化
 *
 * 職責：
 *   保存/讀取每次 setup 的所有用戶選擇，下次跑時作為預設值。
 *   存放在 dist/cache/last-session.json（不汙染 config.json）。
 *
 * 保存內容：
 *   - targets：選擇的安裝目標
 *   - mode：安裝模式（auto/manual）
 *   - org：GitHub 組織
 *   - repos：選擇的倉庫列表
 *   - techCategories：選擇的技術棧分類
 *   - techStacks：選擇的具體技術棧
 *   - eccSelections：選擇的 ECC 項目
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const SESSION_PATH = path.join(REPO, 'dist', 'cache', 'last-session.json')

/**
 * 讀取上次的 session
 * @returns {Object|null} 上次的選擇，無則 null
 */
export function loadSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'))
  } catch {
    return null
  }
}

/**
 * 保存本次 session
 * @param {Object} data - 本次所有選擇
 */
export function saveSession(data) {
  const dir = path.dirname(SESSION_PATH)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    SESSION_PATH,
    JSON.stringify({ ...data, timestamp: new Date().toISOString() }, null, 2) + '\n'
  )
}

/**
 * 取得 repos 快取路徑（給 scan.mjs 讀取）
 */
export const REPOS_CACHE_PATH = path.join(REPO, 'dist', 'cache', 'repos.json')
