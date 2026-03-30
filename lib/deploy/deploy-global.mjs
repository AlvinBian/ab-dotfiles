/**
 * 全局配置部署 — settings.json 合併 + keybindings skip-if-exists
 *
 * 職責：
 *   將 ab-dotfiles 的全局配置安全地部署到 ~/.claude/，
 *   採用「合併」而非「覆蓋」策略，保留用戶已有的自訂設定。
 */

import fs from 'fs'
import { union } from 'lodash-es'
import path from 'path'

const HOME = process.env.HOME
const CLAUDE_DIR = path.join(HOME, '.claude')

/**
 * 部署 settings.json（merge 策略）
 *
 * 合併規則：
 *   - permissions.allow / deny：取聯集（去重），保留用戶已有的規則
 *   - model / effortLevel / env：只在未設定時寫入（不覆蓋用戶偏好）
 *   - autoMemoryEnabled：只在 undefined 時寫入
 *
 * @param {Object} template - 要合併的模板設定（來自 claude/settings-template.json）
 * @param {string[]} [template.permissions.allow] - 允許的 Bash/Read/Write 規則
 * @param {string[]} [template.permissions.deny] - 禁止的危險命令規則
 * @param {string} [template.model] - 預設 AI 模型（如 'sonnet'）
 * @param {string} [template.effortLevel] - 推理強度（如 'medium'）
 * @param {boolean} [template.autoMemoryEnabled] - 是否啟用自動記憶
 * @param {Object} [template.env] - 環境變數設定（如 MAX_THINKING_TOKENS）
 * @returns {{ path: string, permissionsAdded: number, isNew: boolean }}
 *   path: settings.json 的絕對路徑
 *   permissionsAdded: 新增的 allow 規則數量
 *   isNew: 是否為首次建立（原本不存在）
 */
export function deploySettings(template) {
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json')
  let existing = {}

  if (fs.existsSync(settingsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    } catch {}
  }

  const merged = { ...existing }

  // permissions: 合併（去重）
  merged.permissions = {
    allow: union(existing.permissions?.allow || [], template.permissions?.allow || []),
    deny: union(existing.permissions?.deny || [], template.permissions?.deny || []),
  }

  // model/effort/env: 只在未設定時寫入
  if (!existing.model) merged.model = template.model
  if (!existing.effortLevel) merged.effortLevel = template.effortLevel
  if (existing.autoMemoryEnabled === undefined) merged.autoMemoryEnabled = template.autoMemoryEnabled
  if (!existing.env) merged.env = template.env

  const isNew = !fs.existsSync(settingsPath)
  fs.mkdirSync(CLAUDE_DIR, { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n')

  return {
    path: settingsPath,
    permissionsAdded: (merged.permissions.allow.length - (existing.permissions?.allow?.length || 0)),
    isNew,
  }
}

/**
 * 部署 keybindings.json（skip-if-exists 策略）
 *
 * 若 ~/.claude/keybindings.json 已存在（用戶有自訂快捷鍵），
 * 則跳過不覆蓋，避免破壞用戶設定。
 * 只有在完全不存在時才寫入預設快捷鍵。
 *
 * @param {Object} template - 快捷鍵模板（key → command 映射）
 * @returns {{ path: string, skipped: boolean, reason?: string }}
 *   path: keybindings.json 的絕對路徑
 *   skipped: 是否因已存在而跳過
 *   reason: 跳過原因（只在 skipped=true 時存在）
 */
export function deployKeybindings(template) {
  const kbPath = path.join(CLAUDE_DIR, 'keybindings.json')

  if (fs.existsSync(kbPath)) {
    return { path: kbPath, skipped: true, reason: '已有自訂快捷鍵' }
  }

  fs.mkdirSync(CLAUDE_DIR, { recursive: true })
  fs.writeFileSync(kbPath, JSON.stringify(template, null, 2) + '\n')

  return { path: kbPath, skipped: false }
}
