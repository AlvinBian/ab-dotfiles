#!/usr/bin/env node
/**
 * hooks 互動式管理 — 啟用/停用個別 hook，不需重跑 setup
 */

import fs from 'fs'
import path from 'path'
import * as p from '@clack/prompts'
import { getDescription } from '../lib/config/descriptions.mjs'

const HOME = process.env.HOME
const HOOKS_PATH = path.join(HOME, '.claude', 'hooks.json')
const HOOKS_BACKUP = path.join(HOME, '.claude', 'hooks.json.bak')

function loadHooks() {
  if (!fs.existsSync(HOOKS_PATH)) return null
  return JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'))
}

function saveHooks(data) {
  // 備份
  if (fs.existsSync(HOOKS_PATH)) fs.copyFileSync(HOOKS_PATH, HOOKS_BACKUP)
  fs.writeFileSync(HOOKS_PATH, JSON.stringify(data, null, 2) + '\n')
}

async function main() {
  p.intro(' hooks 管理 ')

  const data = loadHooks()
  if (!data?.hooks) {
    p.log.error('找不到 ~/.claude/hooks.json')
    p.outro()
    return
  }

  // 展開所有 hooks 為平坦列表
  const allHooks = []
  for (const [event, matchers] of Object.entries(data.hooks)) {
    for (const m of matchers) {
      for (const h of (m.hooks || [m])) {
        const key = `${event}:${m.matcher || '*'}`
        const hookDesc = {
          'PostToolUse:Edit|Write': '自動格式化（prettier）',
          'PreToolUse:Edit|Write': '檔案保護',
          'PreToolUse:Bash': '危險命令攔截',
          'SessionStart:': 'Session 開始記錄',
          'SessionStart:compact': 'Context 壓縮提示',
          'Notification:': 'Claude 需要注意通知',
          'SubagentStop:': '子代理失敗偵測',
          'UserPromptSubmit:': '空提示檢查',
          'PostCompact:': '壓縮後恢復',
          'Stop:': '任務完成檢查',
        }
        const desc = hookDesc[key] || getDescription(key) || `${event} [${m.matcher || '*'}]`
        allHooks.push({
          event, matcher: m.matcher, hookObj: h,
          key, desc, type: h.type,
          enabled: !h._disabled,
        })
      }
    }
  }

  if (allHooks.length === 0) {
    p.log.info('沒有 hooks')
    p.outro()
    return
  }

  // 顯示當前狀態
  const statusLines = allHooks.map(h =>
    `  ${h.enabled ? '✅' : '❌'} ${h.desc}（${h.type}）`
  ).join('\n')
  p.log.info(`當前 hooks（${allHooks.length} 個）：\n${statusLines}`)

  // 選擇操作
  const action = await p.select({
    message: '操作',
    options: [
      { value: 'toggle', label: '啟用/停用 hooks' },
      { value: 'reset', label: '重置為預設（從備份恢復）' },
      { value: 'exit', label: '← 退出' },
    ],
  })

  if (p.isCancel(action) || action === 'exit') {
    p.outro()
    return
  }

  if (action === 'reset') {
    if (fs.existsSync(HOOKS_BACKUP)) {
      fs.copyFileSync(HOOKS_BACKUP, HOOKS_PATH)
      p.log.success('已從備份恢復 hooks.json')
    } else {
      p.log.warn('找不到備份檔案')
    }
    p.outro()
    return
  }

  // toggle: multiselect 選啟用的
  const choices = allHooks.map(h => ({
    value: h.key,
    label: h.desc,
    hint: h.type,
  }))
  const enabledKeys = allHooks.filter(h => h.enabled).map(h => h.key)

  const selected = await p.multiselect({
    message: '選擇要啟用的 hooks（Space 切換，Enter 確認）',
    options: choices,
    initialValues: enabledKeys,
  })

  if (p.isCancel(selected)) {
    p.outro('已取消')
    return
  }

  const selectedSet = new Set(selected)

  // 重建 hooks.json：用 _disabled 標記停用的
  for (const [event, matchers] of Object.entries(data.hooks)) {
    for (const m of matchers) {
      const key = `${event}:${m.matcher || '*'}`
      for (const h of (m.hooks || [m])) {
        if (selectedSet.has(key)) {
          delete h._disabled
        } else {
          h._disabled = true
        }
      }
    }
  }

  saveHooks(data)

  const enabledCount = selected.length
  const disabledCount = allHooks.length - enabledCount
  p.log.success(`已更新：${enabledCount} 個啟用 · ${disabledCount} 個停用`)
  p.outro('hooks 管理完成')
}

main().catch(e => { console.error(e.message); process.exit(1) })
