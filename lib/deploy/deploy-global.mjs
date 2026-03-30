/**
 * 全局配置部署 — settings.json 合併 + keybindings skip-if-exists
 */

import fs from 'fs'
import path from 'path'
import { union } from 'lodash-es'

const HOME = process.env.HOME
const CLAUDE_DIR = path.join(HOME, '.claude')

/**
 * 部署 settings.json（merge 策略）
 * 保留用戶已有的 permissions/hooks，追加新的
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
 * 部署 keybindings.json（skip if exists）
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
