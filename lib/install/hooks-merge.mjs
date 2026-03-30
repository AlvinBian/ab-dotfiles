/**
 * Hooks 衝突檢測與合併
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { isEmpty } from 'lodash-es'
import fs from 'fs'
import path from 'path'
import { handleCancel } from '../ui/prompts.mjs'

/**
 * 檢查用戶 settings.json 中的 hooks 是否與即將安裝的 hooks 衝突
 *
 * @param {Object} newHooks - 即將安裝的 hooks 物件
 * @param {string} settingsPath - ~/.claude/settings.json 路徑
 * @returns {Promise<Object>} 合併後的 hooks，或 null 表示跳過
 */
export async function mergeHooksWithExisting(newHooks, settingsPath) {
  if (!fs.existsSync(settingsPath)) return newHooks

  let existing
  try {
    existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    return newHooks
  }

  if (!existing.hooks || isEmpty(existing.hooks)) return newHooks

  // 找出衝突：相同 event + matcher
  const conflicts = []
  for (const [event, matchers] of Object.entries(newHooks.hooks || {})) {
    for (const m of matchers) {
      const existingMatchers = existing.hooks[event] || []
      const dup = existingMatchers.find(em => em.matcher === m.matcher)
      if (dup) {
        conflicts.push({ event, matcher: m.matcher, existing: dup, incoming: m })
      }
    }
  }

  if (conflicts.length === 0) {
    // 無衝突，直接合併
    const merged = { ...newHooks, hooks: { ...newHooks.hooks } }
    for (const [event, matchers] of Object.entries(existing.hooks)) {
      if (!merged.hooks[event]) {
        merged.hooks[event] = matchers
      } else {
        // 保留用戶的不衝突 hooks
        for (const m of matchers) {
          const isDup = merged.hooks[event].some(nm => nm.matcher === m.matcher)
          if (!isDup) merged.hooks[event].push(m)
        }
      }
    }
    return merged
  }

  // 有衝突，讓用戶選擇
  const conflictLines = conflicts.map(c => `  ${c.event} [${c.matcher || '*'}]`).join('\n')
  p.log.warn(`偵測到 ${conflicts.length} 個 hooks 衝突：\n${conflictLines}`)

  const action = handleCancel(await p.select({
    message: 'Hooks 衝突處理',
    options: [
      { value: 'merge', label: '合併（保留雙方，衝突用新版覆蓋）', hint: '推薦' },
      { value: 'overwrite', label: '覆蓋（只用 ab-dotfiles 的 hooks）' },
      { value: 'skip', label: '跳過（保留現有 hooks 不變）' },
    ],
  }))

  if (action === 'skip') return null
  if (action === 'overwrite') return newHooks

  // merge：用新版覆蓋衝突，保留用戶獨有的
  const merged = { ...newHooks, hooks: { ...newHooks.hooks } }
  for (const [event, matchers] of Object.entries(existing.hooks)) {
    if (!merged.hooks[event]) {
      merged.hooks[event] = matchers
    } else {
      for (const m of matchers) {
        const isDup = merged.hooks[event].some(nm => nm.matcher === m.matcher)
        if (!isDup) merged.hooks[event].push(m)
      }
    }
  }
  return merged
}
