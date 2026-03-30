#!/usr/bin/env node
/**
 * 首次使用前備份原始配置 → ~/.ab-dotfiles-original/
 *
 * 備份：~/.zshrc、~/.claude/（整個目錄）
 * 只在首次執行，已有備份不覆蓋。
 */

import fs from 'fs'
import path from 'path'
import * as p from '@clack/prompts'

const HOME = process.env.HOME
const BACKUP_DIR = path.join(HOME, '.ab-dotfiles-original')

function backupItem(src, destName) {
  const dest = path.join(BACKUP_DIR, destName)
  if (!fs.existsSync(src)) return null

  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.cpSync(src, dest, { recursive: true })
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
  return destName
}

export function ensureOriginalBackup() {
  if (fs.existsSync(BACKUP_DIR)) return false // 已備份過

  fs.mkdirSync(BACKUP_DIR, { recursive: true })

  const backed = []
  const items = [
    [path.join(HOME, '.zshrc'), 'zshrc'],
    [path.join(HOME, '.zsh'), 'zsh'],
    [path.join(HOME, '.claude'), 'claude'],
    [path.join(HOME, '.zsh_history'), 'zsh_history'],
  ]

  for (const [src, name] of items) {
    const result = backupItem(src, name)
    if (result) backed.push(result)
  }

  // 記錄備份時間
  fs.writeFileSync(path.join(BACKUP_DIR, '.timestamp'), new Date().toISOString())

  return backed
}

// 直接執行時顯示結果
if (process.argv[1]?.endsWith('backup-original.mjs')) {
  const result = ensureOriginalBackup()
  if (result === false) {
    p.log.info(`原始備份已存在：${BACKUP_DIR}`)
  } else if (result.length > 0) {
    p.log.success(`已備份原始配置 → ${BACKUP_DIR}\n${result.map(r => `  ${r}`).join('\n')}`)
  } else {
    p.log.info('無需備份（沒有找到現有配置）')
  }
}
