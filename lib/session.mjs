/**
 * Session 持久化
 *
 * 職責：
 *   保存/讀取每次 setup 的所有用戶選擇，下次跑時作為預設值。
 *   存放在 .cache/last-session.json（不汙染 config.json）。
 *
 * 保存內容：
 *   - targets, mode, org, repos, techCategories, techStacks, eccSelections, install
 *   - progress：斷點續裝進度（lastPhase, completedTargets, pendingTargets）
 */

import fs from 'fs'
import path from 'path'
import { getDirname } from './utils/paths.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '..')
const SESSION_PATH = path.join(REPO, '.cache', 'last-session.json')

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
 * 更新 session 進度（斷點續裝用）
 * @param {Object} progress - { lastPhase, completedTargets, pendingTargets }
 */
export function updateSessionProgress(progress) {
  const existing = loadSession()
  if (!existing) return
  saveSession({ ...existing, progress })
}

/**
 * 清除 session 進度（安裝完成時呼叫）
 */
export function clearSessionProgress() {
  const existing = loadSession()
  if (!existing?.progress) return
  const { progress, ...rest } = existing
  saveSession(rest)
}

/**
 * 檢查是否有未完成的安裝
 * @returns {{ hasIncomplete: boolean, lastPhase?: string, pendingTargets?: string[] }}
 */
export function checkIncompleteSession() {
  const session = loadSession()
  if (!session?.progress?.pendingTargets?.length) {
    return { hasIncomplete: false }
  }
  return {
    hasIncomplete: true,
    lastPhase: session.progress.lastPhase,
    completedTargets: session.progress.completedTargets || [],
    pendingTargets: session.progress.pendingTargets,
  }
}

/**
 * 取得 repos 快取路徑（給 scan.mjs 讀取）
 */
export const REPOS_CACHE_PATH = path.join(REPO, '.cache', 'repos.json')
